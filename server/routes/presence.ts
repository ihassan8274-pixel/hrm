// Route module. Registered from server/index.ts immediately after attendance.
//
// Branch presence is deliberately split from the kiosk attendance flow: this
// module answers the phone/ESS client, which sends exactly one GPS sample per
// gate call. No sample is ever written to a table — only the branch chosen from
// the in-memory cache and a rounded distance are used, then discarded.
import crypto from "crypto";
import express from "express";
import db, {
  createNotification,
  execute,
  logAction,
  queryAll,
  queryOne,
  transaction,
} from "../config/postgres";
import { log } from "../lib/logger";
import {
  DEFAULT_PRESENCE_RADIUS_M,
  RESTRICTED_CENTRE_LIMIT_M,
  haversineMeters,
  intervalTime,
  isRestrictedPolicy,
  mergeIntervals,
  mergedMinutes,
  minuteValue,
  permitExpiry,
  presenceLock,
  presencePermitMinutes,
} from "../lib/presence";
import {
  requireOrganizationScope,
  organizationScope,
  denyEmployee,
} from "../middleware/organizationScope";
import type { OrganizationScope } from "../lib/organization-scope";
import { csvDocument } from "../lib/csv";

const POLICIES = new Set(["open", "branch_bound", "branch_scoped", "system_admin", "finance"]);
type Policy = "open" | "branch_bound" | "branch_scoped" | "system_admin" | "finance";
const DECISIONS = new Set(["full_deduction", "partial_deduction", "exemption"]);

const DRIFT_TITLE = "تنبيه انحراف سياسة التواجد";
const RETENTION_DAYS = 120;
const BATCH_SIZE = 200;

type CachedBranch = {
  id: number;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  geofence_radius_m: number | string | null;
};

let branchCache: CachedBranch[] = [];
let branchCacheLoadedAt = 0;

/** Loaded at boot, refreshed hourly and lazily when the cache is cold/stale. */
export async function refreshBranchCache(): Promise<void> {
  const rows = await queryAll(
    "SELECT id, name, latitude, longitude, geofence_radius_m FROM branches ORDER BY id",
  ) as unknown as CachedBranch[];
  branchCache = rows.map((b) => ({
    id: Number(b.id),
    name: String(b.name || ""),
    latitude: b.latitude,
    longitude: b.longitude,
    geofence_radius_m: b.geofence_radius_m,
  }));
  branchCacheLoadedAt = Date.now();
}

async function ensureBranchCache(): Promise<void> {
  if (!branchCacheLoadedAt || Date.now() - branchCacheLoadedAt > 60_000) {
    await refreshBranchCache();
  }
}

const todayDay = (now = new Date()) => now.toISOString().slice(0, 10);

function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

const roleOf = (req: express.Request) => String((req as any).user?.role || "");
const actorOf = (req: express.Request) => {
  const user = (req as any).user || {};
  return String(user.name || user.username || user.id || "system");
};
const isHr = (req: express.Request) => ["admin", "hr_manager"].includes(roleOf(req));
const isSupervisor = (req: express.Request) =>
  ["admin", "hr_manager", "branch_manager"].includes(roleOf(req));

function deny(res: express.Response, status: number, error: string): boolean {
  res.status(status).json({ error });
  return false;
}

function requireHr(req: express.Request, res: express.Response): boolean {
  return isHr(req) || deny(res, 403, "هذه العملية للمسؤول والموارد البشرية فقط");
}

const employeeScopeSql =
  "(? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)";

function employeeScopeParams(scope: OrganizationScope): unknown[] {
  return [scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId];
}

function normalizePolicy(value: unknown): Policy {
  const policy = String(value || "open");
  return POLICIES.has(policy) ? (policy as Policy) : "open";
}

async function employeeIdForUser(userId: number): Promise<number | null> {
  const row = await queryOne("SELECT employee_id FROM users WHERE id = ?", userId) as
    | { employee_id: number | null }
    | undefined;
  // User ids and employee ids are independent sequences. Falling back to the
  // user id would silently attach payroll values to an unrelated employee.
  return row?.employee_id ? Number(row.employee_id) : null;
}

function emptyDaily(userId: number, day: string) {
  return {
    user_id: userId,
    day,
    inside_minutes: 0,
    approved_out_minutes: 0,
    unapproved_out_minutes: 0,
    deducted_minutes: 0,
    violations_count: 0,
    branches_count: 0,
    first_in: null as string | null,
    last_out: null as string | null,
  };
}

type DailyRow = ReturnType<typeof emptyDaily>;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function minutesOfTime(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

function workingDays(value: unknown): number[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  } catch {
    return [];
  }
}

/** Expected duty minutes and the value of one minute for the employee's schedule. */
async function dailyExpectation(employeeId: number | null, day: string) {
  if (employeeId === null) {
    return { salary: 0, workingDays: 22, dailyHours: 8, expected: 0 };
  }
  const schedule = await queryOne(
    `SELECT work_start_time, work_end_time, working_days_json, break_minutes
     FROM employee_work_schedule
     WHERE employee_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC, id DESC LIMIT 1`,
    employeeId, day, day,
  ) as any;
  const employee = await queryOne(
    `SELECT basic_salary, housing_allowance, transport_allowance, other_allowances
     FROM employees WHERE id = ?`,
    employeeId,
  ) as any;
  const salary = ["basic_salary", "housing_allowance", "transport_allowance", "other_allowances"]
    .reduce((sum, key) => sum + num(employee?.[key]), 0);
  const start = minutesOfTime(schedule?.work_start_time);
  const end = minutesOfTime(schedule?.work_end_time);
  const days = schedule ? workingDays(schedule.working_days_json).length : 22;
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const scheduled = schedule ? workingDays(schedule.working_days_json).includes(weekday) : false;
  const breakMinutes = Math.max(0, num(schedule?.break_minutes));
  const expected = scheduled && start !== null && end !== null && end > start
    ? Math.max(0, end - start - breakMinutes)
    : 0;
  return { salary, workingDays: days || 22, dailyHours: expected ? expected / 60 : 8, expected };
}

async function approvedOutMinutes(userId: number, day: string, expected: number): Promise<number> {
  if (!expected) return 0;
  const windows = await queryAll(
    `SELECT w.starts_at, w.ends_at
     FROM presence_request_windows w
     JOIN approval_requests ar ON ar.id = w.approval_request_id
     WHERE w.user_id = ? AND substr(CAST(w.starts_at AS TEXT), 1, 10) = ? AND ar.status = 'approved'`,
    userId, day,
  ) as any[];
  const start = Date.parse(`${day}T00:00:00Z`);
  const merged = mergeIntervals(
    windows
      .map((w) => ({
        in_at: Math.max(start, intervalTime(w.starts_at) ?? Number.NaN),
        out_at: Math.min(start + 86_400_000, intervalTime(w.ends_at) ?? Number.NaN),
      }))
      .filter((w) => Number.isFinite(w.in_at) && Number.isFinite(w.out_at)),
  );
  return Math.min(expected, Math.round(mergedMinutes(merged)));
}

/**
 * Computes one day's rollup. `persist=false` is used by /me so a read never
 * mutates data; checkout and gate callers persist the same calculation.
 */
async function computeDaily(
  userId: number,
  employeeId: number | null,
  day: string,
  now = new Date(),
): Promise<DailyRow> {
  const intervals = await queryAll(
    `SELECT id, branch_id, in_at, out_at FROM presence_intervals
     WHERE user_id = ? AND substr(CAST(in_at AS TEXT), 1, 10) = ? ORDER BY in_at, id`,
    userId, day,
  ) as any[];
  const row = emptyDaily(userId, day);
  if (!intervals.length) return row;

  const openAsOf = now.toISOString();
  const merged = mergeIntervals(
    intervals.map((i) => ({ in_at: i.in_at, out_at: i.out_at || openAsOf })),
  );
  row.inside_minutes = Math.round(mergedMinutes(merged));
  row.branches_count = new Set(
    intervals.filter((i) => i.branch_id !== null && i.branch_id !== undefined).map((i) => Number(i.branch_id)),
  ).size;
  row.first_in = String(intervals[0].in_at);
  const closed = intervals.filter((i) => i.out_at).map((i) => String(i.out_at)).sort();
  row.last_out = closed.length ? closed[closed.length - 1] : null;

  const expectation = await dailyExpectation(employeeId, day);
  row.approved_out_minutes = await approvedOutMinutes(userId, day, expectation.expected);
  // Only a day with a real presence record can accrue an unapproved gap — an
  // employee who never arrived is handled by the attendance/absence modules.
  row.unapproved_out_minutes = Math.max(
    0,
    expectation.expected - row.inside_minutes - row.approved_out_minutes,
  );

  const violations = await queryAll(
    `SELECT minutes, decision, decision_percent FROM attendance_violations
     WHERE user_id = ? AND day = ?`,
    userId, day,
  ) as any[];
  row.violations_count = violations.length;
  row.deducted_minutes = Math.round(
    violations.reduce((sum, v) => {
      const decision = String(v.decision || "");
      if (decision !== "full_deduction" && decision !== "partial_deduction") return sum;
      const percent = decision === "full_deduction" ? 100 : Math.min(100, Math.max(0, num(v.decision_percent)));
      return sum + (num(v.minutes) * percent) / 100;
    }, 0),
  );
  return row;
}

async function recomputePresenceDaily(
  userId: number,
  employeeId: number | null,
  day: string,
  now = new Date(),
): Promise<DailyRow> {
  const row = await computeDaily(userId, employeeId, day, now);
  await execute(
    `INSERT INTO presence_daily
       (user_id, day, inside_minutes, approved_out_minutes, unapproved_out_minutes,
        deducted_minutes, violations_count, branches_count, first_in, last_out)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET
       inside_minutes = EXCLUDED.inside_minutes,
       approved_out_minutes = EXCLUDED.approved_out_minutes,
       unapproved_out_minutes = EXCLUDED.unapproved_out_minutes,
       deducted_minutes = EXCLUDED.deducted_minutes,
       violations_count = EXCLUDED.violations_count,
       branches_count = EXCLUDED.branches_count,
       first_in = EXCLUDED.first_in,
       last_out = EXCLUDED.last_out`,
    row.user_id, row.day, row.inside_minutes, row.approved_out_minutes,
    row.unapproved_out_minutes, row.deducted_minutes, row.violations_count,
    row.branches_count, row.first_in, row.last_out,
  );

  // A gap during a scheduled working day creates one draft violation at most.
  // The value is calculated here (and nowhere else): confirm/decide must never
  // accept a money amount from a request body, and no payroll row is touched.
  if (row.unapproved_out_minutes > 0) {
    const existing = await queryOne(
      "SELECT id FROM attendance_violations WHERE user_id = ? AND day = ? ORDER BY id DESC LIMIT 1",
      userId, day,
    );
    if (!existing) {
      const expectation = await dailyExpectation(employeeId, day);
      const value = minuteValue(
        expectation.salary, expectation.workingDays, expectation.dailyHours,
        row.unapproved_out_minutes,
      );
      const first = await queryOne(
        `SELECT branch_id, id FROM presence_intervals
         WHERE user_id = ? AND substr(CAST(in_at AS TEXT), 1, 10) = ? ORDER BY in_at, id LIMIT 1`,
        userId, day,
      ) as any;
      await execute(
        `INSERT INTO attendance_violations
           (user_id, day, branch_id, interval_id, minutes, value_sar, status, reason)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
        userId, day, first?.branch_id ?? null, first?.id ?? null,
        row.unapproved_out_minutes, value, "دقائق تواجد غير مصرح بها",
      );
      row.violations_count += 1;
    }
  }
  return row;
}

async function currentDaily(userId: number, day: string, now = new Date()): Promise<DailyRow> {
  const stored = await queryOne(
    `SELECT * FROM presence_daily WHERE user_id = ? AND day = ?`,
    userId, day,
  ) as any;
  if (!stored) return computeDaily(userId, await employeeIdForUser(userId), day, now);
  return { ...emptyDaily(userId, day), ...stored };
}

// ---------------------------------------------------------------------------
// Drift detection and retention — both idempotent, both safe to run at boot.
// ---------------------------------------------------------------------------

type DriftRow = { user_id: number | null; branch_id: number | null };

async function detectPresenceDrift(now = new Date()): Promise<void> {
  const day = todayDay(now);
  const checks: Array<{ reason: string; message: (r: DriftRow) => string; rows: DriftRow[] }> = [
    {
      reason: "ess_without_policy",
      message: (r) => `الموظف ${r.user_id} يستخدم بوابة الموظف بدون سياسة تواجد صريحة`,
      rows: (await queryAll(
        `SELECT u.id AS user_id, NULL AS branch_id FROM users u
         LEFT JOIN user_access_policy p ON p.user_id = u.id
         WHERE u.role = 'employee_ess' AND p.user_id IS NULL`,
      )) as DriftRow[],
    },
    {
      reason: "restricted_without_scope",
      message: (r) => `الموظف ${r.user_id} مقيد بفرع بدون نطاق فروع محدد`,
      rows: (await queryAll(
        `SELECT p.user_id AS user_id, NULL AS branch_id FROM user_access_policy p
         WHERE p.policy IN ('branch_bound', 'branch_scoped')
           AND NOT EXISTS (SELECT 1 FROM user_branch_scope s WHERE s.user_id = p.user_id)`,
      )) as DriftRow[],
    },
    {
      reason: "branch_without_coordinates",
      message: (r) => `الفرع ${r.branch_id} بلا إحداثيات — لا يمكن التحقق من نطاقه`,
      rows: (await queryAll(
        `SELECT NULL AS user_id, id AS branch_id FROM branches
         WHERE latitude IS NULL OR longitude IS NULL`,
      )) as DriftRow[],
    },
  ];

  for (const check of checks) {
    for (const row of check.rows) {
      const duplicate = await queryOne(
        `SELECT id FROM policy_drift_alerts
         WHERE reason = ? AND user_id IS NOT DISTINCT FROM ? AND branch_id IS NOT DISTINCT FROM ?
           AND substr(CAST(detected_at AS TEXT), 1, 10) = ? LIMIT 1`,
        check.reason, row.user_id, row.branch_id, day,
      );
      if (duplicate) continue;
      await execute(
        `INSERT INTO policy_drift_alerts (user_id, branch_id, reason, detected_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        row.user_id, row.branch_id, check.reason,
      );
      await createNotification(DRIFT_TITLE, check.message(row), "warning");
    }
  }
}

async function prunePresenceHistory(now = new Date()): Promise<void> {
  const cutoff = addDays(todayDay(now), -RETENTION_DAYS);
  let removed = 0;
  for (;;) {
    const result = await execute(
      `DELETE FROM presence_intervals WHERE id IN (
         SELECT id FROM presence_intervals
         WHERE substr(CAST(in_at AS TEXT), 1, 10) < ? ORDER BY id LIMIT ?)`,
      cutoff, BATCH_SIZE,
    );
    if (!result.changes) break;
    removed += result.changes;
  }
  for (;;) {
    const days = await queryAll(
      `SELECT DISTINCT day FROM presence_daily WHERE day < ? ORDER BY day LIMIT ?`,
      cutoff, BATCH_SIZE,
    ) as { day: string }[];
    if (!days.length) break;
    for (const { day } of days) {
      const result = await execute("DELETE FROM presence_daily WHERE day = ?", day);
      removed += result.changes;
    }
  }
  for (;;) {
    const result = await execute(
      `DELETE FROM policy_drift_alerts WHERE id IN (
         SELECT id FROM policy_drift_alerts
         WHERE substr(CAST(detected_at AS TEXT), 1, 10) < ? ORDER BY id LIMIT ?)`,
      cutoff, BATCH_SIZE,
    );
    if (!result.changes) break;
    removed += result.changes;
  }
  log.info(`[presence] retention removed ${removed} row(s) older than ${RETENTION_DAYS} days`);
}

// TODO: the existing backup script pattern (scripts/backup-before-deploy.sh and
// the daily backup job in server/index.ts) already covers a daily database
// backup; retention below only removes data that has been backed up. No new
// external backup service is introduced here.
async function runPresenceJobsOnce(): Promise<void> {
  try {
    await refreshBranchCache();
    await detectPresenceDrift();
    await prunePresenceHistory();
  } catch (error) {
    log.error("[presence] boot job failed:", error);
  }
}

export function startPresenceJobs(): void {
  void runPresenceJobsOnce();
  setInterval(() => {
    void refreshBranchCache().catch((error) => log.error("[presence] branch cache refresh failed:", error));
    void detectPresenceDrift().catch((error) => log.error("[presence] drift detection failed:", error));
  }, 60 * 60 * 1000).unref?.();
  setInterval(() => {
    void prunePresenceHistory().catch((error) => log.error("[presence] retention failed:", error));
  }, 24 * 60 * 60 * 1000).unref?.();
}

// ---------------------------------------------------------------------------
// Report builders — the screen and CSV endpoints call the same functions.
// ---------------------------------------------------------------------------

type PresenceReport = {
  key: string;
  title: string;
  columns: string[];
  rows: unknown[][];
  summary: Array<{ label: string; value: number | string }>;
  generated_at: string;
};

function reportRange(query: express.Request["query"]): { from: string; to: string } {
  const today = todayDay();
  const isDay = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const from = isDay(query.from) ? String(query.from) : addDays(today, -29);
  const to = isDay(query.to) ? String(query.to) : today;
  const month = Number(query.month);
  const year = Number(query.year);
  if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 1900) {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    return { from: `${prefix}01`, to: `${prefix}31` };
  }
  return { from, to };
}

async function buildHoursReport(scope: OrganizationScope, query: express.Request["query"]): Promise<PresenceReport> {
  const { from, to } = reportRange(query);
  const rows = await queryAll(
    `SELECT pd.user_id, pd.day, pd.inside_minutes, pd.branches_count, pd.first_in, pd.last_out,
            pd.approved_out_minutes, pd.unapproved_out_minutes, e.name AS employee_name,
            b.name AS branch_name
     FROM presence_daily pd
     JOIN users u ON u.id = pd.user_id
     LEFT JOIN employees e ON e.id = u.employee_id
     LEFT JOIN presence_intervals pi ON pi.user_id = pd.user_id AND pi.in_at = pd.first_in
     LEFT JOIN branches b ON b.id = pi.branch_id
     WHERE ${employeeScopeSql} AND pd.day >= ? AND pd.day <= ?
     ORDER BY pd.day DESC, pd.user_id`,
    ...employeeScopeParams(scope), from, to,
  ) as any[];
  const data = rows.map((r) => [
    r.day, r.employee_name || "", r.branch_name || "—", num(r.inside_minutes),
    num(r.branches_count), r.first_in || "", r.last_out || "",
    num(r.approved_out_minutes), num(r.unapproved_out_minutes),
  ]);
  const sum = (index: number) => data.reduce((total, r) => total + num(r[index]), 0);
  return {
    key: "presence-hours",
    title: "تقرير ساعات التواجد",
    columns: [
      "التاريخ", "الموظف", "الفرع", "دقائق التواجد", "عدد الفروع",
      "أول دخول", "آخر خروج", "دقائق مصرح بها", "دقائق غير مصرح بها",
    ],
    rows: data,
    summary: [
      { label: "إجمالي دقائق التواجد", value: sum(3) },
      { label: "دقائق مصرح بها", value: sum(7) },
      { label: "دقائق غير مصرح بها", value: sum(8) },
    ],
    generated_at: new Date().toISOString(),
  };
}

async function buildViolationsReport(scope: OrganizationScope, query: express.Request["query"]): Promise<PresenceReport> {
  const { from, to } = reportRange(query);
  const rows = await queryAll(
    `SELECT av.id, av.user_id, av.day, av.branch_id, av.minutes, av.value_sar, av.status,
            av.decision, av.decision_percent, av.supervisor_confirmed_by, av.decided_by,
            e.name AS employee_name, b.name AS branch_name
     FROM attendance_violations av
     JOIN users u ON u.id = av.user_id
     LEFT JOIN employees e ON e.id = u.employee_id
     LEFT JOIN branches b ON b.id = av.branch_id
     WHERE ${employeeScopeSql} AND av.day >= ? AND av.day <= ?
     ORDER BY av.day DESC, av.id DESC`,
    ...employeeScopeParams(scope), from, to,
  ) as any[];
  const data = rows.map((r) => [
    Number(r.id), r.day, r.employee_name || "", num(r.minutes), num(r.value_sar),
    r.status || "", r.decision || "", r.supervisor_confirmed_by || r.decided_by || "",
  ]);
  return {
    key: "presence-violations",
    title: "تقرير مخالفات التواجد",
    columns: [
      "م", "التاريخ", "الموظف", "الدقائق", "القيمة (ر.س)", "الحالة", "القرار", "المعتمد بواسطة",
    ],
    rows: data,
    summary: [
      { label: "المخالفات", value: rows.length },
      { label: "إجمالي الدقائق", value: data.reduce((total, r) => total + num(r[3]), 0) },
      { label: "القيمة (ر.س)", value: Math.round(data.reduce((total, r) => total + num(r[4]), 0) * 100) / 100 },
    ],
    generated_at: new Date().toISOString(),
  };
}

async function scopedViolations(
  scope: OrganizationScope,
  query: express.Request["query"],
): Promise<any[]> {
  const { from, to } = reportRange(query);
  return await queryAll(
    `SELECT av.id, av.user_id, av.day, av.branch_id, av.minutes, av.value_sar, av.status,
            av.decision, av.decision_percent, av.supervisor_confirmed_by, av.supervisor_confirmed_at,
            av.decided_by, av.decided_at, av.reason, e.name AS employee_name, b.name AS branch_name
     FROM attendance_violations av
     JOIN users u ON u.id = av.user_id
     LEFT JOIN employees e ON e.id = u.employee_id
     LEFT JOIN branches b ON b.id = av.branch_id
     WHERE ${employeeScopeSql} AND av.day >= ? AND av.day <= ?
     ORDER BY av.day DESC, av.id DESC`,
    ...employeeScopeParams(scope), from, to,
  ) as any[];
}

function sendCsv(res: express.Response, report: PresenceReport, filename: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}.csv`);
  res.send("\uFEFF" + csvDocument(report.columns, report.rows));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerPresence(app: express.Express) {

  /** One GPS sample. Coordinates are used in memory and never persisted. */
  app.post("/api/presence/gate", async (req, res) => {
    try {
      const user = (req as any).user || {};
      if (!user.id) return deny(res, 403, "جلسة غير صالحة");
      const userId = Number(user.id);
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      const gateResponse = (values: Record<string, unknown>) => ({
        allowed: false, permit: null, expires_at: null,
        branch_id: null, branch_name: null, distance_m: null, ...values,
      });
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return res.status(400).json(gateResponse({ reason: "invalid_coordinates", error: "إحداثيات GPS غير صالحة" }));
      }

      await ensureBranchCache();
      const policyRow = await queryOne(
        "SELECT policy, ttl_minutes FROM user_access_policy WHERE user_id = ?", userId,
      ) as { policy: string; ttl_minutes: number } | undefined;
      const policy = normalizePolicy(policyRow?.policy);
      const restricted = isRestrictedPolicy(policy);
      const validFor = presencePermitMinutes(policy, policyRow?.ttl_minutes);

      const open = await queryOne(
        `SELECT id, in_at, branch_id, permit_nonce FROM presence_intervals
         WHERE user_id = ? AND out_at IS NULL ORDER BY in_at DESC LIMIT 1`,
        userId,
      ) as any;
      const oldExpiry = permitExpiry(open?.permit_nonce);
      // A restricted permit is single-session: once it lapses the employee has
      // to close the stale interval (checkout) before a fresh gate is accepted.
      if (restricted && open && oldExpiry && Date.now() >= oldExpiry) {
        return res.status(403).json(gateResponse({ reason: "permit_expired", error: "انتهت صلاحية تصريح التواجد — سجّل الخروج ثم عد للتسجيل" }));
      }

      let nearest: { id: number; name: string; radius: number; distance: number } | null = null;
      for (const branch of branchCache) {
        if (branch.latitude === null || branch.latitude === undefined ||
            branch.longitude === null || branch.longitude === undefined) continue;
        const distance = haversineMeters(
          Number(branch.latitude), Number(branch.longitude), latitude, longitude,
        );
        if (!nearest || distance < nearest.distance) {
          nearest = {
            id: branch.id,
            name: branch.name,
            radius: Number(branch.geofence_radius_m) || DEFAULT_PRESENCE_RADIUS_M,
            distance,
          };
        }
      }
      const distanceM = nearest ? Math.round(nearest.distance) : null;
      const withinRadius = !!nearest && nearest.distance <= nearest.radius;
      // Restricted policies are judged against the branch centre at 100 m,
      // not the (possibly tighter) geofence radius. Once that test passes the
      // gate must still issue a permit and open a presence interval.
      const recordable = !!nearest &&
        (withinRadius || (restricted && nearest.distance < RESTRICTED_CENTRE_LIMIT_M));

      let allowed = true;
      let reason = nearest ? (withinRadius ? "ok" : "allowed_anywhere") : "no_branch_coordinates";
      if (restricted) {
        // 100 m from the centre applies regardless of a wider geofence radius.
        if (!nearest || nearest.distance >= RESTRICTED_CENTRE_LIMIT_M) {
          allowed = false;
          reason = "outside_branch_centre";
        } else {
          const scopes = await queryAll(
            "SELECT branch_id FROM user_branch_scope WHERE user_id = ?", userId,
          ) as { branch_id: number }[];
          if (!scopes.some((s) => Number(s.branch_id) === nearest!.id)) {
            allowed = false;
            reason = "branch_not_allowed";
          }
        }
      }
      if (!allowed) {
        return res.status(403).json(gateResponse({
          reason, error: reason === "outside_branch_centre"
            ? `خارج مركز الفرع (${distanceM}م) — يُمنع التسجيل على السياسة المقيدة`
            : "الفرع غير مسموح لسياسة التواجد",
          branch_id: nearest?.id ?? null,
          branch_name: nearest?.name ?? null,
          distance_m: distanceM,
        }));
      }

      let permit: string | null = null;
      let expiresAt: string | null = null;
      let branchId: number | null = null;
      let branchName: string | null = null;
      // Open/system_admin/finance may punch anywhere, but only a sample inside
      // a geofence creates a presence interval at the nearest branch.
      if (nearest && recordable) {
        const expiresMs = Date.now() + validFor * 60_000;
        permit = `${crypto.randomBytes(16).toString("hex")}.${expiresMs}`;
        expiresAt = new Date(expiresMs).toISOString();
        branchId = nearest.id;
        branchName = nearest.name;
        if (open) {
          await execute(
            `UPDATE presence_intervals SET out_at = CURRENT_TIMESTAMP, closed_reason = 'replaced'
             WHERE id = ?`, open.id,
          );
          await recomputePresenceDaily(userId, await employeeIdForUser(userId), todayDay(new Date(open.in_at)), new Date(open.in_at));
        }
        const inserted = await execute(
          `INSERT INTO presence_intervals (user_id, branch_id, in_at, source, permit_nonce)
           VALUES (?, ?, CURRENT_TIMESTAMP, 'gate', ?)`,
          userId, branchId, permit,
        );
        await recomputePresenceDaily(userId, await employeeIdForUser(userId), todayDay());
        // No coordinates, fingerprint or raw sample goes into the audit trail.
        await logAction(
          "presence_gate", "presence_interval", Number(inserted.lastInsertRowid || 0),
          `policy=${policy} branch=${branchId} distance_m=${distanceM}`,
        );
      }
      return res.json({
        allowed: true,
        permit,
        expires_at: expiresAt,
        branch_id: branchId,
        branch_name: branchName,
        distance_m: distanceM,
        reason,
      });
    } catch (error) {
      log.error("[presence] gate failed:", error);
      return res.status(500).json({ error: "تعذّر تسجيل التواجد", allowed: false, reason: "internal_error" });
    }
  });

  /**
   * A single sample at permit expiry. No watchPosition, no streaming and no
   * coordinates are stored: the distance to the allowed branch centres is
   * computed in memory, the interval permit is renewed, or the programme is
   * locked with 403 when the 100 m / 10-minute rule has been breached.
   */
  app.post("/api/presence/recheck", async (req, res) => {
    try {
      const user = (req as any).user || {};
      if (!user.id) return deny(res, 403, "جلسة غير صالحة");
      const userId = Number(user.id);
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      const outcome = (values: Record<string, unknown>) => ({
        allowed: false, locked: false, permit: null, expires_at: null,
        branch_id: null, branch_name: null, distance_m: null, ...values,
      });
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return res.status(400).json(outcome({ reason: "invalid_coordinates", error: "إحداثيات GPS غير صالحة" }));
      }

      const policyRow = await queryOne(
        "SELECT policy, ttl_minutes FROM user_access_policy WHERE user_id = ?", userId,
      ) as { policy: string; ttl_minutes: number } | undefined;
      const policy = normalizePolicy(policyRow?.policy);
      if (!isRestrictedPolicy(policy)) {
        return res.json(outcome({ allowed: true, reason: "open_policy" }));
      }

      const [scopes, open] = await Promise.all([
        queryAll("SELECT branch_id FROM user_branch_scope WHERE user_id = ?", userId) as Promise<{ branch_id: number }[]>,
        queryOne(
          `SELECT id, in_at, branch_id, permit_nonce FROM presence_intervals
           WHERE user_id = ? AND out_at IS NULL ORDER BY in_at DESC LIMIT 1`, userId,
        ) as Promise<any>,
      ]);
      if (!open || !permitExpiry(open.permit_nonce)) {
        return res.status(403).json(outcome({
          reason: "no_active_permit", error: "لا يوجد تصريح تواجد ساري — سجّل الدخول أولاً",
        }));
      }

      await ensureBranchCache();
      const allowedIds = new Set(scopes.map((s) => Number(s.branch_id)));
      let nearest: { id: number; name: string; distance: number } | null = null;
      for (const branch of branchCache) {
        if (!allowedIds.has(branch.id)) continue;
        if (branch.latitude === null || branch.latitude === undefined ||
            branch.longitude === null || branch.longitude === undefined) continue;
        const distance = haversineMeters(
          Number(branch.latitude), Number(branch.longitude), latitude, longitude,
        );
        if (!nearest || distance < nearest.distance) {
          nearest = { id: branch.id, name: branch.name, distance };
        }
      }
      const distanceM = nearest ? Math.round(nearest.distance) : null;
      if (!nearest || nearest.distance >= RESTRICTED_CENTRE_LIMIT_M) {
        await execute(
          `UPDATE presence_intervals SET out_at = CURRENT_TIMESTAMP, closed_reason = 'out_of_range'
           WHERE id = ?`, open.id,
        );
        await recomputePresenceDaily(
          userId, await employeeIdForUser(userId),
          todayDay(new Date(String(open.in_at).replace(" ", "T"))),
        );
        await logAction(
          "presence_lock", "presence_interval", Number(open.id),
          `reason=outside_branch_centre distance_m=${distanceM}`,
        );
        return res.status(403).json(outcome({
          locked: true,
          reason: "outside_branch_centre",
          branch_id: nearest?.id ?? null,
          branch_name: nearest?.name ?? null,
          distance_m: distanceM,
          error: `خارج مركز الفرع (${distanceM ?? "—"}م) — تم قفل التواجد. سجّل الخروج ثم عد للتسجيل داخل الفرع.`,
        }));
      }

      const expiresMs = Date.now() + presencePermitMinutes(policy, policyRow?.ttl_minutes) * 60_000;
      const permit = `${crypto.randomBytes(16).toString("hex")}.${expiresMs}`;
      await execute("UPDATE presence_intervals SET permit_nonce = ? WHERE id = ?", permit, open.id);
      await logAction("presence_recheck", "presence_interval", Number(open.id), `branch=${nearest.id} outcome=renewed`);
      return res.json(outcome({
        allowed: true,
        permit,
        expires_at: new Date(expiresMs).toISOString(),
        branch_id: nearest.id,
        branch_name: nearest.name,
        distance_m: Math.round(nearest.distance),
        reason: "ok",
      }));
    } catch (error) {
      log.error("[presence] recheck failed:", error);
      return res.status(500).json({ error: "تعذّر التحقق من التواجد", allowed: false, locked: false });
    }
  });

  app.post("/api/presence/checkout", async (req, res) => {
    try {
      const user = (req as any).user || {};
      if (!user.id) return deny(res, 403, "جلسة غير صالحة");
      const userId = Number(user.id);
      const open = await queryAll(
        `SELECT id, in_at FROM presence_intervals WHERE user_id = ? AND out_at IS NULL`,
        userId,
      ) as { id: number; in_at: string }[];
      if (open.length) {
        await execute(
          `UPDATE presence_intervals SET out_at = CURRENT_TIMESTAMP, closed_reason = 'checkout'
           WHERE user_id = ? AND out_at IS NULL`, userId,
        );
        const employeeId = await employeeIdForUser(userId);
        const days = new Set(open.map((i) => todayDay(new Date(String(i.in_at).replace(" ", "T")))));
        for (const day of days) await recomputePresenceDaily(userId, employeeId, day);
      }
      await logAction("presence_checkout", "presence_interval", userId, `closed ${open.length} interval(s)`);
      return res.json({ ok: true, today: await currentDaily(userId, todayDay()) });
    } catch (error) {
      log.error("[presence] checkout failed:", error);
      return res.status(500).json({ error: "تعذّر تسجيل الخروج" });
    }
  });

  app.get("/api/presence/me", async (req, res) => {
    try {
      const user = (req as any).user || {};
      if (!user.id) return deny(res, 403, "جلسة غير صالحة");
      const userId = Number(user.id);
      const [policyRow, scopes, open] = await Promise.all([
        queryOne("SELECT policy, ttl_minutes FROM user_access_policy WHERE user_id = ?", userId) as Promise<any>,
        queryAll("SELECT branch_id, is_primary FROM user_branch_scope WHERE user_id = ? ORDER BY branch_id", userId) as Promise<any[]>,
        queryOne(
          `SELECT id, user_id, branch_id, in_at, out_at, permit_nonce FROM presence_intervals
           WHERE user_id = ? AND out_at IS NULL ORDER BY in_at DESC LIMIT 1`, userId,
        ) as Promise<any>,
      ]);
      const day = todayDay();
      const policy = normalizePolicy(policyRow?.policy);
      const lock = presenceLock(policy, open?.permit_nonce);
      return res.json({
        policy,
        branches: scopes.map((s) => Number(s.branch_id)),
        today: await currentDaily(userId, day),
        open_interval: open || null,
        permit_expires_at: lock.expires_at ? new Date(lock.expires_at).toISOString() : null,
        locked: lock.locked,
        lock_reason: lock.locked ? "permit_expired" : null,
      });
    } catch (error) {
      log.error("[presence] me failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل بيانات التواجد" });
    }
  });

  /** Picker data for policies/scopes/schedules: no credential columns. */
  app.get("/api/presence/users", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const users = await queryAll(
        `SELECT u.id, u.username, u.role, u.employee_id, e.name
         FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.id`,
      ) as any[];
      return res.json({
        users: users.map((u) => ({
          id: Number(u.id), username: u.username, role: u.role,
          employee_id: u.employee_id === null || u.employee_id === undefined ? null : Number(u.employee_id),
          name: u.name || null,
        })),
      });
    } catch (error) {
      log.error("[presence] users failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل المستخدمين" });
    }
  });

  app.get("/api/presence/policies", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const policies = await queryAll(
        `SELECT u.id AS user_id, u.username, e.name,
                COALESCE(p.policy, 'open') AS policy,
                COALESCE(p.ttl_minutes, 10) AS ttl_minutes,
                p.updated_by, p.updated_at
         FROM users u
         LEFT JOIN employees e ON e.id = u.employee_id
         LEFT JOIN user_access_policy p ON p.user_id = u.id
         ORDER BY u.id`,
      ) as any[];
      return res.json({ policies });
    } catch (error) {
      log.error("[presence] policies list failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل سياسات التواجد" });
    }
  });

  app.post("/api/presence/policies", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const userId = Number(req.body?.user_id);
      const policy = String(req.body?.policy || "");
      if (!Number.isSafeInteger(userId) || userId <= 0) return deny(res, 400, "user_id غير صالح");
      if (!POLICIES.has(policy)) return deny(res, 400, "سياسة التواجد غير معروفة");
      const ttl = req.body?.ttl_minutes === undefined || req.body?.ttl_minutes === null || req.body?.ttl_minutes === ""
        ? 10 : Number(req.body.ttl_minutes);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 1440) return deny(res, 400, "ttl_minutes يجب أن يكون بين 1 و1440");
      const user = await queryOne("SELECT id FROM users WHERE id = ?", userId);
      if (!user) return deny(res, 404, "المستخدم غير موجود");
      await execute(
        `INSERT INTO user_access_policy (user_id, policy, ttl_minutes, updated_by, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           policy = EXCLUDED.policy, ttl_minutes = EXCLUDED.ttl_minutes,
           updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
        userId, policy, ttl, actorOf(req),
      );
      await logAction("update", "user_access_policy", userId, `policy=${policy} ttl=${ttl}`);
      return res.json({ ok: true, user_id: userId, policy, ttl_minutes: ttl });
    } catch (error) {
      log.error("[presence] policy save failed:", error);
      return res.status(500).json({ error: "تعذّر حفظ السياسة" });
    }
  });

  app.get("/api/presence/scopes", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const scopes = await queryAll(
        `SELECT s.user_id, s.branch_id, s.is_primary, b.name AS branch_name,
                u.username, e.name
         FROM user_branch_scope s
         LEFT JOIN branches b ON b.id = s.branch_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN employees e ON e.id = u.employee_id
         ORDER BY s.user_id, s.branch_id`,
      ) as any[];
      return res.json({
        scopes: scopes.map((s) => ({
          user_id: Number(s.user_id), branch_id: Number(s.branch_id),
          branch_name: s.branch_name || null, username: s.username, name: s.name || null,
          is_primary: !!s.is_primary,
        })),
      });
    } catch (error) {
      log.error("[presence] scopes list failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل نطاقات الفروع" });
    }
  });

  app.post("/api/presence/scopes", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const userId = Number(req.body?.user_id);
      if (!Number.isSafeInteger(userId) || userId <= 0) return deny(res, 400, "user_id غير صالح");
      const rawIds: unknown[] = Array.isArray(req.body?.branch_ids) ? req.body.branch_ids : [];
      const branchIds: number[] = [...new Set(rawIds.map((id) => Number(id)))];
      if (!branchIds.length || branchIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        return deny(res, 400, "branch_ids يجب أن تكون قائمة معرّفات صحيحة");
      }
      const user = await queryOne("SELECT id FROM users WHERE id = ?", userId);
      if (!user) return deny(res, 404, "المستخدم غير موجود");
      for (const branchId of branchIds) {
        const branch = await queryOne("SELECT id FROM branches WHERE id = ?", branchId);
        if (!branch) return deny(res, 400, `الفرع ${branchId} غير موجود`);
      }
      const primary = Number(req.body?.is_primary ? 1 : 0);
      // One transaction: a reader must never see a half-replaced scope set.
      await transaction(async () => {
        await execute("DELETE FROM user_branch_scope WHERE user_id = ?", userId);
        for (const [index, branchId] of branchIds.entries()) {
          await execute(
            `INSERT INTO user_branch_scope (user_id, branch_id, is_primary)
             VALUES (?, ?, ?)`,
            userId, branchId, index === 0 ? primary : 0,
          );
        }
      })();
      await logAction("update", "user_branch_scope", userId, `branches=${branchIds.join(",")}`);
      return res.json({ ok: true, user_id: userId, branch_ids: branchIds });
    } catch (error) {
      log.error("[presence] scopes save failed:", error);
      return res.status(500).json({ error: "تعذّر حفظ نطاقات الفروع" });
    }
  });

  app.get("/api/presence/schedules", requireOrganizationScope, async (req, res) => {
    const role = roleOf(req);
    if (!isHr(req) && role !== "employee_ess") return deny(res, 403, "غير مسموح بعرض الجداول");
    try {
      const scope = organizationScope(res);
      const schedules = await queryAll(
        `SELECT s.id, s.employee_id, e.name AS employee_name, s.work_start_time, s.work_end_time,
                s.working_days_json, s.break_minutes, s.effective_from, s.effective_to
         FROM employee_work_schedule s JOIN employees e ON e.id = s.employee_id
         WHERE ${employeeScopeSql}
         ORDER BY s.effective_from DESC, s.id DESC`,
        ...employeeScopeParams(scope),
      ) as any[];
      return res.json({ schedules });
    } catch (error) {
      log.error("[presence] schedules list failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل الجداول" });
    }
  });

  app.post("/api/presence/schedules", requireOrganizationScope, async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const employeeId = Number(req.body?.employee_id);
      if (!Number.isSafeInteger(employeeId) || employeeId <= 0) return deny(res, 400, "employee_id غير صالح");
      if (await denyEmployee(res, organizationScope(res), employeeId)) return;
      const workStart = String(req.body?.work_start_time || "");
      const workEnd = String(req.body?.work_end_time || "");
      if (minutesOfTime(workStart) === null || minutesOfTime(workEnd) === null) {
        return deny(res, 400, "وقت العمل يجب أن يكون بصيغة HH:MM");
      }
      const days = workingDays(req.body?.working_days_json ?? "[1,2,3,4,5]");
      if (!days.length) return deny(res, 400, "working_days_json يجب أن تكون مصفوفة أيام صحيحة");
      const breakMinutes = Number(req.body?.break_minutes ?? 0);
      if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) {
        return deny(res, 400, "break_minutes غير صالح");
      }
      const effectiveFrom = String(req.body?.effective_from || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return deny(res, 400, "effective_from مطلوب بصيغة YYYY-MM-DD");
      const effectiveTo = req.body?.effective_to ? String(req.body.effective_to) : null;
      if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) return deny(res, 400, "effective_to غير صالح");
      const inserted = await execute(
        `INSERT INTO employee_work_schedule
           (employee_id, work_start_time, work_end_time, working_days_json, break_minutes,
            effective_from, effective_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        employeeId, workStart, workEnd, JSON.stringify(days), breakMinutes,
        effectiveFrom, effectiveTo, actorOf(req),
      );
      await logAction("create", "employee_work_schedule", Number(inserted.lastInsertRowid || employeeId), `employee=${employeeId}`);
      return res.json({ ok: true, id: Number(inserted.lastInsertRowid || 0) });
    } catch (error) {
      log.error("[presence] schedule save failed:", error);
      return res.status(500).json({ error: "تعذّر حفظ الجدول" });
    }
  });

  app.post("/api/presence/exit-request", async (req, res) => {
    try {
      const user = (req as any).user || {};
      if (!user.id) return deny(res, 403, "جلسة غير صالحة");
      const userId = Number(user.id);
      const employeeId = await employeeIdForUser(userId);
      const employee = employeeId
        ? await queryOne("SELECT id FROM employees WHERE id = ?", employeeId)
        : undefined;
      if (!employee) return deny(res, 400, "الحساب غير مرتبط بموظف");
      const startsAt = String(req.body?.starts_at || "");
      const endsAt = String(req.body?.ends_at || "");
      const start = intervalTime(startsAt);
      const end = intervalTime(endsAt);
      if (start === null || end === null || end <= start) return deny(res, 400, "فترة الخروج غير صالحة");
      const reason = String(req.body?.reason || "").trim() || "طلب خروج من بوابة الموظف";

      // approval_requests requires a live workflow and an employee as requester;
      // the workflow is seeded once, lazily, so a fresh database needs no extra
      // migration step before the first ESS exit request.
      let workflow = await queryOne(
        "SELECT id, levels_json FROM approval_workflows WHERE workflow_type = 'exit_permission' AND is_active = 1 ORDER BY id LIMIT 1",
      ) as any;
      if (!workflow) {
        const inserted = await execute(
          `INSERT INTO approval_workflows (workflow_type, title, description, conditions_json, levels_json, is_active)
           VALUES ('exit_permission', 'مسار أذون الخروج', 'اعتماد أذون الخروج من بوابة الموظف', '{}', ?, 1)`,
          JSON.stringify([{ level: 1, approver_role: "branch_manager" }]),
        );
        workflow = { id: inserted.lastInsertRowid, levels_json: "[]" };
      }
      let levels: unknown[] = [];
      try { levels = JSON.parse(String(workflow.levels_json || "[]")); } catch { levels = []; }

      const result = await transaction(async () => {
        const windowInsert = await execute(
          `INSERT INTO presence_request_windows (approval_request_id, user_id, starts_at, ends_at)
           VALUES (?, ?, ?, ?)`,
          0, userId, new Date(start).toISOString(), new Date(end).toISOString(),
        );
        const windowId = Number(windowInsert.lastInsertRowid);
        const approvalInsert = await execute(
          `INSERT INTO approval_requests
             (workflow_id, requester_id, request_type, request_title, amount, details,
              current_level, max_levels, status, approval_history_json, entity_type, entity_id)
           VALUES (?, ?, 'exit_permission', ?, 0, ?, 1, ?, 'pending', '[]', 'exit_permission', ?)`,
          Number(workflow.id), employeeId, "طلب إذن خروج", reason, Math.max(1, levels.length), windowId,
        );
        const approvalRequestId = Number(approvalInsert.lastInsertRowid);
        await execute(
          "UPDATE presence_request_windows SET approval_request_id = ? WHERE id = ?",
          approvalRequestId, windowId,
        );
        return { id: windowId, approval_request_id: approvalRequestId };
      })();
      await logAction("create", "exit_permission", result.id, `window=${result.id} approval=${result.approval_request_id}`);
      await createNotification("طلب إذن خروج جديد", `رفع الموظف ${employeeId} طلب إذن خروج بانتظار الاعتماد`, "info");
      return res.json({ ok: true, ...result });
    } catch (error) {
      log.error("[presence] exit request failed:", error);
      return res.status(500).json({ error: "تعذّر رفع طلب الخروج" });
    }
  });

  app.get("/api/presence/exit-requests", requireOrganizationScope, async (req, res) => {
    const role = roleOf(req);
    if (!isHr(req) && role !== "branch_manager" && role !== "employee_ess") {
      return deny(res, 403, "غير مسموح بعرض طلبات الخروج");
    }
    try {
      const user = (req as any).user || {};
      const scope = organizationScope(res);
      const requests = await queryAll(
        `SELECT pw.id, pw.approval_request_id, pw.user_id, pw.starts_at, pw.ends_at,
                ar.details AS reason, ar.status, e.name AS employee_name
         FROM presence_request_windows pw
         JOIN approval_requests ar ON ar.id = pw.approval_request_id
         JOIN users u ON u.id = pw.user_id
         LEFT JOIN employees e ON e.id = u.employee_id
         WHERE ${employeeScopeSql}
         ORDER BY pw.starts_at DESC, pw.id DESC`,
        ...employeeScopeParams(scope),
      ) as any[];
      return res.json({
        requests: requests.map((r) => ({
          id: Number(r.id), approval_request_id: Number(r.approval_request_id),
          user_id: Number(r.user_id), employee_name: r.employee_name || null,
          starts_at: r.starts_at, ends_at: r.ends_at, reason: r.reason || null, status: r.status,
        })),
      });
    } catch (error) {
      log.error("[presence] exit requests list failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل طلبات الخروج" });
    }
  });

  app.get("/api/presence/violations", requireOrganizationScope, async (req, res) => {
    const role = roleOf(req);
    if (!isSupervisor(req) && role !== "employee_ess") return deny(res, 403, "غير مسموح بعرض المخالفات");
    try {
      const rows = await scopedViolations(organizationScope(res), req.query);
      return res.json({
        violations: rows.map((v) => ({
          id: Number(v.id), user_id: Number(v.user_id),
          employee_name: v.employee_name || null, day: v.day,
          branch_id: v.branch_id === null ? null : Number(v.branch_id),
          branch_name: v.branch_name || null,
          minutes: num(v.minutes), value_sar: num(v.value_sar), status: v.status,
          decision: v.decision || null,
          decision_percent: v.decision_percent === null ? null : num(v.decision_percent),
          supervisor_confirmed_by: v.supervisor_confirmed_by || null,
          decided_by: v.decided_by || null, reason: v.reason || null,
        })),
      });
    } catch (error) {
      log.error("[presence] violations list failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل المخالفات" });
    }
  });

  app.get("/api/presence/reports/hours", requireOrganizationScope, async (req, res) => {
    if (!isHr(req) && roleOf(req) !== "branch_manager" && roleOf(req) !== "employee_ess") {
      return deny(res, 403, "غير مسموح بعرض تقرير الساعات");
    }
    try {
      const report = await buildHoursReport(organizationScope(res), req.query);
      return res.json(report);
    } catch (error) {
      log.error("[presence] hours report failed:", error);
      return res.status(500).json({ error: "تعذّر إنشاء تقرير الساعات" });
    }
  });

  app.get("/api/presence/reports/hours/csv", requireOrganizationScope, async (req, res) => {
    if (!isHr(req) && roleOf(req) !== "branch_manager" && roleOf(req) !== "employee_ess") {
      return deny(res, 403, "غير مسموح بتصدير تقرير الساعات");
    }
    try {
      sendCsv(res, await buildHoursReport(organizationScope(res), req.query), "presence-hours");
    } catch (error) {
      log.error("[presence] hours CSV failed:", error);
      return res.status(500).json({ error: "تعذّر تصدير تقرير الساعات" });
    }
  });

  app.get("/api/presence/reports/violations", requireOrganizationScope, async (req, res) => {
    if (!isHr(req) && roleOf(req) !== "branch_manager" && roleOf(req) !== "employee_ess") {
      return deny(res, 403, "غير مسموح بعرض تقرير المخالفات");
    }
    try {
      const report = await buildViolationsReport(organizationScope(res), req.query);
      return res.json(report);
    } catch (error) {
      log.error("[presence] violations report failed:", error);
      return res.status(500).json({ error: "تعذّر إنشاء تقرير المخالفات" });
    }
  });

  app.get("/api/presence/reports/violations/csv", requireOrganizationScope, async (req, res) => {
    if (!isHr(req) && roleOf(req) !== "branch_manager" && roleOf(req) !== "employee_ess") {
      return deny(res, 403, "غير مسموح بتصدير تقرير المخالفات");
    }
    try {
      sendCsv(res, await buildViolationsReport(organizationScope(res), req.query), "presence-violations");
    } catch (error) {
      log.error("[presence] violations CSV failed:", error);
      return res.status(500).json({ error: "تعذّر تصدير تقرير المخالفات" });
    }
  });

  app.post("/api/presence/violations/:id/confirm", async (req, res) => {
    if (!isSupervisor(req)) return deny(res, 403, "المشرف فقط يؤكد المخالفات");
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) return deny(res, 400, "معرّف المخالفة غير صالح");
      const violation = await queryOne(
        `SELECT av.id, av.user_id, av.day, av.branch_id, av.status, av.value_sar, av.decision_percent
         FROM attendance_violations av WHERE av.id = ?`, id,
      ) as any;
      if (!violation) return deny(res, 404, "المخالفة غير موجودة");
      if (!isHr(req)) {
        const ownEmployeeId = await employeeIdForUser(Number((req as any).user.id));
        const own = ownEmployeeId
          ? await queryOne("SELECT branch_id FROM employees WHERE id = ?", ownEmployeeId)
          : undefined;
        if (!own?.branch_id || Number(violation.branch_id) !== Number(own.branch_id)) {
          return deny(res, 403, "المخالفة خارج نطاق فرعك");
        }
      }
      // value_sar and decision_percent from the body are deliberately ignored:
      // a supervisor confirms facts, never the amount or the deduction.
      await execute(
        `UPDATE attendance_violations
         SET supervisor_confirmed_by = ?, supervisor_confirmed_at = CURRENT_TIMESTAMP,
             status = 'pending_hr'
         WHERE id = ?`,
        actorOf(req), id,
      );
      await logAction("confirm", "attendance_violation", id, `supervisor=${actorOf(req)}`);
      const updated = await queryOne("SELECT * FROM attendance_violations WHERE id = ?", id) as any;
      return res.json({ ok: true, violation: updated });
    } catch (error) {
      log.error("[presence] violation confirm failed:", error);
      return res.status(500).json({ error: "تعذّر تأكيد المخالفة" });
    }
  });

  app.post("/api/presence/violations/:id/decide", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) return deny(res, 400, "معرّف المخالفة غير صالح");
      const violation = await queryOne(
        `SELECT id, user_id, day, minutes, status, supervisor_confirmed_by, supervisor_confirmed_at
         FROM attendance_violations WHERE id = ?`, id,
      ) as any;
      if (!violation) return deny(res, 404, "المخالفة غير موجودة");
      if (!violation.supervisor_confirmed_by || !violation.supervisor_confirmed_at) {
        return deny(res, 403, "يجب تأكيد المخالفة من المشرف قبل قرار الموارد البشرية");
      }
      const decision = String(req.body?.decision || "");
      if (!DECISIONS.has(decision)) return deny(res, 400, "قرار المخالفة غير معروف");
      let percent: number | null = null;
      if (decision === "partial_deduction") {
        percent = Number(req.body?.decision_percent);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          return deny(res, 400, "نسبة الخصم الجزئي يجب أن تكون بين 0 و100");
        }
        percent = Math.round(percent * 100) / 100;
      }
      const reason = String(req.body?.reason || "").trim() || null;
      await execute(
        `UPDATE attendance_violations
         SET decided_by = ?, decided_at = CURRENT_TIMESTAMP, status = ?, decision = ?,
             decision_percent = ?, reason = COALESCE(?, reason)
         WHERE id = ?`,
        actorOf(req), decision, decision, percent, reason, id,
      );
      await logAction("decide", "attendance_violation", id, `decision=${decision} percent=${percent ?? ""}`);
      await createNotification(
        "قرار مخالفة تواجد",
        `صدر القرار ${decision} على المخالفة رقم ${id} للموظف ${violation.user_id}`,
        "warning",
      );
      const updated = await queryOne("SELECT * FROM attendance_violations WHERE id = ?", id) as any;
      return res.json({ ok: true, violation: updated });
    } catch (error) {
      log.error("[presence] violation decide failed:", error);
      return res.status(500).json({ error: "تعذّر إصدار قرار المخالفة" });
    }
  });

  app.get("/api/presence/drift", async (req, res) => {
    if (!isSupervisor(req)) return deny(res, 403, "غير مسموح بعرض تنبيهات الانحراف");
    try {
      const rows = await queryAll(
        `SELECT a.id, a.user_id, a.branch_id, a.reason, a.detected_at,
                a.acknowledged_by, a.acknowledged_at, u.username, b.name AS branch_name
         FROM policy_drift_alerts a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN branches b ON b.id = a.branch_id
         ORDER BY a.detected_at DESC, a.id DESC`,
      ) as any[];
      return res.json({
        alerts: rows.map((a) => ({
          id: Number(a.id),
          user_id: a.user_id === null ? null : Number(a.user_id),
          branch_id: a.branch_id === null ? null : Number(a.branch_id),
          username: a.username || null, branch_name: a.branch_name || null,
          reason: a.reason, detected_at: a.detected_at,
          acknowledged_by: a.acknowledged_by || null, acknowledged_at: a.acknowledged_at || null,
        })),
      });
    } catch (error) {
      log.error("[presence] drift list failed:", error);
      return res.status(500).json({ error: "تعذّر تحميل تنبيهات الانحراف" });
    }
  });

  app.post("/api/presence/drift/:id/ack", async (req, res) => {
    if (!requireHr(req, res)) return;
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) return deny(res, 400, "معرّف التنبيه غير صالح");
      const alert = await queryOne("SELECT id FROM policy_drift_alerts WHERE id = ?", id);
      if (!alert) return deny(res, 404, "التنبيه غير موجود");
      await execute(
        `UPDATE policy_drift_alerts
         SET acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?`,
        actorOf(req), id,
      );
      await logAction("acknowledge", "policy_drift_alert", id, `by=${actorOf(req)}`);
      const updated = await queryOne("SELECT * FROM policy_drift_alerts WHERE id = ?", id) as any;
      return res.json({ ok: true, alert: updated });
    } catch (error) {
      log.error("[presence] drift ack failed:", error);
      return res.status(500).json({ error: "تعذّر تأكيد التنبيه" });
    }
  });
}
