import express from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { config } from "../config/env";
import db, { queryOne } from "../config/postgres";
import { log } from "../lib/logger";

export const JWT_SECRET = config.JWT_SECRET;
export const JWT_EXPIRY = config.JWT_EXPIRY;
export const IDLE_TIMEOUT_MS = config.IDLE_TIMEOUT_MS;

// Rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: "Too many attempts, please try again later" }
});
export const kioskLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  // Raised from 80: each kiosk punch consumes several limited calls
  // (webauthn options + login + check-in/check-out), so 80/5min throttled
  // normal branch-wide arrival bursts. Still caps abuse on the kiosk routes.
  max: 240,
  message: { error: "محاولات كثيرة على جهاز الحضور — انتظر قليلاً" }
});
// Narrow limiter for phone pairing: the pairing_pin is only 6 digits,
// so allow 10 attempts / 15 minutes per IP.
export const pairPhoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "محاولات تفعيل كثيرة — انتظر 15 دقيقة ثم أعد المحاولة" }
});
// Biometric enrollment is an admin action: authenticated + permission-checked, and capped
// so a stolen admin token cannot mass-overwrite employee credentials in a tight loop.
export const enrollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: "محاولات تسجيل بصمة كثيرة — انتظر قليلاً ثم أعد المحاولة" }
});

// Auth middleware
export const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
  try {
    // Verify the token still has a live session. Idle time is measured from the
    // last *real user action* reported by the browser, never from background
    // polling, so an unattended workstation cannot stay signed in indefinitely.
    const session = await queryOne(
      "SELECT auth_last_activity, created_at FROM sessions WHERE token = ? AND user_id = ?",
      token, decoded.id,
    ) as any;
    if (!session) return res.status(403).json({ error: "Token revoked" });
    const rawActivity = session.auth_last_activity || session.created_at;
    const activityMs = rawActivity instanceof Date
      ? rawActivity.getTime()
      : Date.parse(String(rawActivity ?? ""));
    const lastActivity = Number.isFinite(activityMs) ? activityMs : Date.now();
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return res.status(403).json({ error: "Token revoked", code: "SESSION_IDLE_TIMEOUT" });
    }
    const account = await queryOne("SELECT id, username, role, entity_id, employee_id FROM users WHERE id = ? AND status = 'active'", decoded.id);
    if (!account) return res.status(403).json({ error: "Account inactive" });
    (req as any).user = { ...decoded, ...account };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Endpoints an account may still reach while it runs on its factory-default
 * password. Everything else is refused so the default cannot be used to read
 * or change real data.
 */
export const PASSWORD_CHANGE_ALLOWLIST = [
  "/api/auth/change-password",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/activity",
];

/**
 * Blocks API traffic for accounts that still need a password change.
 *
 * The UI already gates on must_change_password, but the API has to enforce it
 * too: otherwise the known default password is enough to drive every endpoint
 * directly with curl.
 */
export const enforcePasswordChange = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const url = normalizeApiUrl(req.originalUrl || req.path);
  if (!url.startsWith("/api")) return next();
  if (PASSWORD_CHANGE_ALLOWLIST.some((p) => url === p)) return next();
  if (PASSWORD_CHANGE_ALLOWLIST.some((p) => url.startsWith(p + "/"))) return next();

  const user = (req as any).user;
  if (!user?.id) return next();

  try {
    const row = await queryOne("SELECT must_change_password FROM users WHERE id = ?", user.id) as any;
    if (row?.must_change_password === 1) {
      return res.status(403).json({
        error: "يجب تغيير كلمة المرور الافتراضية قبل استخدام النظام",
        code: "PASSWORD_CHANGE_REQUIRED",
        must_change_password: true,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Role-based access control middleware
export const requireRole = (...roles: string[]) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

// Express matches routes case-insensitively and tolerates a trailing slash, so path
// checks here and in the RBAC layer must normalise the same way — otherwise
// "PUT /API/Settings" reaches the handler while skipping auth and its permission rule.
export const normalizeApiUrl = (raw: string) => {
  let url = raw.split("?")[0].toLowerCase();
  while (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1);
  return url;
};

export const openApi = [
  "/api/auth/login",
  // Anonymous registration REQUEST only: rate-limited, validated, and it stages
  // a row for review. It never creates a user or a session — approval is a
  // separate admin-only route below.
  "/api/auth/signup-request",
  // Anonymous password-recovery REQUEST only: rate-limited, validated, and it
  // stages a row for an administrator. The response is the same whether or not
  // the account exists; no token or credential is ever issued here.
  "/api/auth/password-reset-request",
  // The federated login carries a Cloudflare Access assertion instead of a local
  // token, so it has to be reachable before any session exists. Its own signature
  // check is the gate — see server/lib/cloudflare-access.ts.
  "/api/auth/sso-login",
  "/api/auth/sso-config",
  "/api/auth/bootstrap-status",
  "/api/kiosk",
  "/api/attendance/pair-phone",
  "/api/attendance/geo-validate",
  "/api/attendance/check-in",
  "/api/attendance/check-out",
  // Only the kiosk *login* leg is anonymous: the branch tablet proves possession of a
  // stored credential. Enrollment (/api/webauthn/register*) is an administrative action
  // and must carry a token — see the BIOMETRIC_ENROLL rule in ROUTE_PERMISSIONS below.
  "/api/webauthn/login/options",
  "/api/webauthn/login",
  // Liveness/readiness probes. Anonymous by design: orchestrators and load
  // balancers poll these before any credential exists, and they expose only
  // coarse status — never schema, row counts, or configuration.
  "/api/health",
  "/api/ready",
  // Anonymous, redacted frontend crash reports. No auth, no identity, no read route.
  "/api/client-errors",
];

// --- C4: central RBAC policy (single source of truth) ---
// Mirrors the screen matrix the UI already enforces (src/App.tsx allow(), lines 205-210).
// The server enforces exactly what the interface assumes — no new policy.
export const PERM = {
  ESS: "ess.self_service",
  SETTINGS_MANAGE: "settings.manage",
  EMPLOYEES_MANAGE: "employees.manage",
  ALLOWANCE_TYPES_MANAGE: "allowance_types.manage",
  BRANCHES_MANAGE: "branches.manage",
  DEPARTMENTS_MANAGE: "departments.manage",
  PAYROLL_RUN: "payroll.run",
  ATTENDANCE_DEVICES_MANAGE: "attendance_devices.manage",
  AUDIT_LOGS_VIEW: "audit_logs.view",
  REPORTS_VIEW: "reports.view",
  // Dashboard aggregates (/api/stats, /api/analytics/*): every role that renders
  // the dashboard screen, so branch_manager keeps its scoped counts.
  DASHBOARD_VIEW: "dashboard.view",
  WPS_VIEW: "wps.view",
  EXCEL_EXPORT: "excel.export",
  SAUDI_COMPLIANCE: "saudi.compliance",
  ADMIN_MANAGE: "admin.manage",
  BACKUP_MANAGE: "backup.manage",
  ENTITIES_MANAGE: "entities.manage",
  AUTH_REGISTER: "auth.register",
  // Biometric/WebAuthn *enrollment* is an administrative write (it replaces an employee's
  // stored credential) — not a self-service action and never an anonymous one.
  BIOMETRIC_ENROLL: "biometric.enroll",
  // Writes that land directly on the payroll (penalty/deduction lines) — finance may see
  // payroll screens but must not decide disciplinary or traffic deductions.
  PAYROLL_DEDUCTIONS_APPLY: "payroll.deductions.apply",
  BUDGETS_MANAGE: "budgets.manage",
  // --- cycle 4: keys for the write routes that the table below did not classify yet ---
  // Each one mirrors the role list of the screen that issues the call, named after the
  // resource rather than the screen id so it can be reused as the UI grows.
  BONUSES_MANAGE: "bonuses.manage", // bonuses screen: admin, hr_manager, finance
  LOANS_MANAGE: "loans.manage", // loans screen: admin, hr_manager, finance
  EXPENSES_MANAGE: "expenses.manage", // expenses screen: admin, hr_manager, finance
  LEAVES_MANAGE: "leaves.manage", // leaves screen + manager_inbox approvals
  ATTENDANCE_MANAGE: "attendance.manage", // attendance screen (manual punch edits)
  // Branch presence policy/scope/schedule/decision writes: admin + HR only.
  // branch_manager keeps ATTENDANCE_MANAGE (gate/reports/confirm), not this key.
  PRESENCE_MANAGE: "presence.manage",
  WORKFLOWS_MANAGE: "workflows.manage", // approval_workflows + manager_inbox screens
  DOCUMENTS_MANAGE: "documents.manage", // employees & employee_documents screens
  HR_OPERATIONS_MANAGE: "hr_operations.manage", // HR-only screens (fleet, medical, visas, ...)
  AI_TOOLS_USE: "ai.tools.use", // ai_consultant & ai_letters screens
  ALERTS_MANAGE: "alerts.manage", // expiry-alert hub, opened from the header bell
// Salary Structure Engine
  SALARY_STRUCTURES_MANAGE: "salary_structures.manage", // admin, hr_manager, finance (reads), admin, hr_manager (writes)
  SALARY_COMPONENTS_MANAGE: "salary_components.manage", // admin, hr_manager
  PAYROLL_SLIPS_MANAGE: "payroll_slips.manage", // admin, hr_manager, finance
  // مركز النماذج والطباعة: إصدار المستندات وتحرير القوالب
  FORMS_DOCUMENTS_ISSUE: "forms.documents.issue", // admin, hr_manager, branch_manager
  FORMS_TEMPLATES_MANAGE: "forms.templates.manage", // admin, hr_manager
  // Observability: the server's own request counters and timings.
  METRICS_VIEW: "metrics.view", // admin, hr_manager
  // دورة الزيادة السنوية: قراءة للمديرين والمالية، إنشاء للـHR/المدير،
  // واعتماد بخطوات لكل من المشرف والمدير والمالية والموارد البشرية.
  ANNUAL_CYCLE_VIEW: "annual_cycle.view",
  ANNUAL_CYCLE_MANAGE: "annual_cycle.manage",
  ANNUAL_CYCLE_APPROVE: "annual_cycle.approve",
} as const;

// role -> permission keys ("*" = every screen: admin/hr_manager own all screens)
export const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set<string>(["*"]),
  hr_manager: new Set<string>(["*"]),
  finance: new Set<string>([
    PERM.ALLOWANCE_TYPES_MANAGE,
    PERM.PAYROLL_RUN,
    PERM.REPORTS_VIEW,
    PERM.DASHBOARD_VIEW,
    PERM.WPS_VIEW,
    PERM.EXCEL_EXPORT,
    PERM.SAUDI_COMPLIANCE,
    PERM.AUDIT_LOGS_VIEW, // DashboardView reads recent activity for every dashboard role
    PERM.BUDGETS_MANAGE, // budgeting screen: admin, hr_manager, finance
    PERM.BONUSES_MANAGE, // bonuses screen: admin, hr_manager, finance
    PERM.LOANS_MANAGE, // loans screen: admin, hr_manager, finance
    PERM.EXPENSES_MANAGE, // expenses screen: admin, hr_manager, finance
    PERM.ALERTS_MANAGE, // expiry-alert hub is reached from the bell every role renders
    PERM.SALARY_STRUCTURES_MANAGE, // salary structures read
    PERM.SALARY_COMPONENTS_MANAGE, // salary components read
    PERM.PAYROLL_SLIPS_MANAGE, // payroll slips read
    PERM.ANNUAL_CYCLE_VIEW, // متابعة قرارات الزيادة التي يعتمدها قسم المالية
    PERM.ANNUAL_CYCLE_APPROVE, // خطوة المالية في سلسلة الاعتماد
  ]),
  branch_manager: new Set<string>([
    PERM.EMPLOYEES_MANAGE,
    PERM.DASHBOARD_VIEW, // dashboard screen: scoped stats/analytics for the branch
    PERM.ATTENDANCE_DEVICES_MANAGE,
    PERM.AUDIT_LOGS_VIEW, // DashboardView reads recent activity for every dashboard role
    PERM.BIOMETRIC_ENROLL, // attendance_kiosk screen: admin, hr_manager, branch_manager
    PERM.ATTENDANCE_MANAGE, // attendance screen: admin, hr_manager, branch_manager
    PERM.LEAVES_MANAGE, // leaves + manager_inbox screens: admin, hr_manager, branch_manager
    PERM.WORKFLOWS_MANAGE, // approval_workflows + manager_inbox screens
    PERM.DOCUMENTS_MANAGE, // employees screen uploads attachments (EmployeesView)
    PERM.ALERTS_MANAGE, // expiry-alert hub is reached from the bell every role renders
    PERM.FORMS_DOCUMENTS_ISSUE, // مركز النماذج: إصدار الخطابات والشهادات لموظفي الفرع
    PERM.ANNUAL_CYCLE_VIEW, // تنبيهات وتقييمات موظفي الفرع
    PERM.ANNUAL_CYCLE_MANAGE, // إنشاء التقييم وقرار الزيادة لموظفي الفرع
    PERM.ANNUAL_CYCLE_APPROVE, // خطوة المشرف في سلسلة الاعتماد
  ]),
  employee_ess: new Set<string>([PERM.ESS]),
};

// (method + path pattern) -> permission key. method "*" = any method.
export const ROUTE_PERMISSIONS: Array<{ method: string; pattern: RegExp; perm: string }> = [
  // settings screen: admin, hr_manager
  { method: "PUT", pattern: /^\/api\/settings$/, perm: PERM.SETTINGS_MANAGE },
  // employees screen: admin, hr_manager, branch_manager
  { method: "POST", pattern: /^\/api\/employees$/, perm: PERM.EMPLOYEES_MANAGE },
  { method: "PUT", pattern: /^\/api\/employees\/[^/]+$/, perm: PERM.EMPLOYEES_MANAGE },
  // Ending service disables the account and removes the employee from future
  // payroll runs — an HR management act, never reachable by employee_ess.
  { method: "POST", pattern: /^\/api\/employees\/[^/]+\/end-service$/, perm: PERM.EMPLOYEES_MANAGE },
  // Kiosk PIN issuance is a credential change, not a normal profile edit.
  { method: "PUT", pattern: /^\/api\/employees\/[^/]+\/attendance-pin$/, perm: PERM.EMPLOYEES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/employees\/[^/]+$/, perm: PERM.EMPLOYEES_MANAGE },
  // allowances screen: admin, hr_manager, finance
  { method: "POST", pattern: /^\/api\/allowance-types$/, perm: PERM.ALLOWANCE_TYPES_MANAGE },
  { method: "PUT", pattern: /^\/api\/allowance-types\/[^/]+$/, perm: PERM.ALLOWANCE_TYPES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/allowance-types\/[^/]+$/, perm: PERM.ALLOWANCE_TYPES_MANAGE },
  // branches screen: admin, hr_manager
  { method: "POST", pattern: /^\/api\/branches$/, perm: PERM.BRANCHES_MANAGE },
  { method: "PUT", pattern: /^\/api\/branches\/[^/]+$/, perm: PERM.BRANCHES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/branches\/[^/]+$/, perm: PERM.BRANCHES_MANAGE },
  // departments screen: admin, hr_manager
  { method: "POST", pattern: /^\/api\/departments$/, perm: PERM.DEPARTMENTS_MANAGE },
  { method: "PUT", pattern: /^\/api\/departments\/[^/]+$/, perm: PERM.DEPARTMENTS_MANAGE },
  { method: "DELETE", pattern: /^\/api\/departments\/[^/]+$/, perm: PERM.DEPARTMENTS_MANAGE },
  // payroll screen: admin, hr_manager, finance
  { method: "POST", pattern: /^\/api\/payroll\/(generate|lock|sync-attendance|batch|calculate|approve)$/, perm: PERM.PAYROLL_RUN },
  { method: "GET", pattern: /^\/api\/payroll\/preflight$/, perm: PERM.PAYROLL_RUN },
  { method: "POST", pattern: /^\/api\/payroll\/recalculate\/(preview|apply)$/, perm: PERM.PAYROLL_RUN },
  // off-cycle salary lines + locked-period corrections + tax exemptions: payroll documents
  { method: "*", pattern: /^\/api\/additional-salaries(\/.*)?$/, perm: PERM.PAYROLL_RUN },
  { method: "POST", pattern: /^\/api\/payroll\/correct$/, perm: PERM.PAYROLL_RUN },
  { method: "GET", pattern: /^\/api\/payroll\/corrections$/, perm: PERM.PAYROLL_RUN },
  { method: "*", pattern: /^\/api\/tax-exemptions(\/.*)?$/, perm: PERM.PAYROLL_RUN },
  { method: "GET", pattern: /^\/api\/employees\/[^/]+\/eos$/, perm: PERM.REPORTS_VIEW },
  // attendance devices (admin ops): attendance_kiosk screen -> admin, hr_manager, branch_manager.
  // GET carries device_token + pairing_pin (kiosk credentials), so it is gated
  // too — never left as an unrestricted read for finance or any other role.
  { method: "GET", pattern: /^\/api\/attendance\/devices(\/.*)?$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
  { method: "POST", pattern: /^\/api\/attendance\/devices(\/.*)?$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/attendance\/devices\/[^/]+$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
  // suspend/resume a kiosk without deleting it
  { method: "PATCH", pattern: /^\/api\/attendance\/devices\/[^/]+$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
  // biometric enrollment — replaces an employee's stored credential, so it is an
  // administrative action. Anonymous kiosk traffic stops at the login legs, which are
  // deliberately absent from this table (openApi routes carry no req.user).
  { method: "POST", pattern: /^\/api\/webauthn\/register(\/.*)?$/, perm: PERM.BIOMETRIC_ENROLL },
  { method: "POST", pattern: /^\/api\/biometric\/register$/, perm: PERM.BIOMETRIC_ENROLL },
  // writes that post penalties/deductions straight onto the payroll
  { method: "POST", pattern: /^\/api\/disciplinary\/violations\/[^/]+\/apply-payroll$/, perm: PERM.PAYROLL_DEDUCTIONS_APPLY },
  { method: "POST", pattern: /^\/api\/fleet\/traffic-fines\/[^/]+\/deduct$/, perm: PERM.PAYROLL_DEDUCTIONS_APPLY },
  // budgeting screen: admin, hr_manager, finance
  { method: "PUT", pattern: /^\/api\/budgets\/departments\/[^/]+$/, perm: PERM.BUDGETS_MANAGE },
  // audit trail (audit screen + dashboard widget readers)
  { method: "GET", pattern: /^\/api\/audit-logs$/, perm: PERM.AUDIT_LOGS_VIEW },
  // server metrics: request counters, error counts and timings per route
  { method: "GET", pattern: /^\/api\/metrics$/, perm: PERM.METRICS_VIEW },
  // financial / compliance data
  { method: "GET", pattern: /^\/api\/reports(\/.*)?$/, perm: PERM.REPORTS_VIEW },
  // dashboard screen: admin, hr_manager, finance, branch_manager (DashboardView, ReportsView)
  { method: "GET", pattern: /^\/api\/stats$/, perm: PERM.DASHBOARD_VIEW },
  { method: "GET", pattern: /^\/api\/analytics(\/.*)?$/, perm: PERM.DASHBOARD_VIEW },
  // executive_board screen: admin, hr_manager; finance keeps API parity with the
  // consolidated report (REPORTS_VIEW) even though the screen is not in its sidebar.
  { method: "GET", pattern: /^\/api\/executive(\/.*)?$/, perm: PERM.REPORTS_VIEW },
  { method: "GET", pattern: /^\/api\/provisions(\/.*)?$/, perm: PERM.REPORTS_VIEW },
  { method: "GET", pattern: /^\/api\/wps(\/.*)?$/, perm: PERM.WPS_VIEW },
  { method: "GET", pattern: /^\/api\/excel(\/.*)?$/, perm: PERM.EXCEL_EXPORT },
  { method: "*", pattern: /^\/api\/saudi(\/.*)?$/, perm: PERM.SAUDI_COMPLIANCE },
  // system administration (unchanged: admin only)
  { method: "*", pattern: /^\/api\/admin(\/.*)?$/, perm: PERM.ADMIN_MANAGE },
  // identity binding: deciding which federated address reaches which account is
  // an administrative act, so it sits with the other admin-only rules.
  { method: "GET", pattern: /^\/api\/auth\/users$/, perm: PERM.ADMIN_MANAGE },
  { method: "PUT", pattern: /^\/api\/auth\/users\/[^/]+\/email$/, perm: PERM.ADMIN_MANAGE },
  // Role, status and credential changes decide who can reach the system at all.
  { method: "PUT", pattern: /^\/api\/auth\/users\/[^/]+$/, perm: PERM.ADMIN_MANAGE },
  { method: "PUT", pattern: /^\/api\/auth\/users\/[^/]+\/password$/, perm: PERM.ADMIN_MANAGE },
  { method: "*", pattern: /^\/api\/backup(\/.*)?$/, perm: PERM.BACKUP_MANAGE },
  { method: "POST", pattern: /^\/api\/entities$/, perm: PERM.ENTITIES_MANAGE },
  { method: "PUT", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
  { method: "PUT", pattern: /^\/api\/countries\/[^/]+\/rules$/, perm: PERM.ADMIN_MANAGE },
  { method: "POST", pattern: /^\/api\/auth\/register$/, perm: PERM.AUTH_REGISTER },
  // Registration requests: only an administrator may review or decide them.
  { method: "GET", pattern: /^\/api\/auth\/signup-requests$/, perm: PERM.ADMIN_MANAGE },
  { method: "POST", pattern: /^\/api\/auth\/signup-requests\/[^/]+\/(approve|reject)$/, perm: PERM.ADMIN_MANAGE },
  // Password-recovery requests: only an administrator may review or close them.
  { method: "GET", pattern: /^\/api\/auth\/password-reset-requests$/, perm: PERM.ADMIN_MANAGE },
  { method: "POST", pattern: /^\/api\/auth\/password-reset-requests\/[^/]+\/(resolve|reject)$/, perm: PERM.ADMIN_MANAGE },

  // --- cycle 4: the remaining write routes, classified from the screen matrix ---
  // Every rule below is derived from the component that issues the call and the screen id
  // that renders it (src/App.tsx allow(), lines 205-210). A route whose caller could not be
  // determined in src/** is deliberately left out of this table so it keeps the pre-cycle
  // behaviour: allowed for operational roles, denied for employee_ess, and still reported
  // by the boot-time coverage scan.
  // bonuses screen: admin, hr_manager, finance (src/components/BonusesView.tsx:38,49)
  { method: "POST", pattern: /^\/api\/bonuses-penalties$/, perm: PERM.BONUSES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/bonuses-penalties\/[^/]+$/, perm: PERM.BONUSES_MANAGE },
  // loans screen: admin, hr_manager, finance (src/components/LoansView.tsx:48)
  { method: "POST", pattern: /^\/api\/loans$/, perm: PERM.LOANS_MANAGE },
  { method: "PUT", pattern: /^\/api\/loans\/[^/]+\/status$/, perm: PERM.LOANS_MANAGE },
  { method: "DELETE", pattern: /^\/api\/loans\/[^/]+$/, perm: PERM.LOANS_MANAGE },
  // expenses screen: admin, hr_manager, finance (src/components/ExpensesView.tsx:40)
  { method: "POST", pattern: /^\/api\/expenses$/, perm: PERM.EXPENSES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/expenses\/[^/]+$/, perm: PERM.EXPENSES_MANAGE },
  { method: "PATCH", pattern: /^\/api\/expenses\/[^/]+\/status$/, perm: PERM.EXPENSES_MANAGE },
  // attendance screen manual punch edits: admin, hr_manager, branch_manager
  // (src/components/AttendanceView.tsx:188). The kiosk legs stay in openApi untouched.
  { method: "POST", pattern: /^\/api\/attendance$/, perm: PERM.ATTENDANCE_MANAGE },

  // --- Branch presence ---
  // Gate/checkout/self and supervisor reads stay with ATTENDANCE_MANAGE, which
  // branch_manager owns. The ESS allowlists below carve out the self-service
  // subset; handlers additionally restrict rows to the caller's own identity.
  { method: "POST", pattern: /^\/api\/presence\/gate$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/recheck$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/checkout$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/me$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/users$/, perm: PERM.PRESENCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/policies$/, perm: PERM.PRESENCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/policies$/, perm: PERM.PRESENCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/scopes$/, perm: PERM.PRESENCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/scopes$/, perm: PERM.PRESENCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/schedules$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/schedules$/, perm: PERM.PRESENCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/exit-request$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/exit-requests$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/violations$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/reports\/(hours|violations)(\/csv)?$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/violations\/[^/]+\/confirm$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/violations\/[^/]+\/decide$/, perm: PERM.PRESENCE_MANAGE },
  { method: "GET", pattern: /^\/api\/presence\/drift$/, perm: PERM.ATTENDANCE_MANAGE },
  { method: "POST", pattern: /^\/api\/presence\/drift\/[^/]+\/ack$/, perm: PERM.PRESENCE_MANAGE },
  // leaves screen + manager_inbox approval: admin, hr_manager, branch_manager
  // (LeavesView.tsx:41,53 and ManagerInboxView.tsx:21)
  { method: "POST", pattern: /^\/api\/leaves$/, perm: PERM.LEAVES_MANAGE },
  { method: "PUT", pattern: /^\/api\/leaves\/[^/]+$/, perm: PERM.LEAVES_MANAGE },
  // approval_workflows + manager_inbox: admin, hr_manager, branch_manager
  // (ApprovalWorkflowsView.tsx:85,58 and ManagerInboxView.tsx:25)
  { method: "POST", pattern: /^\/api\/workflow-requests$/, perm: PERM.WORKFLOWS_MANAGE },
  { method: "POST", pattern: /^\/api\/workflow-requests\/[^/]+\/action$/, perm: PERM.WORKFLOWS_MANAGE },
  // documents are attached from the employees / employee_documents screens, which
  // branch_manager also owns (EmployeesView.tsx:104) — admin, hr_manager, branch_manager
  { method: "POST", pattern: /^\/api\/documents$/, perm: PERM.DOCUMENTS_MANAGE },
  { method: "DELETE", pattern: /^\/api\/documents\/[^/]+$/, perm: PERM.DOCUMENTS_MANAGE },
  // employee_documents: the richer upload flow (file validation, size limits).
  { method: "POST", pattern: /^\/api\/employee-documents$/, perm: PERM.DOCUMENTS_MANAGE },
  { method: "DELETE", pattern: /^\/api\/employee-documents\/[^/]+$/, perm: PERM.DOCUMENTS_MANAGE },
  // expiry-alert hub: opened from the header bell, which every signed-in operational role
  // renders (src/App.tsx:511 -> ExpiryAlertsModal.tsx:78). employee_ess stays denied here,
  // exactly as it was while the route was unclassified.
  { method: "GET", pattern: /^\/api\/alerts\/expiries$/, perm: PERM.ALERTS_MANAGE },
  { method: "POST", pattern: /^\/api\/alerts\/send-reminder$/, perm: PERM.ALERTS_MANAGE },
  // AI studio screens: admin, hr_manager (LaborLawAiConsultantView.tsx:50)
  { method: "POST", pattern: /^\/api\/ai\/labor-law-consultant$/, perm: PERM.AI_TOOLS_USE },
  // Reports Hub: catalog, scoped custom builder and the aggregate-only AI
  // assistant. admin/hr_manager only — finance keeps its existing six reports
  // but does not gain a new bulk export or the external model.
  { method: "GET", pattern: /^\/api\/reports-hub\/catalog$/, perm: PERM.AI_TOOLS_USE },
  { method: "POST", pattern: /^\/api\/reports-hub\/custom$/, perm: PERM.AI_TOOLS_USE },
  { method: "GET", pattern: /^\/api\/reports-hub\/custom\/csv$/, perm: PERM.AI_TOOLS_USE },
  { method: "POST", pattern: /^\/api\/reports-hub\/ai\/ask$/, perm: PERM.AI_TOOLS_USE },
  // HR-only screens: admin, hr_manager. Each group below exists in a nav screen that neither
  // finance's nor branch_manager's allow-list contains (src/App.tsx:209-210).
  { method: "POST", pattern: /^\/api\/(appraisals|assets|clearances|disciplinary\/violations|ewa\/withdrawals|exit-interviews|flight-tickets|flexible\/shifts|grievances|hearings|promotions|smart-assets|telework\/permits|transfers|visas|warnings|work-injuries)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(fleet\/vehicles|fleet\/traffic-fines|qiwa\/contracts|qiwa\/draft-from-employees)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(hse\/inspections|hse\/ppe-logs|medical\/dependents|medical\/policies|medical\/insurance-companies|medical\/coverage-categories|health-certificates)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  // Unified Excel/CSV importer (preview parses only; commit writes in one tx)
  { method: "POST", pattern: /^\/api\/import\/(preview|commit)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(recruitment\/candidates|recruitment\/jobs|talent\/assessments|talent\/succession)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(kudos(\/[^/]+\/like)?|rewards\/redeem)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/overtime(\/[^/]+\/approve)?$/, perm: PERM.HR_OPERATIONS_MANAGE },
  // Training is an HR decision: courses, enrollments and appraisal-driven recommendations.
  { method: "POST", pattern: /^\/api\/training\/(courses|enrollments|recommend-from-appraisal)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/training\/enrollments\/[^/]+\/complete$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "DELETE", pattern: /^\/api\/(fleet\/vehicles|medical\/dependents|medical\/insurance-companies|medical\/coverage-categories|overtime|talent\/succession|health-certificates)\/[^/]+$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "PUT", pattern: /^\/api\/(health-certificates|medical\/insurance-companies|medical\/coverage-categories)\/[^/]+$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "PUT", pattern: /^\/api\/(assets|smart-assets)\/[^/]+\/assign$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "PUT", pattern: /^\/api\/(clearances\/[^/]+\/department|grievances\/[^/]+\/status|policies\/ramadan)$/, perm: PERM.HR_OPERATIONS_MANAGE },

  // --- Salary Structure Engine & Payroll Slips (admin, hr_manager, finance) ---
  { method: "GET", pattern: /^\/api\/payroll\/structures$/, perm: PERM.SALARY_STRUCTURES_MANAGE },
  { method: "GET", pattern: /^\/api\/payroll\/structures\/[^/]+$/, perm: PERM.SALARY_STRUCTURES_MANAGE },
  { method: "POST", pattern: /^\/api\/payroll\/structures$/, perm: PERM.SALARY_STRUCTURES_MANAGE },
  { method: "PUT", pattern: /^\/api\/payroll\/structures\/[^/]+$/, perm: PERM.SALARY_STRUCTURES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/payroll\/structures\/[^/]+$/, perm: PERM.SALARY_STRUCTURES_MANAGE },
  { method: "GET", pattern: /^\/api\/payroll\/components$/, perm: PERM.SALARY_COMPONENTS_MANAGE },
  { method: "POST", pattern: /^\/api\/payroll\/components$/, perm: PERM.SALARY_COMPONENTS_MANAGE },
  { method: "PUT", pattern: /^\/api\/payroll\/components\/[^/]+$/, perm: PERM.SALARY_COMPONENTS_MANAGE },
  { method: "POST", pattern: /^\/api\/payroll\/calculate-slip$/, perm: PERM.PAYROLL_SLIPS_MANAGE },
  { method: "POST", pattern: /^\/api\/payroll\/save-slip$/, perm: PERM.PAYROLL_SLIPS_MANAGE },
  { method: "GET", pattern: /^\/api\/payroll\/slips$/, perm: PERM.PAYROLL_SLIPS_MANAGE },
  { method: "GET", pattern: /^\/api\/payroll\/slips\/[^/]+$/, perm: PERM.PAYROLL_SLIPS_MANAGE },
  { method: "POST", pattern: /^\/api\/payroll\/slips\/[^/]+\/approve$/, perm: PERM.PAYROLL_SLIPS_MANAGE },
  { method: "POST", pattern: /^\/api\/payroll\/slips\/[^/]+\/cancel$/, perm: PERM.PAYROLL_SLIPS_MANAGE },
  { method: "GET", pattern: /^\/api\/payroll\/slips\/employee\/[^/]+$/, perm: PERM.PAYROLL_SLIPS_MANAGE },

  // --- System administration (admin only) ---
  { method: "POST", pattern: /^\/api\/auth\/register$/, perm: PERM.AUTH_REGISTER },
  { method: "*", pattern: /^\/api\/admin(\/.*)?$/, perm: PERM.ADMIN_MANAGE },
  { method: "*", pattern: /^\/api\/backup(\/.*)?$/, perm: PERM.BACKUP_MANAGE },
  { method: "PUT", pattern: /^\/api\/countries\/[^/]+\/rules$/, perm: PERM.ADMIN_MANAGE },
  { method: "POST", pattern: /^\/api\/entities$/, perm: PERM.ENTITIES_MANAGE },
  { method: "PUT", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },

  // --- دورة الزيادة السنوية (Annual increase cycle) ---
  // بوابة الموظف تقرأ بياناتها وحدها عبر /me؛ بقية الشاشات للمديرين والمالية.
  { method: "GET", pattern: /^\/api\/annual\/me$/, perm: PERM.ESS },
  { method: "GET", pattern: /^\/api\/annual\/(overview|reminders|reviews|increases|audit)$/, perm: PERM.ANNUAL_CYCLE_VIEW },
  { method: "POST", pattern: /^\/api\/annual\/(reviews|increases)$/, perm: PERM.ANNUAL_CYCLE_MANAGE },
  { method: "POST", pattern: /^\/api\/annual\/increases\/[^/]+\/approve$/, perm: PERM.ANNUAL_CYCLE_APPROVE },
  // تشغيل المجدّد يدوياً عملية إدارية، وليست ضمن صلاحيات المديرين.
  { method: "POST", pattern: /^\/api\/annual\/scheduler\/run$/, perm: PERM.ADMIN_MANAGE },

  // --- مركز النماذج والطباعة (Forms & Print Center) ---
  // القراءة والإصدار: admin, hr_manager, branch_manager. تعديل القوالب نفسها
  // أكبر من إصدار المستند، فله صلاحية منفصلة لا تعطى لمدير الفرع.
  { method: "GET", pattern: /^\/api\/forms(\/.*)?$/, perm: PERM.FORMS_DOCUMENTS_ISSUE },
  { method: "POST", pattern: /^\/api\/forms\/templates$/, perm: PERM.FORMS_TEMPLATES_MANAGE },
  { method: "PUT", pattern: /^\/api\/forms\/templates\/[^/]+$/, perm: PERM.FORMS_TEMPLATES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/forms\/templates\/[^/]+$/, perm: PERM.FORMS_TEMPLATES_MANAGE },
  { method: "POST", pattern: /^\/api\/forms\/documents(\/.*)?$/, perm: PERM.FORMS_DOCUMENTS_ISSUE },
  { method: "POST", pattern: /^\/api\/forms\/preview$/, perm: PERM.FORMS_DOCUMENTS_ISSUE },
];

// The only read routes employee_ess may call (minimal surface for the ESS shell).
export const ESS_READ_ALLOWLIST: Array<{ pattern: RegExp }> = [
  { pattern: /^\/api\/auth\/me$/ },
  { pattern: /^\/api\/settings$/ },
  { pattern: /^\/api\/notifications$/ },
  { pattern: /^\/api\/employees$/ },           // own record (filtered in handler)
  { pattern: /^\/api\/payroll/, },            // own payslips (month/year params)
  { pattern: /^\/api\/leaves/, },             // own leaves
  { pattern: /^\/api\/documents\/[^/]+$/, },  // own documents
  { pattern: /^\/api\/attendance\/logs/, },   // own attendance
  { pattern: /^\/api\/salary-certificates/, }, // own certificates
  { pattern: /^\/api\/ess\/requests$/ },      // own self-service requests (loans/leaves/grievances/suggestions)
  { pattern: /^\/api\/annual\/me$/ },         // own annual review / increase decision
  // Branch presence: self-only reads. Policies, scopes, users, drift and the
  // violation decision chain are deliberately absent from this allowlist.
  { pattern: /^\/api\/presence\/me$/ },
  { pattern: /^\/api\/presence\/schedules$/ },
  { pattern: /^\/api\/presence\/exit-requests$/ },
  { pattern: /^\/api\/presence\/violations$/ },
  { pattern: /^\/api\/presence\/reports\/(hours|violations)(\/csv)?$/ },
];

// --- C4: operational write routes (explicit classification) ---
// The routes below are deliberately operational: any signed-in role other than employee_ess
// may call them, employee_ess stays denied. This replicates exactly what the unclassified
// write path already did, but makes the policy explicit and removes them from the boot-time
// coverage scan. None concern self-service (those live in ESS_WRITE_ALLOWLIST).
export const ESS_WRITE_ALLOWLIST: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/auth\/activity$/ },
  { method: "POST", pattern: /^\/api\/auth\/logout$/ },
  { method: "PUT", pattern: /^\/api\/auth\/change-password$/ },
  { method: "PUT", pattern: /^\/api\/notifications\/read-all$/ },
  { method: "PUT", pattern: /^\/api\/notifications\/[^/]+\/read$/ },
  { method: "POST", pattern: /^\/api\/salary-certificates$/ }, // ESSView -> SalaryCertificateModal (شهادة تعريف بالراتب)
  { method: "POST", pattern: /^\/api\/visas\/exit-reentry$/ }, // ESSView tab "طلب تأشيرة خروج وعودة"
  { method: "POST", pattern: /^\/api\/ess\/requests$/ }, // ESSView tab "طلباتي" (سلفة/إجازة/شكوى/مقترح/تطوير سير العمل)
  { method: "POST", pattern: /^\/api\/push-tokens$/ }, // تسجيل رمز جهاز الموظف للتنبيهات الفورية (بدون معرّف مستخدم من الجسم)
  { method: "POST", pattern: /^\/api\/copilot\/chat$/ }, // floating AI launcher is rendered for every role (read-only on the server)
  // Presence self-service: the handler always derives the employee from req.user.
  { method: "POST", pattern: /^\/api\/presence\/gate$/ },
  { method: "POST", pattern: /^\/api\/presence\/recheck$/ },
  { method: "POST", pattern: /^\/api\/presence\/checkout$/ },
  { method: "POST", pattern: /^\/api\/presence\/exit-request$/ },
];

export const OPERATIONAL_WRITE_ALLOWLIST: Array<{ method: string; pattern: RegExp }> = [
  { method: "DELETE", pattern: /^\/api\/clearances\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/disciplinary\/violations\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/flight-tickets\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/qiwa\/contracts\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/salary-certificates\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/visas\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/work-injuries\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/ai\/hr-letter-generator$/ },
  { method: "POST", pattern: /^\/api\/biometric\/verify$/ },
  { method: "POST", pattern: /^\/api\/checklists$/ },
  { method: "POST", pattern: /^\/api\/notifications$/ },
  { method: "POST", pattern: /^\/api\/projects$/ },
  { method: "POST", pattern: /^\/api\/tasks$/ },
  { method: "PUT", pattern: /^\/api\/checklists\/[^/]+\/toggle$/ },
  { method: "PUT", pattern: /^\/api\/fleet\/vehicles\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/flight-tickets\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/qiwa\/contracts\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/talent\/succession\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/telework\/permits\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/visas\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/work-injuries\/[^/]+$/ },
];

export const FORBIDDEN = { error: "Insufficient permissions" };
export const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const ruleMatches = (rule: { method: string; pattern: RegExp }, method: string, url: string) =>
  (rule.method === "*" || rule.method === method) && rule.pattern.test(url);

export const hasPermission = (role: string, perm: string) => {
  const granted = ROLE_PERMISSIONS[role];
  return !!granted && (granted.has("*") || granted.has(perm));
};

export const requirePermission = (perm: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!hasPermission(String((req as any).user?.role || ""), perm)) {
      return res.status(403).json(FORBIDDEN);
    }
    next();
  };
};

const unclassifiedWrites = new Set<string>();

// Applies the policy above to every /api request: classified routes are checked for
// all methods, and unclassified *writes* are fail-closed for employee_ess only.
const enforceRoutePermissions = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const url = normalizeApiUrl(req.originalUrl || req.path);
  if (!url.startsWith("/api")) return next();
  const user = (req as any).user;
  if (!user) return next(); // openApi route — nothing to enforce

  const method = req.method.toUpperCase();
  // Presence self-service is intentionally classified with ATTENDANCE_MANAGE so
  // branch_manager keeps its supervisor surface. Release only the ESS subset
  // here, before the rule lookup; the handlers still scope every read to self.
  if (url.startsWith("/api/presence") && String(user.role || "") === "employee_ess") {
    const essAllowed =
      (method === "GET" && ESS_READ_ALLOWLIST.some((r) => r.pattern.test(url))) ||
      (WRITE_METHODS.has(method) && ESS_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(url)));
    if (essAllowed) return next();
  }
  const rule = ROUTE_PERMISSIONS.find((r) => ruleMatches(r, method, url));
  if (rule) return requirePermission(rule.perm)(req, res, next);

  // Employee ESS read restriction: only explicit allowlisted GET routes permitted
  if (method === "GET" && String(user.role || "") === "employee_ess") {
    const allowed = ESS_READ_ALLOWLIST.some((r) => r.pattern.test(url));
    if (!allowed) return res.status(403).json(FORBIDDEN);
  }

  if (WRITE_METHODS.has(method)) {
    if (String(user.role || "") === "employee_ess" && !ESS_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(url))) {
      return res.status(403).json(FORBIDDEN);
    }
    // Classifications: ESS (self-service) and OPERATIONAL (all non-ess roles may write)
    // are fully resolved above — no coverage warning needed.
    const classified =
      ESS_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(url)) ||
      OPERATIONAL_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(url));
    if (!classified) {
      const key = method + " " + url;
      if (!unclassifiedWrites.has(key)) {
        unclassifiedWrites.add(key);
        log.warn("[RBAC] unclassified write route (allowed for operational roles): " + key);
      }
    }
  }

  next();
};

// Entity-based access control
export const requireEntity = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || !user.entity_id) {
    return res.status(403).json({ error: "Entity access required" });
  }
  next();
};

// Registers the global auth gate + RBAC enforcement on /api/* (openApi routes pass through).
export function setupAuthGate(app: express.Express) {
  app.use((req, res, next) => {
    const url = normalizeApiUrl(req.originalUrl || req.path);
    if (!url.startsWith("/api")) return next();
    if (openApi.some((p) => url === p || url.startsWith(p + "/"))) return next();
    return authenticateToken(req, res, next);
  });
  // After authentication (it needs req.user) and before RBAC.
  app.use(enforcePasswordChange);
  app.use(enforceRoutePermissions);
}

// C4: list every write route the policy does not classify yet, so classification can be finished.
export function reportUnclassifiedWriteRoutes(app: express.Express) {
  try {
    const stack: any[] = (app as any)._router?.stack || (app as any).router?.stack || [];
    const found = new Set<string>();
    for (const layer of stack) {
      const route = layer?.route;
      if (!route || !route.path || !route.methods) continue;
      const routePath = route.path.startsWith("/") ? route.path : "/" + route.path;
      if (!routePath.startsWith("/api")) continue;
      // intentionally public routes carry no token, so RBAC never sees them
      if (openApi.some((p) => routePath === p || routePath.startsWith(p + "/"))) continue;
      for (const rawMethod of Object.keys(route.methods)) {
        const method = String(rawMethod).toUpperCase();
        if (!WRITE_METHODS.has(method)) continue;
        if (ROUTE_PERMISSIONS.some((r) => ruleMatches(r, method, routePath))) continue;
        if (ESS_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(routePath))) continue;
        if (OPERATIONAL_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(routePath))) continue;
        found.add(method + " " + routePath);
      }
    }
    if (found.size) {
      log.warn("[RBAC] " + found.size + " unclassified write route(s) — allowed for operational roles, denied for employee_ess:");
      for (const route of Array.from(found).sort()) log.warn("  - " + route);
    } else {
      log.info("[RBAC] all write routes are classified.");
    }
  } catch (e) {
    log.warn("[RBAC] route coverage scan failed", e);
  }
}
