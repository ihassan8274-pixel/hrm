import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, FileBarChart2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { presenceRequest, rowsOf } from '../lib/presence';

const panelCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm';
const btnCls = 'px-4 py-2 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50';
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm';

type Report = { columns: string[]; rows: unknown[][]; summary?: Array<{ label: string; value: number | string }>; generated_at?: string };
type Violation = {
  id: number; user_id?: number; employee_name?: string; day: string; branch_name?: string;
  minutes?: number; value_sar?: number | string; status?: string; decision?: string;
  decision_percent?: number | string; supervisor_confirmed_by?: string; decided_by?: string;
};

type Tab = 'hours' | 'violations';
const PATHS: Record<Tab, string> = {
  hours: '/api/presence/reports/hours',
  violations: '/api/presence/reports/violations',
};

const cell = (value: unknown) => value == null || value === '' ? '—' : String(value);
const statusClass = (status: unknown) => {
  const s = String(status || '');
  if (['approved', 'full_deduction', 'exemption'].includes(s)) return 'text-emerald-700 dark:text-emerald-300';
  if (['pending_hr', 'partial_deduction'].includes(s)) return 'text-amber-700 dark:text-amber-300';
  return 'text-slate-500 dark:text-slate-400';
};

export default function PresenceReportsView({ initialTab = 'hours' }: { initialTab?: Tab }) {
  const { user } = useAuth();
  const role = String(user?.role || '');
  const isHR = role === 'admin' || role === 'hr_manager';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [report, setReport] = useState<Report | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<{ id: number; decision: string; percent: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await presenceRequest<any>(PATHS[tab]);
      setReport({
        columns: Array.isArray(data?.columns) ? data.columns : [],
        rows: Array.isArray(data?.rows) ? data.rows : [],
        summary: Array.isArray(data?.summary) ? data.summary : [],
        generated_at: data?.generated_at,
      });
      setViolations(tab === 'violations'
        ? rowsOf<Violation>(await presenceRequest<any>('/api/presence/violations'), 'violations')
        : []);
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, body: unknown, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await presenceRequest(path, { method: 'POST', body: JSON.stringify(body) });
      setNotice(success);
      setDecision(null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">تقارير التواجد والمخالفات</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          لا تُعرض إحداثيات خام. انحرافات النطاق تُشتق من سجلات جهاز الحضور، والقرار النهائي لـ HR وحده.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['hours', 'ساعات التواجد'], ['violations', 'المخالفات والقرارات']] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === key
              ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
            {label}
          </button>
        ))}
        <a href={`${PATHS[tab]}/csv`} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-700">
          <Download className="w-4 h-4" /> تصدير CSV
        </a>
        <button onClick={() => void load()} className={btnCls}><RefreshCw className="w-4 h-4 inline" /> تحديث</button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      {!!report?.summary?.length && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {report.summary.map((s, i) => (
            <div key={`${s.label}-${i}`} className={panelCls}>
              <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{cell(s.value)}</div>
            </div>
          ))}
        </div>
      )}

      <div className={panelCls}>
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart2 className="w-5 h-5 text-brand-600" />
          <h2 className="font-bold">{tab === 'hours' ? 'ساعات التواجد اليومية' : 'سجل المخالفات'}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs border-b dark:border-slate-700">
              {report?.columns.map((c, i) => <th key={`${c}-${i}`} className="py-2 text-right whitespace-nowrap">{c}</th>)}
              {tab === 'violations' && <th className="py-2 text-right">الإجراء</th>}
            </tr></thead>
            <tbody>
              {report?.rows.map((row, ri) => {
                const id = tab === 'violations' ? Number(row[0]) : NaN;
                const match = violations.find(v => Number(v.id) === id);
                return (
                  <tr key={ri} className="border-b border-slate-100 dark:border-slate-700/60">
                    {row.map((value, ci) => <td key={ci} className="py-2 whitespace-nowrap">{cell(value)}</td>)}
                    {tab === 'violations' && (
                      <td className="py-2">
                        {match ? (
                          <div className="flex flex-wrap gap-1">
                            {!match.supervisor_confirmed_by && (
                              <button disabled={busy} onClick={() => void act(`/api/presence/violations/${id}/confirm`, {}, 'تم تأكيد الوقائع — بانتظار HR')}
                                className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">تأكيد الوقائع</button>
                            )}
                            {isHR && match.supervisor_confirmed_by && !match.decided_by && (
                              <button onClick={() => setDecision({ id, decision: 'full_deduction', percent: '50', reason: '' })}
                                className="px-2 py-1 rounded-lg text-xs font-bold bg-brand-600 text-white">قرار HR</button>
                            )}
                            {!!match.decided_by && <span className={`text-xs font-bold ${statusClass(match.decision)}`}>{cell(match.decision)}</span>}
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!report?.rows.length && <tr><td colSpan={(report?.columns.length || 1) + (tab === 'violations' ? 1 : 0)} className="py-10 text-center text-slate-400">لا توجد بيانات للنطاق الحالي.</td></tr>}
            </tbody>
          </table>
        </div>
        {report?.generated_at && <p className="mt-4 text-xs text-slate-400">آخر تحديث: {new Date(report.generated_at).toLocaleString('ar-SA')}</p>}
      </div>

      {decision && (
        <div className={panelCls}>
          <h2 className="font-bold mb-4">قرار HR — مخالفة #{decision.id}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">القرار</label>
              <select className={inputCls} value={decision.decision} onChange={e => setDecision({ ...decision, decision: e.target.value })}>
                <option value="full_deduction">خصم كامل</option>
                <option value="partial_deduction">خصم جزئي</option>
                <option value="exemption">إعفاء</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">نسبة الخصم (%)</label>
              <input type="number" min="0" max="100" className={inputCls} value={decision.percent}
                onChange={e => setDecision({ ...decision, percent: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">السبب</label>
              <input className={inputCls} value={decision.reason} onChange={e => setDecision({ ...decision, reason: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button disabled={busy || !decision.reason.trim()} onClick={() => void act(`/api/presence/violations/${decision.id}/decide`, {
              decision: decision.decision,
              decision_percent: decision.decision === 'partial_deduction' ? Number(decision.percent) : undefined,
              reason: decision.reason,
            }, 'تم تسجيل القرار في سجل التدقيق')} className={btnCls}>اعتماد القرار</button>
            <button onClick={() => setDecision(null)} className={`${btnCls} bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
