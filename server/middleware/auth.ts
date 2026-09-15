import express from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { config } from "../config/env";

export const JWT_SECRET = config.JWT_SECRET;
export const JWT_EXPIRY = config.JWT_EXPIRY;

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
export const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
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
  WORKFLOWS_MANAGE: "workflows.manage", // approval_workflows + manager_inbox screens
  DOCUMENTS_MANAGE: "documents.manage", // employees & employee_documents screens
  HR_OPERATIONS_MANAGE: "hr_operations.manage", // HR-only screens (fleet, medical, visas, ...)
  AI_TOOLS_USE: "ai.tools.use", // ai_consultant & ai_letters screens
  ALERTS_MANAGE: "alerts.manage", // expiry-alert hub, opened from the header bell
} as const;

// role -> permission keys ("*" = every screen: admin/hr_manager own all screens)
export const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set<string>(["*"]),
  hr_manager: new Set<string>(["*"]),
  finance: new Set<string>([
    PERM.ALLOWANCE_TYPES_MANAGE,
    PERM.PAYROLL_RUN,
    PERM.REPORTS_VIEW,
    PERM.WPS_VIEW,
    PERM.EXCEL_EXPORT,
    PERM.SAUDI_COMPLIANCE,
    PERM.AUDIT_LOGS_VIEW, // DashboardView reads recent activity for every dashboard role
    PERM.BUDGETS_MANAGE, // budgeting screen: admin, hr_manager, finance
    PERM.BONUSES_MANAGE, // bonuses screen: admin, hr_manager, finance
    PERM.LOANS_MANAGE, // loans screen: admin, hr_manager, finance
    PERM.EXPENSES_MANAGE, // expenses screen: admin, hr_manager, finance
    PERM.ALERTS_MANAGE, // expiry-alert hub is reached from the bell every role renders
  ]),
  branch_manager: new Set<string>([
    PERM.EMPLOYEES_MANAGE,
    PERM.ATTENDANCE_DEVICES_MANAGE,
    PERM.AUDIT_LOGS_VIEW, // DashboardView reads recent activity for every dashboard role
    PERM.BIOMETRIC_ENROLL, // attendance_kiosk screen: admin, hr_manager, branch_manager
    PERM.ATTENDANCE_MANAGE, // attendance screen: admin, hr_manager, branch_manager
    PERM.LEAVES_MANAGE, // leaves + manager_inbox screens: admin, hr_manager, branch_manager
    PERM.WORKFLOWS_MANAGE, // approval_workflows + manager_inbox screens
    PERM.DOCUMENTS_MANAGE, // employees screen uploads attachments (EmployeesView)
    PERM.ALERTS_MANAGE, // expiry-alert hub is reached from the bell every role renders
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
  { method: "POST", pattern: /^\/api\/payroll\/(generate|lock|sync-attendance|batch|calculate)$/, perm: PERM.PAYROLL_RUN },
  // attendance devices (admin ops): attendance_kiosk screen -> admin, hr_manager, branch_manager
  { method: "POST", pattern: /^\/api\/attendance\/devices(\/.*)?$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/attendance\/devices\/[^/]+$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
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
  // financial / compliance data
  { method: "GET", pattern: /^\/api\/reports(\/.*)?$/, perm: PERM.REPORTS_VIEW },
  { method: "GET", pattern: /^\/api\/provisions(\/.*)?$/, perm: PERM.REPORTS_VIEW },
  { method: "GET", pattern: /^\/api\/wps(\/.*)?$/, perm: PERM.WPS_VIEW },
  { method: "GET", pattern: /^\/api\/excel(\/.*)?$/, perm: PERM.EXCEL_EXPORT },
  { method: "*", pattern: /^\/api\/saudi(\/.*)?$/, perm: PERM.SAUDI_COMPLIANCE },
  // system administration (unchanged: admin only)
  { method: "*", pattern: /^\/api\/admin(\/.*)?$/, perm: PERM.ADMIN_MANAGE },
  { method: "*", pattern: /^\/api\/backup(\/.*)?$/, perm: PERM.BACKUP_MANAGE },
  { method: "POST", pattern: /^\/api\/entities$/, perm: PERM.ENTITIES_MANAGE },
  { method: "PUT", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
  { method: "DELETE", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
  { method: "PUT", pattern: /^\/api\/countries\/[^/]+\/rules$/, perm: PERM.ADMIN_MANAGE },
  { method: "POST", pattern: /^\/api\/auth\/register$/, perm: PERM.AUTH_REGISTER },

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
  // expenses screen: admin, hr_manager, finance (src/components/ExpensesView.tsx:40)
  { method: "POST", pattern: /^\/api\/expenses$/, perm: PERM.EXPENSES_MANAGE },
  // attendance screen manual punch edits: admin, hr_manager, branch_manager
  // (src/components/AttendanceView.tsx:188). The kiosk legs stay in openApi untouched.
  { method: "POST", pattern: /^\/api\/attendance$/, perm: PERM.ATTENDANCE_MANAGE },
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
  // expiry-alert hub: opened from the header bell, which every signed-in operational role
  // renders (src/App.tsx:511 -> ExpiryAlertsModal.tsx:78). employee_ess stays denied here,
  // exactly as it was while the route was unclassified.
  { method: "POST", pattern: /^\/api\/alerts\/send-reminder$/, perm: PERM.ALERTS_MANAGE },
  // AI studio screens: admin, hr_manager (LaborLawAiConsultantView.tsx:50)
  { method: "POST", pattern: /^\/api\/ai\/labor-law-consultant$/, perm: PERM.AI_TOOLS_USE },
  // HR-only screens: admin, hr_manager. Each group below exists in a nav screen that neither
  // finance's nor branch_manager's allow-list contains (src/App.tsx:209-210).
  { method: "POST", pattern: /^\/api\/(appraisals|assets|clearances|disciplinary\/violations|ewa\/withdrawals|exit-interviews|flight-tickets|flexible\/shifts|grievances|hearings|promotions|smart-assets|telework\/permits|transfers|visas|warnings|work-injuries)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(fleet\/vehicles|fleet\/traffic-fines|qiwa\/contracts|qiwa\/draft-from-employees)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(hse\/inspections|hse\/ppe-logs|medical\/dependents|medical\/policies)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(recruitment\/candidates|recruitment\/jobs|talent\/assessments|talent\/succession)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/(kudos(\/[^/]+\/like)?|rewards\/redeem)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "POST", pattern: /^\/api\/overtime(\/[^/]+\/approve)?$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "DELETE", pattern: /^\/api\/(fleet\/vehicles|medical\/dependents|overtime|talent\/succession)\/[^/]+$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "PUT", pattern: /^\/api\/(assets|smart-assets)\/[^/]+\/assign$/, perm: PERM.HR_OPERATIONS_MANAGE },
  { method: "PUT", pattern: /^\/api\/(clearances\/[^/]+\/department|grievances\/[^/]+\/status|policies\/ramadan)$/, perm: PERM.HR_OPERATIONS_MANAGE },
];

// The only write routes employee_ess may call (self-service surface of src/components/ESSView.tsx
// plus the shell actions every authenticated role needs).
export const ESS_WRITE_ALLOWLIST: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/auth\/logout$/ },
  { method: "PUT", pattern: /^\/api\/auth\/change-password$/ },
  { method: "PUT", pattern: /^\/api\/notifications\/read-all$/ },
  { method: "PUT", pattern: /^\/api\/notifications\/[^/]+\/read$/ },
  { method: "POST", pattern: /^\/api\/salary-certificates$/ }, // ESSView -> SalaryCertificateModal (شهادة تعريف بالراتب)
  { method: "POST", pattern: /^\/api\/visas\/exit-reentry$/ }, // ESSView tab "طلب تأشيرة خروج وعودة"
  { method: "POST", pattern: /^\/api\/copilot\/chat$/ }, // floating AI launcher is rendered for every role (read-only on the server)
];

// --- C4: operational write routes (explicit classification) ---
// The routes below are deliberately operational: any signed-in role other than employee_ess
// may call them, employee_ess stays denied. This replicates exactly what the unclassified
// write path already did, but makes the policy explicit and removes them from the boot-time
// coverage scan. None concern self-service (those live in ESS_WRITE_ALLOWLIST).
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
  const rule = ROUTE_PERMISSIONS.find((r) => ruleMatches(r, method, url));
  if (rule) return requirePermission(rule.perm)(req, res, next);

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
        console.warn("[RBAC] unclassified write route (allowed for operational roles): " + key);
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
      console.warn("[RBAC] " + found.size + " unclassified write route(s) — allowed for operational roles, denied for employee_ess:");
      for (const route of Array.from(found).sort()) console.warn("  - " + route);
    } else {
      console.log("[RBAC] all write routes are classified.");
    }
  } catch (e) {
    console.warn("[RBAC] route coverage scan failed", e);
  }
}