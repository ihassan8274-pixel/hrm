import {
  assertEmployeeWritableScope,
  assertWritableScope,
  ScopeError,
  type OrganizationScope,
} from "./organization-scope";

/**
 * Write-side tenant rules.
 *
 * Almost every write route names the employee, branch or department it touches
 * — either in the request body, or through the row the URL addresses. The
 * permission layer decides *whether* a role may write; this layer decides *what*
 * it may write. Without it a branch manager can rewrite another branch's
 * attendance, and an entity-bound role can post a payroll penalty against an
 * employee of a different entity.
 *
 * The anchors live here rather than in each handler because the rule has to
 * hold for every write route, including the ones nobody re-reads when the
 * permission table changes.
 */

// Body fields that name the employee the write is about.
const EMPLOYEE_BODY_FIELDS = [
  "employee_id",
  "employeeId",
  "requester_id",
  "sender_id",
  "recipient_id",
  "current_assigned_to",
  "assigned_employee_id",
  "from_employee_id",
  "to_employee_id",
  "current_holder_id",
  "primary_successor_id",
  "secondary_successor_id",
  "manager_id",
] as const;

// Body fields that name the branch the write is about.
const BRANCH_BODY_FIELDS = ["branch_id", "to_branch_id", "assigned_branch_id"] as const;

// Body fields that name the department the write is about.
const DEPARTMENT_BODY_FIELDS = ["department_id"] as const;

/**
 * A route addressed by a row id whose row carries an anchor. The SQL is spelled
 * out per route instead of being built from a table name, so the statement is
 * fixed at compile time and stays readable in review. The pattern captures the
 * row id, because a middleware registered on the app never sees the parsed
 * route parameters.
 */
interface RowAnchor {
  method: string;
  pattern: RegExp;
  sql: string;
  label: string;
}

const ROW_EMPLOYEE_ANCHORS: RowAnchor[] = [
  { method: "*", pattern: /^\/api\/employees\/(\d+)$/, sql: "SELECT id AS employee_id FROM employees WHERE id = ?", label: "الموظف" },
  { method: "*", pattern: /^\/api\/visas\/(\d+)$/, sql: "SELECT employee_id FROM visas WHERE id = ?", label: "التأشيرة" },
  { method: "*", pattern: /^\/api\/flight-tickets\/(\d+)$/, sql: "SELECT employee_id FROM flight_tickets WHERE id = ?", label: "تذكرة السفر" },
  { method: "*", pattern: /^\/api\/disciplinary\/violations\/(\d+)$/, sql: "SELECT employee_id FROM disciplinary_violations WHERE id = ?", label: "المخالفة" },
  { method: "*", pattern: /^\/api\/disciplinary\/violations\/(\d+)\/apply-payroll$/, sql: "SELECT employee_id FROM disciplinary_violations WHERE id = ?", label: "المخالفة" },
  { method: "*", pattern: /^\/api\/clearances\/(\d+)$/, sql: "SELECT employee_id FROM employee_clearances WHERE id = ?", label: "المخالصة" },
  { method: "*", pattern: /^\/api\/clearances\/(\d+)\/department$/, sql: "SELECT employee_id FROM employee_clearances WHERE id = ?", label: "المخالصة" },
  { method: "*", pattern: /^\/api\/work-injuries\/(\d+)$/, sql: "SELECT employee_id FROM work_injuries WHERE id = ?", label: "إصابة العمل" },
  { method: "*", pattern: /^\/api\/grievances\/(\d+)\/status$/, sql: "SELECT employee_id FROM employee_grievances WHERE id = ?", label: "الشكوى" },
  { method: "*", pattern: /^\/api\/employee-documents\/(\d+)$/, sql: "SELECT employee_id FROM employee_documents WHERE id = ?", label: "مستند الموظف" },
  { method: "*", pattern: /^\/api\/salary-certificates\/(\d+)$/, sql: "SELECT employee_id FROM salary_certificates WHERE id = ?", label: "شهادة الراتب" },
  { method: "*", pattern: /^\/api\/qiwa\/contracts\/(\d+)$/, sql: "SELECT employee_id FROM qiwa_contracts WHERE id = ?", label: "عقد قوى" },
  { method: "*", pattern: /^\/api\/health-certificates\/(\d+)$/, sql: "SELECT employee_id FROM health_certificates WHERE id = ?", label: "الشهادة الصحية" },
  { method: "*", pattern: /^\/api\/medical\/dependents\/(\d+)$/, sql: "SELECT employee_id FROM medical_dependents WHERE id = ?", label: "المعال" },
  { method: "*", pattern: /^\/api\/talent\/succession\/(\d+)$/, sql: "SELECT COALESCE(current_holder_id, primary_successor_id, secondary_successor_id) AS employee_id FROM succession_plans WHERE id = ?", label: "خطة التعاقب" },
  { method: "*", pattern: /^\/api\/fleet\/vehicles\/(\d+)$/, sql: "SELECT assigned_employee_id AS employee_id FROM fleet_vehicles WHERE id = ?", label: "المركبة" },
  { method: "*", pattern: /^\/api\/fleet\/traffic-fines\/(\d+)\/deduct$/, sql: "SELECT employee_id FROM traffic_fines WHERE id = ?", label: "مخالفة المرور" },
  { method: "*", pattern: /^\/api\/telework\/permits\/(\d+)$/, sql: "SELECT employee_id FROM telework_permits WHERE id = ?", label: "تصريح العمل عن بُعد" },
  { method: "*", pattern: /^\/api\/smart-assets\/(\d+)\/assign$/, sql: "SELECT current_assigned_to AS employee_id FROM smart_assets WHERE id = ?", label: "الأصل الذكي" },
  { method: "*", pattern: /^\/api\/checklists\/(\d+)\/toggle$/, sql: "SELECT employee_id FROM checklists WHERE id = ?", label: "قائمة التحقق" },
  { method: "*", pattern: /^\/api\/workflow-requests\/(\d+)\/action$/, sql: "SELECT requester_id AS employee_id FROM approval_requests WHERE id = ?", label: "طلب الموافقة" },
  { method: "*", pattern: /^\/api\/kudos\/(\d+)\/like$/, sql: "SELECT recipient_id AS employee_id FROM peer_kudos WHERE id = ?", label: "التقدير" },
  { method: "*", pattern: /^\/api\/assets\/(\d+)\/assign$/, sql: "SELECT assigned_to AS employee_id FROM assets WHERE id = ?", label: "الأصل" },
  { method: "*", pattern: /^\/api\/bonuses-penalties\/(\d+)$/, sql: "SELECT employee_id FROM bonuses_penalties WHERE id = ?", label: "المكافأة/الجزاء" },
  { method: "*", pattern: /^\/api\/additional-salaries\/(\d+)$/, sql: "SELECT employee_id FROM additional_salaries WHERE id = ?", label: "الدفعة" },
  { method: "*", pattern: /^\/api\/tax-exemptions\/(\d+)\/verify$/, sql: "SELECT employee_id FROM tax_exemption_declarations WHERE id = ?", label: "الإعفاء" },
  { method: "*", pattern: /^\/api\/overtime\/(\d+)$/, sql: "SELECT employee_id FROM overtime_records WHERE id = ?", label: "سجل العمل الإضافي" },
  { method: "*", pattern: /^\/api\/overtime\/(\d+)\/approve$/, sql: "SELECT employee_id FROM overtime_records WHERE id = ?", label: "سجل العمل الإضافي" },
  { method: "*", pattern: /^\/api\/payroll\/slips\/(\d+)\/approve$/, sql: "SELECT employee_id FROM salary_slips WHERE id = ?", label: "قسيمة الراتب" },
  { method: "*", pattern: /^\/api\/payroll\/slips\/(\d+)\/cancel$/, sql: "SELECT employee_id FROM salary_slips WHERE id = ?", label: "قسيمة الراتب" },
];

/** Routes addressed by a row id whose row carries the branch anchor. */
const ROW_BRANCH_ANCHORS: RowAnchor[] = [
  { method: "*", pattern: /^\/api\/attendance\/devices\/(\d+)$/, sql: "SELECT branch_id FROM attendance_devices WHERE id = ?", label: "جهاز الحضور" },
  { method: "*", pattern: /^\/api\/attendance\/devices\/(\d+)\/reset-pair$/, sql: "SELECT branch_id FROM attendance_devices WHERE id = ?", label: "جهاز الحضور" },
];

/** Body fields that point at a row which itself carries the employee anchor. */
const BODY_EMPLOYEE_ANCHORS: Array<{ field: string; sql: string; label: string }> = [
  { field: "grievance_id", sql: "SELECT employee_id FROM employee_grievances WHERE id = ?", label: "الشكوى" },
];

/** Body fields that point at a row which itself carries the department anchor. */
const BODY_DEPARTMENT_ANCHORS: Array<{ field: string; sql: string; label: string }> = [
  { field: "job_id", sql: "SELECT department_id FROM job_openings WHERE id = ?", label: "الوظيفة" },
];

export const UNBOUND_ACCOUNT_MESSAGE =
  "الحساب غير مرتبط بكيان — اربط الحساب بكيان قبل تنفيذ هذه العملية";

function numericId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function collectNumericIds(body: Record<string, unknown>, fields: readonly string[]): number[] {
  const ids: number[] = [];
  for (const field of fields) {
    const parsed = numericId(body?.[field]);
    if (parsed !== null && !ids.includes(parsed)) ids.push(parsed);
  }
  return ids;
}

/**
 * Finds the anchor of the row the URL addresses. The id comes from the URL
 * itself: a middleware registered on the app never sees the parsed route
 * parameters, so the pattern has to carry them.
 */
function matchRowAnchor(anchors: RowAnchor[], method: string, url: string): { anchor: RowAnchor; id: number } | null {
  for (const anchor of anchors) {
    if (anchor.method !== "*" && anchor.method !== method) continue;
    const match = anchor.pattern.exec(url);
    if (!match) continue;
    const id = numericId(match[1]);
    if (id === null) continue;
    return { anchor, id };
  }
  return null;
}

/**
 * The employee a row belongs to, resolved through the row the URL addresses.
 * A row that does not exist carries no anchor, and a row whose anchor column is
 * empty belongs to no employee — which an entity-bound caller may not touch.
 */
async function resolveRowEmployee(
  database: any,
  method: string,
  url: string
): Promise<{ employeeId: number | null; label: string } | null> {
  const match = matchRowAnchor(ROW_EMPLOYEE_ANCHORS, method, url);
  if (!match) return null;
  const row = await database.prepare(match.anchor.sql).get(match.id) as { employee_id: number | null } | undefined;
  if (!row) return null;
  return { employeeId: row.employee_id ?? null, label: match.anchor.label };
}

/**
 * Checks one write against the caller's organization scope.
 *
 * Throws a ScopeError (400/403) when the write reaches outside the caller's
 * entity, branch or employee. A null scope means the account carries no
 * binding at all — nothing can be proven about where its records live, so any
 * write that names a record is refused.
 */
export async function assertTenantWriteScope(
  database: any,
  scope: OrganizationScope | null,
  req: { method: string; url: string; body?: Record<string, unknown> }
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const bodyEmployees = collectNumericIds(body, EMPLOYEE_BODY_FIELDS);
  const bodyBranches = collectNumericIds(body, BRANCH_BODY_FIELDS);
  const bodyDepartments = collectNumericIds(body, DEPARTMENT_BODY_FIELDS);
  const bodyEmployeeAnchors = BODY_EMPLOYEE_ANCHORS.filter(anchor => numericId(body[anchor.field]) !== null);
  const bodyDepartmentAnchors = BODY_DEPARTMENT_ANCHORS.filter(anchor => numericId(body[anchor.field]) !== null);
  const rowEmployee = matchRowAnchor(ROW_EMPLOYEE_ANCHORS, req.method, req.url);
  const rowBranch = matchRowAnchor(ROW_BRANCH_ANCHORS, req.method, req.url);

  if (scope === null) {
    const namesARecord =
      bodyEmployees.length > 0 ||
      bodyBranches.length > 0 ||
      bodyDepartments.length > 0 ||
      bodyEmployeeAnchors.length > 0 ||
      bodyDepartmentAnchors.length > 0 ||
      rowEmployee !== null ||
      rowBranch !== null;
    if (namesARecord) throw new ScopeError(403, UNBOUND_ACCOUNT_MESSAGE);
    return;
  }

  for (const employeeId of bodyEmployees) {
    await assertEmployeeWritableScope(database, scope, employeeId, "الموظف");
  }

  for (const anchor of bodyEmployeeAnchors) {
    const id = numericId(body[anchor.field]);
    if (id === null) continue;
    const row = await database.prepare(anchor.sql).get(id) as { employee_id: number | null } | undefined;
    if (row?.employee_id != null) {
      await assertEmployeeWritableScope(database, scope, row.employee_id, anchor.label);
    }
  }

  const rowEmployeeId = await resolveRowEmployee(database, req.method, req.url);
  if (rowEmployeeId) {
    if (rowEmployeeId.employeeId !== null) {
      await assertEmployeeWritableScope(database, scope, rowEmployeeId.employeeId, rowEmployeeId.label);
    } else if (bodyEmployees.length === 0 && scope.entityId !== null) {
      // The row is not attached to any employee, so its owner cannot be proven.
      // Only an admin without an entity filter may touch it.
      throw new ScopeError(403, `${rowEmployeeId.label} غير مرتبط بكيان — التعديل متاح للمسؤول فقط`);
    }
  }

  const branchIds = [...bodyBranches];
  if (rowBranch) {
    const row = await database.prepare(rowBranch.anchor.sql).get(rowBranch.id) as { branch_id: number | null } | undefined;
    if (row?.branch_id != null && !branchIds.includes(row.branch_id)) branchIds.push(row.branch_id);
  }
  for (const branchId of branchIds) {
    const branch = await database
      .prepare("SELECT id, entity_id FROM branches WHERE id = ?")
      .get(branchId) as { id: number; entity_id: number | null } | undefined;
    if (!branch) throw new ScopeError(400, "الفرع غير موجود");
    assertWritableScope(scope, { entityId: branch.entity_id, branchId: branch.id }, "الفرع");
  }

  const departmentIds = [...bodyDepartments];
  for (const anchor of bodyDepartmentAnchors) {
    const id = numericId(body[anchor.field]);
    if (id === null) continue;
    const row = await database.prepare(anchor.sql).get(id) as { department_id: number | null } | undefined;
    if (row?.department_id != null && !departmentIds.includes(row.department_id)) {
      departmentIds.push(row.department_id);
    }
  }
  for (const departmentId of departmentIds) {
    const department = await database
      .prepare("SELECT id, entity_id FROM departments WHERE id = ?")
      .get(departmentId) as { id: number; entity_id: number | null } | undefined;
    if (!department) throw new ScopeError(400, "الإدارة غير موجودة");
    assertWritableScope(scope, { entityId: department.entity_id, branchId: null }, "الإدارة");
  }
}
