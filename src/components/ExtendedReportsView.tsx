import { useEffect, useState } from 'react';
import {
  Clock, Wallet, Plane, ShieldCheck, GraduationCap, UserMinus, Download, RefreshCw, FileText,
} from 'lucide-react';

type Report = {
  key: string;
  title: string;
  columns: string[];
  rows: unknown[][];
  summary: Array<{ label: string; value: number | string }>;
  generated_at: string;
};

type Tab = {
  key: string;
  label: string;
  path: string;
  icon: typeof Clock;
  filter: 'period' | 'days' | null;
};

// Full literal paths are kept here so the frontend/route-alignment test can
// pin every call against a route that actually exists on the server.
const TABS: Tab[] = [
  { key: 'attendance', label: 'الحضور والدوام', path: '/api/reports/attendance-duty', icon: Clock, filter: 'period' },
  { key: 'payroll', label: 'الرواتب والإضافي', path: '/api/reports/payroll-overtime', icon: Wallet, filter: 'period' },
  { key: 'expiry', label: 'التأشيرات والمنتهيات', path: '/api/reports/expiry-alerts', icon: Plane, filter: 'days' },
  { key: 'ksa', label: 'GOSI والامتثال', path: '/api/reports/ksa-compliance', icon: ShieldCheck, filter: 'period' },
  { key: 'training', label: 'التدريب والترقيات', path: '/api/reports/training-promotions', icon: GraduationCap, filter: null },
  { key: 'termination', label: 'إنهاء الخدمة', path: '/api/reports/service-termination', icon: UserMinus, filter: null },
];

const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
};

export default function ExtendedReportsView() {
  const now = new Date();
  const [tab, setTab] = useState('attendance');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [days, setDays] = useState('90');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = TABS.find(t => t.key === tab) || TABS[0];
  const query = active.filter === 'period' ? `?month=${month}&year=${year}`
    : active.filter === 'days' ? `?days=${days}` : '';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(active.path + query);
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || `تعذر تحميل التقرير (${r.status})`);
      setReport(d as Report);
    } catch (e: any) {
      setReport(null);
      setError(e?.message || 'تعذر تحميل التقرير');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tab, month, year, days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand-600" /> التقارير التشغيلية المتقدمة
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ستة تقارير داخل نطاقك المؤسسي فقط — شاشة وتصدير CSV متطابقان.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${active.path}/csv${query}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white"
          >
            <Download className="w-4 h-4" /> تنزيل CSV
          </a>
          <button onClick={() => void load()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
              tab === t.key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {active.filter && (
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          {active.filter === 'period' ? (
            <>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">الشهر
                <input type="number" min="1" max="12" value={month} onChange={e => setMonth(e.target.value)}
                  className="mr-2 w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
              </label>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">السنة
                <input type="number" min="1900" max="9999" value={year} onChange={e => setYear(e.target.value)}
                  className="mr-2 w-28 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
              </label>
            </>
          ) : (
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">نافذة التنبيه (أيام)
              <input type="number" min="1" max="3650" value={days} onChange={e => setDays(e.target.value)}
                className="mr-2 w-28 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
            </label>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm font-bold">{error}</div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {report.summary.map(s => (
              <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="text-xs text-slate-400 dark:text-slate-400">{s.label}</div>
                <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">{fmt(s.value)}</div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h3 className="font-black text-slate-800 dark:text-slate-100 mb-4">{report.title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-slate-400 dark:text-slate-300 text-xs border-b border-slate-100 dark:border-slate-700">
                    {report.columns.map((c, i) => <th key={i} className="py-2 px-2 whitespace-nowrap">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-700/60">
                      {row.map((cell, j) => (
                        <td key={j} className="py-2 px-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{fmt(cell)}</td>
                      ))}
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr><td colSpan={report.columns.length} className="py-8 text-center text-slate-400">لا بيانات مطابقة لهذا التقرير</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              وقت التقرير: {new Date(report.generated_at).toLocaleString('ar-SA')} — الصفوف مقتصرة على صلاحياتك التنظيمية.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
