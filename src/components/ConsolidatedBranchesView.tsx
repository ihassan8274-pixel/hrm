import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Network, Users, Wallet, ShieldCheck, RefreshCw, Building2 } from 'lucide-react';

type MoneyKey = 'gross' | 'deductions' | 'net' | 'gosi_comp';
interface Metrics {
  employee_count: number;
  saudi_count: number;
  expat_count: number;
  payroll_count: number;
  gross: number;
  deductions: number;
  net: number;
  gosi_comp: number;
  absence_days: number;
  attendance_records: number;
  attendance_log_count: number;
  leaves_approved: number;
  contracts_expiring_90d: number;
  health_certs_expiring_60d: number;
  hse_inspections: number;
}
interface Branch extends Metrics {
  id: number | null;
  name: string;
  location: string | null;
  is_active: number;
}
interface Entity {
  id: number | null;
  name: string;
  currency: string | null;
  branches: Branch[];
  totals: Metrics;
}
interface ReportOptions {
  entities: { id: number; name: string; currency: string }[];
  branches: { id: number; entity_id: number; name: string; location: string | null; is_active: number }[];
}
interface ConsolidatedReport {
  month: number;
  year: number;
  generated_at: string;
  latest_payroll: { month: number; year: number } | null;
  options: ReportOptions;
  entities: Entity[];
  currency: string | null;
  grand: Omit<Metrics, MoneyKey> & Record<MoneyKey, number | null>;
}
interface Filters {
  month: number | null;
  year: string;
  entityId: string;
  branchId: string;
}
interface MetricColumn {
  key: keyof Metrics;
  label: string;
  money?: boolean;
  sub?: (metrics: Metrics) => string;
}

const INITIAL_FILTERS: Filters = { month: null, year: '', entityId: '', branchId: '' };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const numberFormatter = new Intl.NumberFormat('en-US');
const moneyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (value: number) => numberFormatter.format(value);
const money = (value: number | null, currency: string | null) => value === null
  ? 'غير قابل للجمع'
  : `${moneyFormatter.format(value)} ${currency?.trim() || 'عملة غير محددة'}`;
const validYear = (year: string) => /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 9999;
const validPeriod = (filters: Filters) => filters.month !== null && filters.month >= 1 && filters.month <= 12 && validYear(filters.year);
const automaticPeriod = (filters: Filters) => filters.month === null && filters.year === '';
const focusStyle = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2';
const controlStyle = `w-full min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 ${focusStyle}`;

const metricCols: MetricColumn[] = [
  { key: 'employee_count', label: 'الموظفون', sub: (m) => `${fmt(m.saudi_count)} سعودي / ${fmt(m.expat_count)} وافد` },
  { key: 'payroll_count', label: 'سجلات المسير' },
  { key: 'gross', label: 'الإجمالي', money: true },
  { key: 'deductions', label: 'الخصومات', money: true },
  { key: 'net', label: 'صافي المسير', money: true },
  { key: 'gosi_comp', label: 'تأمينات الشركة', money: true },
  { key: 'absence_days', label: 'أيام الغياب المسجلة', sub: (m) => m.attendance_records === 0 ? 'لا يوجد ملخص شهري' : '' },
  { key: 'attendance_records', label: 'ملخصات الحضور الشهرية' },
  { key: 'attendance_log_count', label: 'سجلات الدخول', sub: (m) => m.attendance_log_count === 0 ? 'لا توجد سجلات؛ الحضور غير مؤكد' : '' },
  { key: 'leaves_approved', label: 'إجازات معتمدة' },
  { key: 'contracts_expiring_90d', label: 'عقود تنتهي خلال 90 يومًا' },
  { key: 'health_certs_expiring_60d', label: 'شهادات صحية خلال 60 يومًا' },
  { key: 'hse_inspections', label: 'تفتيش السلامة' },
];

function MetricCell({ metrics, column, currency }: { metrics: Metrics; column: MetricColumn; currency: string | null }) {
  const noPayroll = column.money && metrics.payroll_count === 0;
  const noAttendanceSummary = column.key === 'absence_days' && metrics.attendance_records === 0;
  const value = noPayroll || noAttendanceSummary ? '—'
    : column.money ? money(metrics[column.key], currency) : fmt(metrics[column.key]);
  const detail = column.sub?.(metrics);
  return (
    <>
      <div className={column.money ? 'font-black' : 'font-bold'}>
        <bdi aria-label={noPayroll ? 'لا يوجد مسير محفوظ' : noAttendanceSummary ? 'لا يوجد ملخص حضور شهري' : undefined}>{value}</bdi>
      </div>
      {detail && <div className="text-[11px] text-slate-500 font-normal mt-1">{detail}</div>}
    </>
  );
}

export default function ConsolidatedBranchesView() {
  const [data, setData] = useState<ConsolidatedReport | null>(null);
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (next: Filters) => {
    // Invalidate immediately, including while an incomplete year is being edited.
    activeRequest.current?.abort();
    activeRequest.current = null;
    setFilters(next);
    setData(null);
    setError('');
    if (!automaticPeriod(next) && !validPeriod(next)) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => !controller.signal.aborted && activeRequest.current === controller;
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (validPeriod(next)) {
        query.set('month', String(next.month));
        query.set('year', next.year);
      }
      if (next.entityId) query.set('entity_id', next.entityId);
      if (next.branchId) query.set('branch_id', next.branchId);
      const qs = query.toString();
      const response = await fetch(`/api/reports/consolidated${qs ? `?${qs}` : ''}`, { signal: controller.signal });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error : `فشل الطلب (${response.status})`;
        throw new Error(message);
      }
      const report: ConsolidatedReport = await response.json();
      if (!isCurrent()) return;
      setData(report);
      // Keep filter options available while replacing a report, never its metrics.
      setOptions(report.options);
      setFilters({ ...next, month: report.month, year: String(report.year) });
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      setData(null);
      setError(cause instanceof Error ? cause.message : 'خطأ غير متوقع');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(INITIAL_FILTERS);
    return () => { activeRequest.current?.abort(); };
  }, [load]);

  const periodInvalid = !automaticPeriod(filters) && !validPeriod(filters);
  const yearInvalid = !automaticPeriod(filters) && !validYear(filters.year);
  const availableBranches = options?.branches.filter((b) => !filters.entityId || String(b.entity_id) === filters.entityId) ?? [];
  const allBranches = data?.entities.flatMap((entity) => entity.branches.map((branch) => ({ ...branch, entity: entity.name }))) ?? [];
  const chartData = allBranches.map((b) => ({ name: `${b.entity} — ${b.name}`, الإجمالي: b.gross, الصافي: b.net }));
  const hasBranches = allBranches.length > 0;
  const hasPayroll = data !== null && data.grand.payroll_count > 0;
  const kpis = data ? [
    { label: 'إجمالي الموظفين', value: fmt(data.grand.employee_count), icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'سجلات مسير الرواتب', value: fmt(data.grand.payroll_count), icon: Wallet, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'سجلات الدخول', value: fmt(data.grand.attendance_log_count), icon: Network, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'تأمينات الشركة (GOSI)', value: hasPayroll ? money(data.grand.gosi_comp, data.currency) : 'لا مسير محفوظ', icon: ShieldCheck, color: 'text-amber-700 bg-amber-50' },
  ] : [];

  return (
    <div className="space-y-8 font-sans pb-10 min-w-0 max-w-full" dir="rtl">
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 shrink-0"><Network size={28} aria-hidden="true" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-800">التقارير المجمعة بين الفروع</h1>
            <p className="text-slate-500 text-sm mt-1">رؤية موحدة لكل الكيانات والفروع: الرواتب والتأمينات والغياب والعقود والشهادات</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full" role="group" aria-label="فلاتر التقرير">
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600 flex-1 min-w-40">
            الكيان
            <select value={filters.entityId} onChange={(e) => void load({ ...filters, entityId: e.target.value, branchId: '' })} className={controlStyle}>
              <option value="">كل الكيانات المتاحة</option>
              {options?.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600 flex-1 min-w-40">
            الفرع
            <select value={filters.branchId} onChange={(e) => void load({ ...filters, branchId: e.target.value })} className={controlStyle}>
              <option value="">كل الفروع المتاحة</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}{!filters.entityId ? ` — ${options?.entities.find((entity) => entity.id === branch.entity_id)?.name ?? 'كيان غير محدد'}` : ''}{branch.is_active ? '' : ' (غير نشط)'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600 min-w-28 flex-1 sm:flex-none">
            الشهر
            <select value={filters.month ?? ''} onChange={(e) => void load({ ...filters, month: Number(e.target.value) })} className={controlStyle}>
              <option value="" disabled>اختر الشهر</option>
              {MONTHS.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600 w-28">
            السنة
            <input type="number" min={1900} max={9999} step={1} inputMode="numeric" value={filters.year}
              onChange={(e) => void load({ ...filters, year: e.target.value })}
              aria-invalid={yearInvalid} aria-describedby={periodInvalid ? 'consolidated-period-error' : undefined}
              placeholder="السنة" className={controlStyle} />
          </label>
          <button type="button" onClick={() => void load(filters)} disabled={periodInvalid}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusStyle}`}
            aria-label="تحديث التقرير">
            <RefreshCw size={18} className={loading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
            <span className="text-sm font-bold">تحديث</span>
          </button>
        </div>
        {periodInvalid && <p id="consolidated-period-error" role="status" className="text-sm text-red-700">اختر شهرًا وسنة صحيحة من 1900 إلى 9999 لعرض التقرير.</p>}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm font-bold space-y-3" role="alert">
          <p>تعذر تحميل التقرير: {error}</p>
          <button type="button" onClick={() => void load(filters)} className={`px-4 py-2 rounded-xl border border-red-200 bg-white ${focusStyle}`}>إعادة المحاولة</button>
        </div>
      )}
      <div role="status" aria-live="polite" aria-atomic="true" className={loading ? 'p-6 rounded-2xl bg-white border border-slate-100 text-slate-600 flex items-center gap-3' : 'sr-only'}>
        {loading ? <><RefreshCw size={20} className="motion-safe:animate-spin" aria-hidden="true" />جارٍ تحميل التقرير، يرجى الانتظار…</> : data ? 'اكتمل تحميل التقرير.' : ''}
      </div>

      {data && !loading && !error && (
        <section aria-label="نتائج التقرير" className="space-y-6 min-w-0">
          <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <p>تُجمع الرواتب التاريخية حسب كيان وفرع الموظف الحاليين، وليس موقعه وقت إعداد المسير. أعداد الموظفين تعكس التوزيع الحالي.</p>
            <p>تنبيهات انتهاء العقود خلال 90 يومًا والشهادات الصحية خلال 60 يومًا محسوبة اعتبارًا من اليوم، لا الشهر المختار.</p>
            <p>صافي المسير هو صافي الرواتب المحسوب، وليس إثباتًا لدفع الأجور. غياب سجلات الدخول لا يؤكد الحضور أو الغياب.</p>
          </div>

          {!hasBranches && <p role="status" className="bg-white p-6 rounded-2xl border border-slate-100 text-slate-600">لا توجد فروع أو موظفون مطابقون للفلاتر الحالية. جرّب تغيير الكيان أو الفرع.</p>}
          {hasBranches && !hasPayroll && (
            <p role="status" className="p-4 rounded-2xl bg-indigo-50 text-indigo-800 text-sm">
              لا يوجد مسير رواتب محفوظ للفترة {MONTHS[data.month - 1]} {data.year} ضمن النطاق المختار. تبقى مؤشرات الموظفين والحضور والتنبيهات مستقلة عن وجود مسير.
            </p>
          )}
          {hasBranches && data.grand.attendance_log_count === 0 && (
            <p className="p-4 rounded-2xl bg-amber-50 text-amber-900 text-sm">لا توجد سجلات دخول للفترة المختارة؛ هذا نقص في السجلات وليس تأكيدًا لحضور الموظفين. ملخصات الحضور الشهرية مصدر مستقل.</p>
          )}

          {hasBranches && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((k) => (
                  <div key={k.label} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-2xl shrink-0 ${k.color}`}><k.icon size={24} aria-hidden="true" /></div>
                    <div className="min-w-0">
                      <div className="text-slate-500 text-xs font-bold">{k.label}</div>
                      <div className="text-xl font-black text-slate-800 mt-0.5 break-words"><bdi>{k.value}</bdi></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="font-black text-slate-800 mb-4">مطابقة مبالغ مسير الرواتب — {MONTHS[data.month - 1]} {data.year}</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([{ key: 'gross', label: 'إجمالي الرواتب' }, { key: 'deductions', label: 'الخصومات' }, { key: 'net', label: 'صافي المسير' }] as const).map((item) => (
                    <div key={item.key} className="min-w-0">
                      <dt className="text-xs font-bold text-slate-500">{item.label}</dt>
                      <dd className="text-xl font-black text-slate-800 mt-1 break-words"><bdi>{hasPayroll ? money(data.grand[item.key], data.currency) : 'لا مسير محفوظ'}</bdi></dd>
                    </div>
                  ))}
                </dl>
                {!data.currency && <p className="text-sm text-slate-600 mt-4">العملات متعددة أو غير محددة؛ لا يُجمع المال عبرها ولا يُعرض مخطط مالي موحد. راجع مبالغ كل كيان بعملته أدناه.</p>}
              </div>
            </>
          )}

          {hasBranches && hasPayroll && data.currency && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-w-0">
              <h2 className="font-black text-slate-800 mb-2">صافي المسير مقابل الإجمالي لكل فرع — <bdi>{data.currency}</bdi></h2>
              <p className="text-xs text-slate-500 mb-4">القيم التفصيلية متاحة في الجداول التالية. يمكن تمرير المخطط أفقيًا.</p>
              <div className={`overflow-x-auto max-w-full rounded-xl ${focusStyle}`} dir="ltr" tabIndex={0} role="region" aria-label="مقارنة الرواتب بين الفروع، قابل للتمرير أفقيًا">
                <div className="h-72" style={{ minWidth: Math.max(560, chartData.length * 150) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'inherit' }} />
                      <YAxis width={85} tick={{ fontSize: 12 }} tickFormatter={(value: number) => fmt(value)} />
                      <Tooltip formatter={(value) => typeof value === 'number' ? money(value, data.currency) : '—'} />
                      <Legend />
                      <Bar dataKey="الإجمالي" fill="#6366f1" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="الصافي" fill="#10b981" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {data.entities.map((entity) => (
            <div key={entity.id ?? 'unassigned'} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-w-0 max-w-full">
              <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-slate-50 border-b border-slate-100">
                <Building2 size={20} className="text-slate-500 shrink-0" aria-hidden="true" />
                <h2 className="font-black text-slate-800 break-words">{entity.name}</h2>
                <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200"><bdi>{entity.currency || 'عملة غير محددة'}</bdi> · {fmt(entity.totals.employee_count)} موظف</span>
                {entity.totals.payroll_count === 0 && <span className="text-xs text-slate-500">لا مسير محفوظ للفترة</span>}
              </div>
              {entity.branches.length === 0 ? (
                <p className="px-6 py-5 text-sm text-slate-500">لا توجد فروع مطابقة لهذا الكيان ضمن الفلاتر الحالية.</p>
              ) : (
                <>
                  <p className="px-6 pt-3 text-xs text-slate-500">مرّر الجدول أفقيًا لعرض جميع المؤشرات. المبالغ بعملة الكيان، والشرطة تعني عدم وجود سجل مصدر.</p>
                  <div className={`overflow-x-auto max-w-full ${focusStyle}`} tabIndex={0} role="region" aria-label={`جدول فروع ${entity.name}، قابل للتمرير أفقيًا`}>
                    <table className="w-full min-w-[1550px] text-sm" aria-label={`تقرير فروع ${entity.name}`}>
                      <thead>
                        <tr className="bg-white text-slate-500 text-xs border-b border-slate-100">
                          <th scope="col" className="text-right px-4 py-3 font-black sticky right-0 z-10 bg-white">الفرع</th>
                          {metricCols.map((column) => <th scope="col" key={column.key} className="text-center px-3 py-3 font-black whitespace-nowrap">{column.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {entity.branches.map((branch, index) => (
                          <tr key={branch.id ?? 'unassigned'} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                            <th scope="row" className="text-right px-4 py-3 font-bold text-slate-800 sticky right-0 z-10 bg-inherit min-w-36 max-w-60">
                              <div className="break-words">{branch.name}</div>
                              {branch.location && <div className="text-xs text-slate-500 font-normal break-words">{branch.location}</div>}
                              {!branch.is_active && <div className="text-xs text-slate-500 font-normal">غير نشط</div>}
                              {branch.payroll_count === 0 && <div className="text-xs text-slate-500 font-normal">لا مسير للفترة</div>}
                            </th>
                            {metricCols.map((column) => (
                              <td key={column.key} className="text-center px-3 py-3 text-slate-700 whitespace-nowrap"><MetricCell metrics={branch} column={column} currency={entity.currency} /></td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-indigo-50 font-black text-slate-800 border-t-2 border-indigo-100">
                          <th scope="row" className="text-right px-4 py-3 sticky right-0 z-10 bg-indigo-50">إجمالي الكيان</th>
                          {metricCols.map((column) => (
                            <td key={column.key} className="text-center px-3 py-3 whitespace-nowrap"><MetricCell metrics={entity.totals} column={column} currency={entity.currency} /></td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="text-center text-xs text-slate-500 space-y-1">
            <p>آخر تحديث: {new Date(data.generated_at).toLocaleString('ar-EG')} — الشهر المعروض: {MONTHS[data.month - 1]} {data.year}</p>
            <p>{data.latest_payroll ? `أحدث مسير محفوظ في النطاق المختار: ${MONTHS[data.latest_payroll.month - 1]} ${data.latest_payroll.year}` : 'لا توجد مسيرات محفوظة في النطاق المختار.'}</p>
          </div>
        </section>
      )}
    </div>
  );
}
