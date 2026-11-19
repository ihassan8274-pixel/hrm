import { optionalId, ScopeError, type OrganizationScope } from './organization-scope';

// Shared period parsing for the salary reports. Month and year are optional and
// independent (the screen always sends both); an absent value falls back to the
// current period. Validation mirrors the consolidated report so every report
// refuses the same malformed input with the same Arabic message.
export function reportPeriod(query: Record<string, unknown>, now = new Date()) {
  const month = optionalId(query.month, 'الشهر') ?? now.getMonth() + 1;
  const year = optionalId(query.year, 'السنة') ?? now.getFullYear();
  if (month > 12 || year < 1900 || year > 9999) throw new ScopeError(400, 'الفترة غير صالحة');
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  return { month, year, start, end };
}

const num = (v: unknown) => Number(v) || 0;

export async function buildCompanySalaryReport(db: any, scope: OrganizationScope, query: Record<string, unknown>, now = new Date()) {
  const { month, year } = reportPeriod(query, now);
  const rows = (await db.prepare(`
    SELECT p.payment_method, COUNT(*) AS emp_count, SUM(p.net_salary) AS total
    FROM payroll p JOIN employees e ON e.id = p.employee_id
    WHERE p.month = ? AND p.year = ?
      AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
    GROUP BY p.payment_method
  `).all(month, year, scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[];
  const cash = rows.find(r => r.payment_method === 'cash');
  const bank = rows.find(r => r.payment_method === 'bank');
  const cashTotal = num(cash?.total);
  const bankTotal = num(bank?.total);
  return {
    month, year,
    cash_total: cashTotal, bank_total: bankTotal, total: cashTotal + bankTotal,
    cash_count: num(cash?.emp_count), bank_count: num(bank?.emp_count),
  };
}

// Cost attribution follows the branch where the work was logged, not the
// employee's assigned branch — an employee who worked ten days in branch A and
// was then transferred still costs branch A those ten days. One grouped query
// replaces the per-employee lookup loop, and the rows are aggregated before the
// response is built (the previous version serialized unawaited promises, so
// every total came back zero and every detail row an empty object).
export async function buildBranchSalaryReport(db: any, scope: OrganizationScope, query: Record<string, unknown>, now = new Date()) {
  const { month, year, start, end } = reportPeriod(query, now);
  const branches = (await db.prepare(`
    SELECT id, name FROM branches
    WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR id = ?) ORDER BY id
  `).all(scope.entityId, scope.entityId, scope.branchId, scope.branchId)) as { id: number; name: string }[];
  const logs = (await db.prepare(`
    SELECT l.branch_id, l.employee_id,
      COUNT(DISTINCT substr(CAST(l.check_in_time AS TEXT), 1, 10)) AS days,
      (COALESCE(e.basic_salary, 0) + COALESCE(e.housing_allowance, 0) + COALESCE(e.transport_allowance, 0)) AS monthly
    FROM attendance_logs l JOIN employees e ON e.id = l.employee_id
    WHERE substr(CAST(l.check_in_time AS TEXT), 1, 10) BETWEEN ? AND ?
      AND (? IS NULL OR l.branch_id = ?) AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR l.employee_id = ?)
    GROUP BY l.branch_id, l.employee_id, e.basic_salary, e.housing_allowance, e.transport_allowance
  `).all(start, end, scope.branchId, scope.branchId, scope.entityId, scope.entityId, scope.employeeId, scope.employeeId)) as any[];
  const result = branches.map(b => {
    const details = logs.filter(l => l.branch_id === b.id).map(l => {
      const days = num(l.days);
      const monthly = num(l.monthly);
      return { employee_id: l.employee_id, days, monthly, cost: Math.round((monthly / 30) * days) };
    });
    return { branch_id: b.id, branch_name: b.name, total_cost: details.reduce((s, d) => s + d.cost, 0), details };
  });
  return { month, year, branches: result };
}

export async function buildPayrollStatement(db: any, scope: OrganizationScope, query: Record<string, unknown>, now = new Date()) {
  const { month, year } = reportPeriod(query, now);
  // Explicit columns: the old SELECT p.*, e.payment_method produced two columns
  // named payment_method and relied on the driver keeping the last one.
  return (await db.prepare(`
    SELECT p.id, p.employee_id, p.month, p.year, p.basic_salary, p.allowances, p.deductions,
      p.net_salary, p.payment_method, p.processed_at,
      e.name AS employee_name, e.branch_id, b.name AS branch_name
    FROM payroll p
    LEFT JOIN employees e ON e.id = p.employee_id
    LEFT JOIN branches b ON b.id = e.branch_id
    WHERE p.month = ? AND p.year = ?
      AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
    ORDER BY e.name, p.id
  `).all(month, year, scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[];
}

// EOSB: half a month per year of service, accrued monthly over the days actually
// worked. Leave: 21 days a year accrued monthly. The formulas are unchanged; the
// attendance lookup is one grouped query instead of one query per employee, and
// an employee with no device logs still accrues over the full month (the manual
// summary fallback the attendance screen relies on).
export async function buildProvisionsReport(db: any, scope: OrganizationScope, query: Record<string, unknown>, now = new Date()) {
  const { month, year, start, end } = reportPeriod(query, now);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const emps = (await db.prepare(`
    SELECT id, name, basic_salary, housing_allowance, transport_allowance FROM employees
    WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR branch_id = ?) AND (? IS NULL OR id = ?) ORDER BY id
  `).all(scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[];
  const att = (await db.prepare(`
    SELECT employee_id, COUNT(DISTINCT substr(CAST(check_in_time AS TEXT), 1, 10)) AS d
    FROM attendance_logs
    WHERE substr(CAST(check_in_time AS TEXT), 1, 10) BETWEEN ? AND ?
    GROUP BY employee_id
  `).all(start, end)) as any[];
  const daysByEmployee = new Map<number, number>(att.map(r => [r.employee_id, num(r.d)]));
  const rows = emps.map(e => {
    const monthlyWage = num(e.basic_salary) + num(e.housing_allowance) + num(e.transport_allowance);
    const daily = monthlyWage / 30;
    const days = daysByEmployee.get(e.id) ?? daysInMonth;
    const eosbProvision = daily * days * (0.5 / 12);
    const leaveProvision = daily * (21 / 12);
    return {
      employee_id: e.id, name: e.name,
      monthly_wage: monthlyWage, days,
      eosb_provision: Math.round(eosbProvision),
      leave_provision: Math.round(leaveProvision),
      total_provision: Math.round(eosbProvision + leaveProvision),
    };
  });
  const totalEosb = rows.reduce((s, r) => s + r.eosb_provision, 0);
  const totalLeave = rows.reduce((s, r) => s + r.leave_provision, 0);
  const totalProvision = rows.reduce((s, r) => s + r.total_provision, 0);
  const payrollTotal = rows.reduce((s, r) => s + r.monthly_wage, 0);
  const ratio = (part: number) => (payrollTotal ? Math.round((part / payrollTotal) * 1000) / 10 : 0);
  return {
    month, year,
    employees: rows,
    total_eosb: totalEosb, total_leave: totalLeave, total_provision: totalProvision,
    payroll_base: payrollTotal,
    eosb_ratio: ratio(totalEosb), leave_ratio: ratio(totalLeave), total_ratio: ratio(totalProvision),
  };
}