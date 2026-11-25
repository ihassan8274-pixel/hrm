import { optionalId, ScopeError, type OrganizationScope } from './organization-scope';
import { isGosiExempt, isInsuranceCovered } from './country-rules';
import { reportPeriod } from './salary-reports';

/**
 * Six operational reports requested for the reports module.
 *
 * The shape is deliberately uniform: every builder returns Arabic column
 * labels plus an array of row arrays, so the same result feeds the on-screen
 * table and the CSV export. Every query is filtered by the caller's
 * organization scope and no report invents data — an empty source stays empty.
 */
export interface ExtendedReport {
  key: string;
  title: string;
  columns: string[];
  rows: unknown[][];
  summary: Array<{ label: string; value: number | string }>;
  generated_at: string;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;

function scopeClause(scope: OrganizationScope, alias = 'e'): string {
  return `(? IS NULL OR ${alias}.entity_id = ?) AND (? IS NULL OR ${alias}.branch_id = ?) AND (? IS NULL OR ${alias}.id = ?)`;
}

function scopeParams(scope: OrganizationScope): unknown[] {
  return [scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId];
}

function daysUntil(value: unknown, now: Date): number | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const t = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((t - today) / 86400000);
}

function minutesBetween(start: unknown, end: unknown): number {
  if (!start || !end) return 0;
  const parse = (v: unknown) => {
    if (v instanceof Date) return v.getTime();
    const s = String(v).replace(' ', 'T');
    return Date.parse(/[Z+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  };
  const a = parse(start);
  const b = parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / 60000;
}

function windowDays(query: Record<string, unknown>): number {
  const days = optionalId(query.days, 'نافذة التنبيه') ?? 90;
  if (days > 3650) throw new ScopeError(400, 'نافذة التنبيه غير صالحة');
  return days;
}

function finish(
  key: string,
  title: string,
  columns: string[],
  rows: unknown[][],
  summary: Array<{ label: string; value: number | string }>,
  now: Date,
): ExtendedReport {
  return { key, title, columns, rows, summary, generated_at: now.toISOString() };
}

/** One scoped employee master row reused by all six reports. */
async function scopedEmployees(db: any, scope: OrganizationScope): Promise<any[]> {
  return await db.prepare(`
    SELECT e.id, e.name, e.position, e.branch_id, e.entity_id, b.name AS branch_name,
      e.is_saudi, e.nationality, e.status, e.end_service_date, e.end_service_reason,
      e.gosi_number, e.gosi_registered_salary, e.gosi_exempt,
      e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances,
      e.saudi_iban, e.iqama_expiry_gregorian, e.work_permit_expiry, e.work_permit_number,
      e.medical_insurance_expiry, e.medical_insurance_policy, e.passport_expiry,
      e.passport_number, e.health_cert_expiry, e.health_cert_required,
      e.contract_type, e.contract_end_date, e.national_id_iqama
    FROM employees e LEFT JOIN branches b ON e.branch_id = b.id
    WHERE ${scopeClause(scope)}
    ORDER BY e.id
  `).all(...scopeParams(scope)) as any[];
}

// ---------------------------------------------------------------------------
// 1. Attendance and duty
// ---------------------------------------------------------------------------

export async function buildAttendanceDutyReport(
  db: any, scope: OrganizationScope, query: Record<string, unknown> = {}, now = new Date(),
): Promise<ExtendedReport> {
  const period = reportPeriod(query, now);
  const ym = `${period.year}-${String(period.month).padStart(2, '0')}`;
  const employees = await scopedEmployees(db, scope);

  const logs = (await db.prepare(`
    SELECT l.employee_id, l.check_in_time, l.check_out_time, l.status
    FROM attendance_logs l JOIN employees e ON l.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND substr(CAST(l.check_in_time AS TEXT), 1, 7) = ?
    ORDER BY l.check_in_time
  `).all(...scopeParams(scope), ym)) as any[];

  const monthly = (await db.prepare(`
    SELECT a.employee_id, a.absence_days, a.overtime_hours
    FROM attendance a JOIN employees e ON a.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND a.month = ? AND a.year = ?
  `).all(...scopeParams(scope), period.month, period.year)) as any[];

  // Device-level geofence events are reported per branch, never as raw
  // coordinates and never for an ESS employee (fail closed).
  const geo = scope.employeeId ? [] : (await db.prepare(`
    SELECT d.branch_id, COUNT(*) AS events
    FROM kiosk_security_logs k
    JOIN attendance_devices d ON k.device_id = d.id
    JOIN branches b ON d.branch_id = b.id
    WHERE k.reason = 'geofence' AND substr(CAST(k.created_at AS TEXT), 1, 7) = ?
      AND (? IS NULL OR b.entity_id = ?) AND (? IS NULL OR d.branch_id = ?)
    GROUP BY d.branch_id
  `).all(ym, scope.entityId, scope.entityId, scope.branchId, scope.branchId)) as any[];

  const exits = (await db.prepare(`
    SELECT ar.requester_id AS employee_id, COUNT(*) AS requests
    FROM approval_requests ar JOIN employees e ON ar.requester_id = e.id
    WHERE ${scopeClause(scope, 'e')}
      AND (ar.entity_type = 'exit_permission' OR ar.request_type = 'exit_permission')
      AND ar.status IN ('pending', 'rejected')
    GROUP BY ar.requester_id
  `).all(...scopeParams(scope))) as any[];

  const logsBy = new Map<number, any[]>();
  for (const l of logs) {
    const list = logsBy.get(Number(l.employee_id)) || [];
    list.push(l);
    logsBy.set(Number(l.employee_id), list);
  }
  const monthlyBy = new Map(monthly.map(r => [Number(r.employee_id), r]));
  const geoBy = new Map(geo.map(r => [Number(r.branch_id), Number(r.events)]));
  const exitBy = new Map(exits.map(r => [Number(r.employee_id), Number(r.requests)]));

  const rows = employees.map(e => {
    const entries = logsBy.get(Number(e.id)) || [];
    const presentDays = new Set(entries.map(l => String(l.check_in_time).slice(0, 10))).size;
    const late = entries.filter(l => l.status === 'late').length;
    const open = entries.filter(l => !l.check_out_time).length;
    const minutes = entries.reduce((sum, l) => sum + minutesBetween(l.check_in_time, l.check_out_time), 0);
    return [
      e.name, e.branch_name || '—', presentDays, late, open, round2(minutes / 60),
      geoBy.get(Number(e.branch_id)) || 0, exitBy.get(Number(e.id)) || 0,
      num(monthlyBy.get(Number(e.id))?.absence_days), num(monthlyBy.get(Number(e.id))?.overtime_hours),
    ];
  });

  const sum = (i: number) => round2(rows.reduce((s, r) => s + num(r[i]), 0));
  return finish('attendance', 'الحضور والدوام', [
    'الموظف', 'الفرع', 'أيام الحضور', 'أيام التأخير', 'داخل العمل الآن', 'ساعات داخل العمل',
    'أحداث نطاق الفرع', 'طلبات خروج غير معتمدة', 'أيام الغياب', 'إضافي من الحضور',
  ], rows, [
    { label: 'الموظفون', value: rows.length },
    { label: 'أيام الحضور', value: sum(2) },
    { label: 'أيام التأخير', value: sum(3) },
    { label: 'ساعات داخل العمل', value: sum(5) },
    { label: 'أحداث نطاق الفرع', value: sum(6) },
    { label: 'طلبات خروج غير معتمدة', value: sum(7) },
  ], now);
}

// ---------------------------------------------------------------------------
// 2. Payroll and approved overtime
// ---------------------------------------------------------------------------

export async function buildPayrollOvertimeReport(
  db: any, scope: OrganizationScope, query: Record<string, unknown> = {}, now = new Date(),
): Promise<ExtendedReport> {
  const current = reportPeriod(query, now);
  const prevDate = new Date(Date.UTC(current.year, current.month - 2, 1));
  const previous = { month: prevDate.getUTCMonth() + 1, year: prevDate.getUTCFullYear() };
  const employees = await scopedEmployees(db, scope);

  const payrollTotals = async (p: { month: number; year: number }) => await db.prepare(`
    SELECT p.employee_id, SUM(p.net_salary) AS net, COUNT(*) AS row_count,
      SUM(CASE WHEN p.approval_status = 'approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN p.approval_status IS NULL THEN 1 ELSE 0 END) AS legacy,
      SUM(CASE WHEN p.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN p.is_final_settlement = 1 THEN 1 ELSE 0 END) AS settlements
    FROM payroll p JOIN employees e ON p.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND p.month = ? AND p.year = ?
    GROUP BY p.employee_id
  `).all(...scopeParams(scope), p.month, p.year) as any[];

  const overtimeTotals = async (p: { month: number; year: number }) => await db.prepare(`
    SELECT o.employee_id, SUM(o.hours) AS hours, SUM(o.total_overtime_pay) AS pay, COUNT(*) AS records
    FROM overtime_records o JOIN employees e ON o.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND o.month = ? AND o.year = ? AND o.status = 'approved'
    GROUP BY o.employee_id
  `).all(...scopeParams(scope), p.month, p.year) as any[];

  const attendanceOt = (await db.prepare(`
    SELECT a.employee_id, a.overtime_hours
    FROM attendance a JOIN employees e ON a.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND a.month = ? AND a.year = ?
  `).all(...scopeParams(scope), current.month, current.year)) as any[];

  const [nowPayroll, prevPayroll, nowOt, prevOt] = await Promise.all([
    payrollTotals(current), payrollTotals(previous), overtimeTotals(current), overtimeTotals(previous),
  ]);
  const byId = (list: any[]) => new Map(list.map(r => [Number(r.employee_id), r]));
  const np = byId(nowPayroll), pp = byId(prevPayroll), no = byId(nowOt), po = byId(prevOt);
  const ao = new Map(attendanceOt.map(r => [Number(r.employee_id), num(r.overtime_hours)]));

  const rows = employees.map(e => {
    const id = Number(e.id);
    const net = num(np.get(id)?.net);
    const before = num(pp.get(id)?.net);
    const approvedRecords = num(no.get(id)?.records);
    return [
      e.name, round2(net), round2(before), round2(net - before),
      num(np.get(id)?.row_count), num(np.get(id)?.approved), num(np.get(id)?.legacy),
      num(np.get(id)?.paid), num(np.get(id)?.settlements),
      round2(num(no.get(id)?.hours)), round2(num(no.get(id)?.pay)),
      // An approved overtime record is the single source and suppresses
      // the attendance-derived hours for the same period.
      approvedRecords > 0 ? 0 : ao.get(id) || 0,
      round2(num(po.get(id)?.hours)),
    ];
  });

  const sum = (i: number) => round2(rows.reduce((s, r) => s + num(r[i]), 0));
  return finish('payroll', 'الرواتب والإضافي المعتمد', [
    'الموظف', 'صافي الشهر الحالي', 'صافي الشهر السابق', 'التغير', 'صفوف المسير', 'صفوف معتمدة',
    'صفوف قديمة قابلة للتصدير', 'صفوف مدفوعة', 'تسويات نهائية', 'ساعات إضافي معتمدة',
    'قيمة الإضافي المعتمد', 'إضافي الحضور (مُلغى عند الاعتماد)', 'ساعات الشهر السابق',
  ], rows, [
    { label: 'صافي الشهر', value: sum(1) },
    { label: 'صافي الشهر السابق', value: sum(2) },
    { label: 'صفوف معتمدة', value: sum(5) },
    { label: 'صفوف مدفوعة', value: sum(7) },
    { label: 'ساعات إضافي معتمدة', value: sum(9) },
    { label: 'قيمة الإضافي', value: sum(10) },
  ], now);
}

// ---------------------------------------------------------------------------
// 3. Visas and expiry alerts
// ---------------------------------------------------------------------------

export async function buildExpiryAlertsReport(
  db: any, scope: OrganizationScope, query: Record<string, unknown> = {}, now = new Date(),
): Promise<ExtendedReport> {
  const days = windowDays(query);
  const employees = await scopedEmployees(db, scope);
  const nameBy = new Map(employees.map(e => [Number(e.id), e]));
  const where = scopeClause(scope);
  const params = scopeParams(scope);

  const sources: Array<{ type: string; sql: string }> = [
    {
      type: 'إقامة',
      sql: `SELECT e.id AS employee_id, e.national_id_iqama AS doc_no, e.iqama_expiry_gregorian AS expiry
            FROM employees e WHERE ${where} AND COALESCE(e.is_saudi, 0) <> 1
              AND e.iqama_expiry_gregorian IS NOT NULL AND e.iqama_expiry_gregorian <> ''`,
    },
    {
      type: 'تأشيرة عمل',
      sql: `SELECT e.id AS employee_id, e.work_permit_number AS doc_no, e.work_permit_expiry AS expiry
            FROM employees e WHERE ${where} AND e.work_permit_expiry IS NOT NULL AND e.work_permit_expiry <> ''`,
    },
    {
      type: 'تأمين طبي',
      sql: `SELECT e.id AS employee_id, e.medical_insurance_policy AS doc_no, e.medical_insurance_expiry AS expiry
            FROM employees e WHERE ${where} AND e.medical_insurance_expiry IS NOT NULL AND e.medical_insurance_expiry <> ''`,
    },
    {
      type: 'جواز سفر',
      sql: `SELECT e.id AS employee_id, e.passport_number AS doc_no, e.passport_expiry AS expiry
            FROM employees e WHERE ${where} AND e.passport_expiry IS NOT NULL AND e.passport_expiry <> ''`,
    },
    {
      type: 'شهادة صحية (ملف الموظف)',
      sql: `SELECT e.id AS employee_id, e.health_cert_number AS doc_no, e.health_cert_expiry AS expiry
            FROM employees e WHERE ${where} AND e.health_cert_required = 1
              AND e.health_cert_expiry IS NOT NULL AND e.health_cert_expiry <> ''`,
    },
    {
      type: 'عقد عمل',
      sql: `SELECT e.id AS employee_id, e.contract_type AS doc_no, e.contract_end_date AS expiry
            FROM employees e WHERE ${where} AND e.contract_type = 'fixed'
              AND e.contract_end_date IS NOT NULL AND e.contract_end_date <> ''`,
    },
    {
      type: 'شهادة صحية (بلدي)',
      sql: `SELECT x.employee_id, x.certificate_number AS doc_no, x.expiry_date AS expiry
            FROM health_certificates x JOIN employees e ON x.employee_id = e.id
            WHERE ${where} AND x.status = 'active' AND x.expiry_date IS NOT NULL AND x.expiry_date <> ''`,
    },
    {
      type: 'تأشيرة/خروج',
      sql: `SELECT x.employee_id, x.visa_number AS doc_no, x.expiry_date AS expiry
            FROM visas x JOIN employees e ON x.employee_id = e.id
            WHERE ${where} AND x.status = 'active' AND x.expiry_date IS NOT NULL`,
    },
    {
      type: 'عقد قوى',
      sql: `SELECT x.employee_id, x.contract_number AS doc_no, x.end_date AS expiry
            FROM qiwa_contracts x JOIN employees e ON x.employee_id = e.id
            WHERE ${where} AND x.end_date IS NOT NULL AND x.end_date <> ''`,
    },
    {
      type: 'تجديد حكومي',
      sql: `SELECT x.employee_id, x.identifier AS doc_no, x.expiry_date AS expiry
            FROM government_renewals x JOIN employees e ON x.employee_id = e.id
            WHERE ${where} AND x.status <> 'completed' AND x.expiry_date IS NOT NULL AND x.expiry_date <> ''`,
    },
  ];

  const collected: Array<{ type: string; employee: any; docNo: string; expiry: unknown; left: number }> = [];
  for (const source of sources) {
    const found = (await db.prepare(source.sql).all(...params)) as any[];
    for (const item of found) {
      const left = daysUntil(item.expiry, now);
      if (left === null || left > days) continue;
      const employee = nameBy.get(Number(item.employee_id));
      if (!employee) continue;
      collected.push({ type: source.type, employee, docNo: String(item.doc_no || '—'), expiry: item.expiry, left });
    }
  }
  collected.sort((a, b) => a.left - b.left);

  const severity = (left: number) => left < 0 ? 'منتهي' : left <= 30 ? 'حرج' : left <= 60 ? 'تحذير' : 'قريب';
  const rows = collected.map(d => [
    d.employee.name, d.employee.branch_name || '—', d.type, d.docNo,
    String(d.expiry instanceof Date ? d.expiry.toISOString().slice(0, 10) : String(d.expiry).slice(0, 10)),
    d.left, severity(d.left),
  ]);
  const count = (s: string) => rows.filter(r => r[6] === s).length;
  return finish('expiry', 'التأشيرات والوثائق المنتهية', [
    'الموظف', 'الفرع', 'نوع المستند', 'رقم المستند', 'تاريخ الانتهاء', 'الأيام المتبقية', 'الحالة',
  ], rows, [
    { label: 'إجمالي المستندات', value: rows.length },
    { label: 'منتهي', value: count('منتهي') },
    { label: 'حرج (≤30 يوم)', value: count('حرج') },
    { label: 'تحذير (≤60 يوم)', value: count('تحذير') },
    { label: `قريب (≤${days} يوم)`, value: count('قريب') },
  ], now);
}

// ---------------------------------------------------------------------------
// 4. GOSI and KSA compliance
// ---------------------------------------------------------------------------

export async function buildKsaComplianceReport(
  db: any, scope: OrganizationScope, query: Record<string, unknown> = {}, now = new Date(),
): Promise<ExtendedReport> {
  const period = reportPeriod(query, now);
  const employees = await scopedEmployees(db, scope);
  const settings = (await db.prepare('SELECT key, value FROM settings').all()) as any[];
  const cfg: Record<string, string> = {};
  for (const s of settings) cfg[s.key] = String(s.value);
  const empRate = (parseFloat(cfg.saudi_gosi_emp_rate || '9.75') || 9.75) / 100;
  const compRate = (parseFloat(cfg.saudi_gosi_comp_rate || '11.75') || 11.75) / 100;
  const expatRate = (parseFloat(cfg.expat_gosi_comp_rate || '2') || 2) / 100;
  const wageCap = 45000;

  const payrollRows = (await db.prepare(`
    SELECT p.employee_id, COUNT(*) AS row_count,
      SUM(CASE WHEN p.net_salary <= 0 THEN 1 ELSE 0 END) AS zero_rows,
      SUM(CASE WHEN p.approval_status = 'approved' OR p.approval_status IS NULL THEN 1 ELSE 0 END) AS exportable,
      SUM(CASE WHEN p.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN p.is_final_settlement = 1 THEN 1 ELSE 0 END) AS settlements,
      SUM(p.deductions) AS deductions, SUM(p.basic_salary + p.allowances) AS gross
    FROM payroll p JOIN employees e ON p.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND p.month = ? AND p.year = ?
    GROUP BY p.employee_id
  `).all(...scopeParams(scope), period.month, period.year)) as any[];
  const qiwa = (await db.prepare(`
    SELECT q.employee_id, q.end_date
    FROM qiwa_contracts q JOIN employees e ON q.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')}
  `).all(...scopeParams(scope))) as any[];

  const payrollBy = new Map(payrollRows.map(r => [Number(r.employee_id), r]));
  const qiwaDueBy = new Map<number, number>();
  for (const q of qiwa) {
    const left = daysUntil(q.end_date, now);
    if (left !== null && left >= 0 && left <= 90) {
      const id = Number(q.employee_id);
      qiwaDueBy.set(id, (qiwaDueBy.get(id) || 0) + 1);
    }
  }

  const rows = employees.map(e => {
    const covered = isInsuranceCovered(e);
    const exempt = isGosiExempt(e);
    const registered = num(e.gosi_registered_salary);
    const fallback = num(e.basic_salary) + num(e.housing_allowance);
    const wage = Math.min(wageCap, registered || fallback);
    let employeeShare = 0;
    let employerShare = wage * expatRate;
    if (covered) {
      employeeShare = exempt ? 0 : wage * empRate;
      employerShare = exempt ? wage * (empRate + compRate) : wage * compRate;
    }
    const p = payrollBy.get(Number(e.id)) || {};
    const gross = num(p.gross);
    const deductionRatio = gross > 0 ? round2(num(p.deductions) / gross * 100) : 0;
    const wpsIssue = !e.saudi_iban || num(p.zero_rows) > 0 ? 'يحتاج مراجعة' : 'سليم';
    return [
      e.name, e.nationality || (covered ? 'سعودي' : 'وافد'), e.gosi_number || '—',
      covered ? 'سعودي' : 'وافد', round2(wage), round2(employeeShare), round2(employerShare),
      exempt ? 'معفى' : 'لا', num(p.row_count), num(p.zero_rows), deductionRatio,
      num(p.paid), qiwaDueBy.get(Number(e.id)) || 0, wpsIssue,
    ];
  });

  const saudi = employees.filter(e => isInsuranceCovered(e) || e.nationality === 'سعودية').length;
  const ratio = employees.length ? Math.round(saudi / employees.length * 1000) / 10 : 0;
  const band = ratio >= 50 ? 'النطاق البلاتيني' : ratio >= 35 ? 'نطاق أخضر مرتفع'
    : ratio >= 20 ? 'نطاق أخضر متوسط' : ratio >= 10 ? 'نطاق أخضر منخفض' : 'النطاق الأحمر (حرج)';
  const sum = (i: number) => round2(rows.reduce((s, r) => s + num(r[i]), 0));
  return finish('ksa', 'GOSI والامتثال السعودي', [
    'الموظف', 'الجنسية', 'رقم GOSI', 'التصنيف', 'الأجر الخاضع', 'حصة الموظف', 'حصة صاحب العمل',
    'إعفاء GOSI', 'صفوف المسير', 'صفوف بصافي صفري', 'نسبة الخصوم %', 'صفوف مدفوعة',
    'عقود قوى خلال 90 يوم', 'حالة WPS',
  ], rows, [
    { label: 'الموظفون', value: employees.length },
    { label: 'نسبة التوطين %', value: ratio },
    { label: 'نطاقات', value: band },
    { label: 'حصة الموظفين', value: sum(5) },
    { label: 'حصة أصحاب العمل', value: sum(6) },
    { label: 'صفوف بصافي صفري', value: sum(9) },
    { label: 'تسويات نهائية', value: payrollRows.reduce((s, r) => s + num(r.settlements), 0) },
  ], now);
}

// ---------------------------------------------------------------------------
// 5. Training and promotions
// ---------------------------------------------------------------------------

export async function buildTrainingPromotionsReport(
  db: any, scope: OrganizationScope, _query: Record<string, unknown> = {}, now = new Date(),
): Promise<ExtendedReport> {
  const employees = await scopedEmployees(db, scope);
  const appraisals = (await db.prepare(`
    SELECT a.employee_id, a.rating, a.appraisal_date
    FROM appraisals a JOIN employees e ON a.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} ORDER BY a.appraisal_date DESC, a.id DESC
  `).all(...scopeParams(scope))) as any[];
  const enrollments = (await db.prepare(`
    SELECT t.employee_id, COUNT(*) AS total,
      SUM(CASE WHEN t.status = 'completed' AND t.certificate_number IS NOT NULL
        AND TRIM(t.certificate_number) <> '' THEN 1 ELSE 0 END) AS certified
    FROM training_enrollments t JOIN employees e ON t.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} GROUP BY t.employee_id
  `).all(...scopeParams(scope))) as any[];
  const promotions = (await db.prepare(`
    SELECT pr.employee_id, COUNT(*) AS total,
      SUM(CASE WHEN pr.appraisal_id IS NOT NULL AND pr.training_enrollment_id IS NOT NULL THEN 1 ELSE 0 END) AS evidenced,
      SUM(CASE WHEN pr.approval_status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM promotions pr JOIN employees e ON pr.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} GROUP BY pr.employee_id
  `).all(...scopeParams(scope))) as any[];

  const appraisalBy = new Map<number, any>();
  for (const a of appraisals) {
    const id = Number(a.employee_id);
    if (!appraisalBy.has(id)) appraisalBy.set(id, a);
  }
  const enrollmentBy = new Map(enrollments.map(r => [Number(r.employee_id), r]));
  const promotionBy = new Map(promotions.map(r => [Number(r.employee_id), r]));

  const rows = employees.map(e => {
    const id = Number(e.id);
    const appraisal = appraisalBy.get(id);
    const rated = num(appraisal?.rating);
    const certified = num(enrollmentBy.get(id)?.certified);
    const prom = promotionBy.get(id) || {};
    const totalProm = num(prom.total);
    const evidenced = num(prom.evidenced);
    const gap = rated >= 3 && certified > 0 && totalProm === 0 ? 'مؤهل بلا ترقية'
      : evidenced < totalProm ? 'توثيق ناقص' : '—';
    return [
      e.name, e.position || '—', rated || '—', appraisal?.appraisal_date || '—',
      num(enrollmentBy.get(id)?.total), certified, totalProm, evidenced, num(prom.pending), gap,
    ];
  });

  const sum = (i: number) => rows.reduce((s, r) => s + num(r[i]), 0);
  return finish('training', 'التدريب والترقيات الموثقة', [
    'الموظف', 'المسمى', 'آخر تقييم', 'تاريخ التقييم', 'دورات مسجلة', 'شهادات مكتملة',
    'ترقيات', 'ترقيات موثقة', 'بانتظار الاعتماد', 'فجوة',
  ], rows, [
    { label: 'الموظفون', value: rows.length },
    { label: 'تقييم ≥ 3', value: rows.filter(r => num(r[2]) >= 3).length },
    { label: 'شهادات مكتملة', value: sum(5) },
    { label: 'ترقيات', value: sum(6) },
    { label: 'ترقيات موثقة', value: sum(7) },
    { label: 'فجوات', value: rows.filter(r => r[9] !== '—').length },
  ], now);
}

// ---------------------------------------------------------------------------
// 6. Service termination
// ---------------------------------------------------------------------------

export async function buildServiceTerminationReport(
  db: any, scope: OrganizationScope, _query: Record<string, unknown> = {}, now = new Date(),
): Promise<ExtendedReport> {
  const employees = await scopedEmployees(db, scope);
  const clearances = (await db.prepare(`
    SELECT ec.employee_id, ec.overall_status, ec.final_settlement_amount, ec.last_working_day
    FROM employee_clearances ec JOIN employees e ON ec.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} ORDER BY ec.id DESC
  `).all(...scopeParams(scope))) as any[];
  const settlements = (await db.prepare(`
    SELECT x.employee_id, x.net_payable, x.settlement_status
    FROM eos_calculations x JOIN employees e ON x.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} ORDER BY x.id DESC
  `).all(...scopeParams(scope))) as any[];
  const finalPayroll = (await db.prepare(`
    SELECT p.employee_id, COUNT(*) AS rows_count,
      SUM(CASE WHEN p.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid
    FROM payroll p JOIN employees e ON p.employee_id = e.id
    WHERE ${scopeClause(scope, 'e')} AND p.is_final_settlement = 1
    GROUP BY p.employee_id
  `).all(...scopeParams(scope))) as any[];

  const latest = (list: any[]) => {
    const map = new Map<number, any>();
    for (const r of list) {
      const id = Number(r.employee_id);
      if (!map.has(id)) map.set(id, r);
    }
    return map;
  };
  const clearanceBy = latest(clearances);
  const settlementBy = latest(settlements);
  const payrollBy = latest(finalPayroll);

  const relevant = employees.filter(e =>
    String(e.status || '').toLowerCase() === 'terminated' || e.end_service_date || clearanceBy.has(Number(e.id)));

  const rows = relevant.map(e => {
    const id = Number(e.id);
    const c = clearanceBy.get(id);
    const s = settlementBy.get(id);
    const p = payrollBy.get(id);
    const terminated = String(e.status || '').toLowerCase() === 'terminated';
    return [
      e.name, e.position || '—', e.branch_name || '—', e.status || '—',
      e.end_service_date || c?.last_working_day || '—', e.end_service_reason || '—',
      c?.overall_status || '—', c?.last_working_day || '—', round2(num(s?.net_payable)),
      s?.settlement_status || '—', num(p?.rows_count), num(p?.paid), terminated ? 'نعم' : 'لا',
    ];
  });

  return finish('termination', 'إنهاء الخدمة والتسويات', [
    'الموظف', 'المسمى', 'الفرع', 'الحالة', 'تاريخ الإنهاء', 'السبب', 'إخلاء الطرف',
    'آخر يوم عمل', 'صافي التسوية', 'حالة التسوية', 'سطر مسير نهائي', 'مدفوع', 'مستبعد من مسير جديد',
  ], rows, [
    { label: 'حالات منتهية', value: rows.filter(r => r[3] === 'terminated').length },
    { label: 'إخلاء مكتمل', value: rows.filter(r => r[6] === 'completed').length },
    { label: 'تسويات مسودة', value: rows.filter(r => r[9] === 'draft').length },
    { label: 'أطراف مسير نهائية', value: rows.reduce((s, r) => s + num(r[10]), 0) },
    { label: 'صافي التسويات', value: round2(rows.reduce((s, r) => s + num(r[8]), 0)) },
  ], now);
}

export const extendedReportBuilders = {
  attendance: buildAttendanceDutyReport,
  payroll: buildPayrollOvertimeReport,
  expiry: buildExpiryAlertsReport,
  ksa: buildKsaComplianceReport,
  training: buildTrainingPromotionsReport,
  termination: buildServiceTerminationReport,
} as const;

export type ExtendedReportKey = keyof typeof extendedReportBuilders;
