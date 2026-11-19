import type { OrganizationScope } from './organization-scope';

const num = (v: unknown) => Number(v) || 0;

// Dashboard aggregates under the same organization scope as every other report:
// an entity-bound account sees its entity, a branch manager its branch, and a
// self-service account only its own row. Previously these counts summed the
// whole database for every caller.
export async function buildDashboardStats(db: any, scope: OrganizationScope, now = new Date()) {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const totalBranches = num(((await db.prepare(
    `SELECT COUNT(*) AS count FROM branches WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR id = ?)`
  ).get(scope.entityId, scope.entityId, scope.branchId, scope.branchId)) as any)?.count);
  const totalEmployees = num(((await db.prepare(
    `SELECT COUNT(*) AS count FROM employees WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR branch_id = ?) AND (? IS NULL OR id = ?)`
  ).get(scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any)?.count);
  const totalMonthlyPayroll = num(((await db.prepare(`
    SELECT SUM(p.net_salary) AS total FROM payroll p JOIN employees e ON e.id = p.employee_id
    WHERE p.month = ? AND p.year = ?
      AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
  `).get(month, year, scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any)?.total);
  const payrollByDept = ((await db.prepare(`
    SELECT d.name, SUM(p.net_salary) AS value
    FROM payroll p
    JOIN employees e ON p.employee_id = e.id
    JOIN departments d ON e.department_id = d.id
    WHERE p.month = ? AND p.year = ?
      AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
    GROUP BY d.id, d.name
  `).all(month, year, scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[])
    .map(r => ({ name: r.name, value: num(r.value) }));
  return { totalBranches, totalEmployees, totalMonthlyPayroll, payrollByDept };
}

export async function buildPayrollTrends(db: any, scope: OrganizationScope) {
  const trends = ((await db.prepare(`
    SELECT CAST(p.year AS TEXT) || '-' || CAST(p.month AS TEXT) AS period, SUM(p.net_salary) AS total
    FROM payroll p JOIN employees e ON e.id = p.employee_id
    WHERE (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
    GROUP BY p.year, p.month
    ORDER BY p.year DESC, p.month DESC
    LIMIT 6
  `).all(scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[])
    .map(r => ({ period: r.period, total: num(r.total) }));
  return trends.reverse();
}

export async function buildHeadcount(db: any, scope: OrganizationScope) {
  // Scope predicates sit in the JOIN so departments/branches with no matching
  // employees still appear with a zero count instead of disappearing.
  const byDept = ((await db.prepare(`
    SELECT d.name, COUNT(e.id) AS count
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id
      AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
    WHERE (? IS NULL OR d.entity_id = ?)
    GROUP BY d.id, d.name
  `).all(scope.branchId, scope.branchId, scope.employeeId, scope.employeeId, scope.entityId, scope.entityId)) as any[])
    .map(r => ({ name: r.name, count: num(r.count) }));
  const byBranch = ((await db.prepare(`
    SELECT b.name, COUNT(e.id) AS count
    FROM branches b
    LEFT JOIN employees e ON e.branch_id = b.id AND (? IS NULL OR e.id = ?)
    WHERE (? IS NULL OR b.entity_id = ?) AND (? IS NULL OR b.id = ?)
    GROUP BY b.id, b.name
  `).all(scope.employeeId, scope.employeeId, scope.entityId, scope.entityId, scope.branchId, scope.branchId)) as any[])
    .map(r => ({ name: r.name, count: num(r.count) }));
  return { byDept, byBranch };
}