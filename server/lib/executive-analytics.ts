import type { OrganizationScope } from './organization-scope';

const num = (v: unknown) => Number(v) || 0;
const round1 = (v: number) => Math.round(v * 10) / 10;

// Executive analytics built only from what this database actually records.
// Anything without a data source is returned as null and the screen renders it
// as "غير متاح" — the previous version invented revenue (wage bill × 4.2),
// expenses (× 2.1), quarterly projections, turnover and tenure constants, and
// asserted 100% government compliance, none of which the system can verify.
export async function buildExecutiveAnalytics(db: any, scope: OrganizationScope, now = new Date()) {
  const employees = (await db.prepare(`
    SELECT e.id, e.department_id, e.is_saudi, e.status, e.contract_start_date,
      e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances,
      d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
  `).all(scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[];

  const totalEmps = employees.length;
  const saudiCount = employees.filter(e => e.is_saudi === 1).length;
  const saudizationRate = totalEmps > 0 ? Math.round((saudiCount / totalEmps) * 100) : 0;
  const wage = (e: any) => num(e.basic_salary) + num(e.housing_allowance) + num(e.transport_allowance) + num(e.other_allowances);
  const totalMonthlyPayroll = employees.reduce((s, e) => s + wage(e), 0);
  const annualizedWageBill = totalMonthlyPayroll * 12;
  const costPerEmployee = totalEmps > 0 ? Math.round(annualizedWageBill / totalEmps) : 0;

  const deptMap: Record<string, { id: number; name: string; count: number; totalSalary: number; saudi: number }> = {};
  for (const emp of employees) {
    const deptName = emp.department_name || 'عام / الإدارة';
    if (!deptMap[deptName]) deptMap[deptName] = { id: emp.department_id || 0, name: deptName, count: 0, totalSalary: 0, saudi: 0 };
    deptMap[deptName].count += 1;
    deptMap[deptName].totalSalary += wage(emp);
    if (emp.is_saudi === 1) deptMap[deptName].saudi += 1;
  }
  const departmentsBreakdown = Object.values(deptMap).map(d => ({
    department_id: d.id,
    department_name: d.name,
    employee_count: d.count,
    total_salary: d.totalSalary,
    avg_salary: Math.round(d.totalSalary / (d.count || 1)),
    saudization_rate: Math.round((d.saudi / (d.count || 1)) * 100),
  }));

  // Real quarterly cost from the payroll register: the current quarter and the
  // three before it. Headcount is the number of employees actually paid in the
  // quarter; growth is quarter-over-quarter and null where there is no prior
  // quarter to compare against.
  const quarterIndex = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  const qrows = (await db.prepare(`
    SELECT p.year, CAST((p.month - 1) / 3 AS INTEGER) AS q,
      SUM(p.net_salary) AS cost, COUNT(DISTINCT p.employee_id) AS headcount
    FROM payroll p JOIN employees e ON e.id = p.employee_id
    WHERE (p.year * 4 + CAST((p.month - 1) / 3 AS INTEGER)) >= ?
      AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
    GROUP BY p.year, CAST((p.month - 1) / 3 AS INTEGER)
    ORDER BY p.year, q
  `).all(quarterIndex - 3, scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any[];
  const quarterlyTrends = qrows.map((r, i) => {
    const cost = Math.round(num(r.cost));
    const prev = i > 0 ? Math.round(num(qrows[i - 1].cost)) : null;
    return {
      quarter: `Q${num(r.q) + 1}-${r.year}`,
      payroll_cost: cost,
      headcount: num(r.headcount),
      growth_pct: prev !== null && prev > 0 ? round1(((cost - prev) / prev) * 100) : null,
    };
  });

  // Tenure is measured from the recorded contract start dates only. Employees
  // without one are excluded from the average rather than guessed from row
  // creation timestamps.
  const today = now.toISOString().slice(0, 10);
  const tenures = employees
    .map(e => (typeof e.contract_start_date === 'string' ? e.contract_start_date.slice(0, 10) : ''))
    .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s) && s <= today)
    .map(s => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000 / 365.25);
  const averageTenureYears = tenures.length ? round1(tenures.reduce((a, b) => a + b, 0) / tenures.length) : null;

  // No termination dates exist in the schema, so an annualized turnover rate
  // cannot be computed honestly. Revenue and operating expenses live in other
  // systems; until they are linked, HC-ROI has no numerator.
  const turnoverRateAnnual = null;
  const estimatedRevenue = null;
  const humanCapitalRoi = null;

  // The only compliance figure this database can prove: the share of active
  // employees holding a Qiwa contract that has not expired. GOSI, WPS and CCHI
  // compliance are verified against the government portals, not here.
  const activeCount = employees.filter(e => e.status === 'active').length;
  const contracted = (await db.prepare(`
    SELECT COUNT(DISTINCT c.employee_id) AS n
    FROM qiwa_contracts c JOIN employees e ON e.id = c.employee_id
    WHERE e.status = 'active' AND (c.end_date IS NULL OR substr(CAST(c.end_date AS TEXT), 1, 10) >= ?)
      AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
  `).get(today, scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId)) as any;
  const qiwaContractsRate = activeCount > 0 ? Math.round((num(contracted?.n) / activeCount) * 100) : null;

  return {
    totalEmployees: totalEmps,
    saudizationRate,
    totalMonthlyPayroll,
    annualizedWageBill,
    estimatedRevenue,
    humanCapitalRoi,
    costPerEmployee,
    turnoverRateAnnual,
    averageTenureYears,
    departmentsBreakdown,
    quarterlyTrends,
    complianceSummary: {
      gosi_compliant: null,
      wps_compliant: null,
      cchi_compliant: null,
      qiwa_contracts_rate: qiwaContractsRate,
    },
  };
}