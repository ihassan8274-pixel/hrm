import { optionalId, ScopeError, type OrganizationScope } from './organization-scope';

const emptyMetrics = () => ({
  employee_count: 0, saudi_count: 0, expat_count: 0, payroll_count: 0,
  gross: 0, deductions: 0, net: 0, gosi_comp: 0, absence_days: 0,
  attendance_records: 0, attendance_log_count: 0, leaves_approved: 0,
  contracts_expiring_90d: 0, health_certs_expiring_60d: 0, hse_inspections: 0,
});
type Metrics = ReturnType<typeof emptyMetrics>;
const keys = Object.keys(emptyMetrics()) as (keyof Metrics)[];
const moneyKeys = ['gross', 'deductions', 'net', 'gosi_comp'] as const;
type Branch = Metrics & { id: number | null; name: string; location: string | null; is_active: number };
type Entity = { id: number | null; name: string; currency: string | null; branches: Branch[]; totals: Metrics };
const addMetrics = (to: Metrics, from: Metrics) => { for (const key of keys) to[key] += from[key]; };
const roundMoney = (metrics: Metrics) => { for (const key of moneyKeys) metrics[key] = Math.round((metrics[key] + Number.EPSILON) * 100) / 100; };

export async function buildConsolidatedReport(db: any, scope: OrganizationScope, allowed: OrganizationScope, query: Record<string, unknown>, now = new Date()) {
  const latest = await db.prepare(`
    SELECT p.month, p.year FROM payroll p JOIN employees e ON e.id = p.employee_id
    WHERE (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?)
    ORDER BY p.year DESC, p.month DESC LIMIT 1
  `).get(scope.entityId, scope.entityId, scope.branchId, scope.branchId) as { month: number; year: number } | undefined;
  const selectedMonth = optionalId(query.month, 'الشهر');
  const selectedYear = optionalId(query.year, 'السنة');
  if ((selectedMonth === null) !== (selectedYear === null)) throw new ScopeError(400, 'اختر الشهر والسنة معًا');
  const month = selectedMonth ?? latest?.month ?? now.getMonth() + 1;
  const year = selectedYear ?? latest?.year ?? now.getFullYear();
  if (month > 12 || year < 1900 || year > 9999) throw new ScopeError(400, 'الفترة غير صالحة');
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  const today = now.toISOString().slice(0, 10);
  // The expiry windows are computed here instead of with a database INTERVAL so
  // the same statement runs on every engine and the window never drifts with the
  // database clock.
  const plusDays = (base: string, days: number) =>
    new Date(Date.parse(`${base}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const todayPlus90 = plusDays(today, 90);
  const todayPlus60 = plusDays(today, 60);
  const options = {
    entities: await db.prepare(`SELECT id, COALESCE(name_ar, name_en) AS name, currency FROM entities
      WHERE (? IS NULL OR id = ?) ORDER BY id`).all(allowed.entityId, allowed.entityId) as { id: number; name: string; currency: string }[],
    branches: await db.prepare(`SELECT id, entity_id, name, location, is_active FROM branches
      WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR id = ?) ORDER BY entity_id, id`)
      .all(allowed.entityId, allowed.entityId, allowed.branchId, allowed.branchId) as { id: number; entity_id: number; name: string; location: string | null; is_active: number }[],
  };
  const entities: Entity[] = options.entities.filter(e => scope.entityId === null || e.id === scope.entityId).map(e => ({
    ...e, branches: options.branches.filter(b => b.entity_id === e.id && (scope.branchId === null || b.id === scope.branchId))
      .map(b => ({ id: b.id, name: b.name, location: b.location, is_active: b.is_active, ...emptyMetrics() })), totals: emptyMetrics(),
  }));
  const rows = await db.prepare(`
    WITH pay AS (
      SELECT employee_id, COUNT(*) AS payroll_count, SUM(basic_salary + allowances) AS gross,
        SUM(deductions) AS deductions, SUM(net_salary) AS net, SUM(insurance_comp_share) AS gosi_comp
      FROM payroll WHERE month = @month AND year = @year GROUP BY employee_id
    ), att AS (
      SELECT employee_id, COUNT(*) AS attendance_records, SUM(absence_days) AS absence_days
      FROM attendance WHERE month = @month AND year = @year GROUP BY employee_id
    ), logs AS (
      SELECT employee_id, COUNT(*) AS attendance_log_count FROM attendance_logs
      WHERE substr(CAST(check_in_time AS TEXT), 1, 10) BETWEEN @start AND @end GROUP BY employee_id
    ), leave_counts AS (
      SELECT employee_id, COUNT(*) AS leaves_approved FROM leaves
      WHERE status = 'approved' AND substr(CAST(start_date AS TEXT), 1, 10) <= @end
        AND substr(CAST(end_date AS TEXT), 1, 10) >= @start GROUP BY employee_id
    ), contracts AS (
      SELECT employee_id, COUNT(*) AS contracts_expiring_90d FROM qiwa_contracts
      WHERE substr(CAST(end_date AS TEXT), 1, 10) BETWEEN @today AND @today90 GROUP BY employee_id
    ), certificates AS (
      SELECT employee_id, COUNT(*) AS health_certs_expiring_60d FROM health_certificates
      WHERE status = 'active' AND substr(CAST(expiry_date AS TEXT), 1, 10) BETWEEN @today AND @today60 GROUP BY employee_id
    )
    SELECT e.entity_id, e.branch_id, 1 AS employee_count,
      CASE WHEN e.is_saudi = 1 OR e.nationality IN ('سعودي', 'سعودية') THEN 1 ELSE 0 END AS saudi_count,
      COALESCE(pay.payroll_count, 0) AS payroll_count, COALESCE(pay.gross, 0) AS gross,
      COALESCE(pay.deductions, 0) AS deductions, COALESCE(pay.net, 0) AS net, COALESCE(pay.gosi_comp, 0) AS gosi_comp,
      COALESCE(att.absence_days, 0) AS absence_days, COALESCE(att.attendance_records, 0) AS attendance_records,
      COALESCE(logs.attendance_log_count, 0) AS attendance_log_count, COALESCE(leave_counts.leaves_approved, 0) AS leaves_approved,
      COALESCE(contracts.contracts_expiring_90d, 0) AS contracts_expiring_90d,
      COALESCE(certificates.health_certs_expiring_60d, 0) AS health_certs_expiring_60d
    FROM employees e LEFT JOIN pay ON pay.employee_id = e.id LEFT JOIN att ON att.employee_id = e.id
      LEFT JOIN logs ON logs.employee_id = e.id LEFT JOIN leave_counts ON leave_counts.employee_id = e.id
      LEFT JOIN contracts ON contracts.employee_id = e.id LEFT JOIN certificates ON certificates.employee_id = e.id
    WHERE (CAST(@entity AS INTEGER) IS NULL OR e.entity_id = CAST(@entity AS INTEGER))
      AND (CAST(@branch AS INTEGER) IS NULL OR e.branch_id = CAST(@branch AS INTEGER))
  `).all({ month, year, start, end, today, today90: todayPlus90, today60: todayPlus60, entity: scope.entityId, branch: scope.branchId }) as (Omit<Metrics, 'expat_count' | 'hse_inspections'> & { entity_id: number | null; branch_id: number | null })[];
  for (const row of rows) {
    let entity = entities.find(e => e.id === row.entity_id);
    if (!entity) {
      entity = entities.find(e => e.id === null);
      if (!entity) { entity = { id: null, name: 'موظفون بلا كيان محدد', currency: null, branches: [], totals: emptyMetrics() }; entities.push(entity); }
    }
    let branch = entity.branches.find(b => b.id === row.branch_id);
    if (!branch) {
      branch = entity.branches.find(b => b.id === null);
      if (!branch) { branch = { id: null, name: 'موظفون بلا فرع مطابق للكيان', location: null, is_active: 1, ...emptyMetrics() }; entity.branches.push(branch); }
    }
    addMetrics(branch, { ...row, expat_count: 1 - row.saudi_count, hse_inspections: 0 });
  }
  const inspections = await db.prepare(`SELECT h.branch_id, COUNT(*) AS total FROM hse_inspections h
    JOIN branches b ON b.id = h.branch_id WHERE substr(CAST(h.inspection_date AS TEXT), 1, 10) BETWEEN ? AND ?
    AND (? IS NULL OR b.entity_id = ?) AND (? IS NULL OR b.id = ?) GROUP BY h.branch_id`)
    .all(start, end, scope.entityId, scope.entityId, scope.branchId, scope.branchId) as { branch_id: number; total: number }[];
  const grand = emptyMetrics();
  for (const entity of entities) {
    for (const branch of entity.branches) {
      branch.hse_inspections = inspections.find(i => i.branch_id === branch.id)?.total ?? 0;
      addMetrics(entity.totals, branch);
      roundMoney(branch);
    }
    addMetrics(grand, entity.totals);
    roundMoney(entity.totals);
  }
  roundMoney(grand);
  const currencies = new Set(entities.filter(e => e.branches.length > 0).map(e => e.currency));
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  return { month, year, generated_at: now.toISOString(), latest_payroll: latest ?? null, options, entities, currency,
    grand: { ...grand, ...(!currency ? { gross: null, deductions: null, net: null, gosi_comp: null } : {}) } };
}
