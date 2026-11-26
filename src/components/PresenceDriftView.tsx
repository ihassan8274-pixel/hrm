import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { presenceRequest, rowsOf } from '../lib/presence';

const panelCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm';
const btnCls = 'px-4 py-2 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50';

type Alert = {
  id: number; user_id?: number; branch_id?: number; username?: string; branch_name?: string;
  reason?: string; detected_at?: string; acknowledged_by?: string; acknowledged_at?: string;
};

export default function PresenceDriftView() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setAlerts(rowsOf<Alert>(await presenceRequest<any>('/api/presence/drift'), 'alerts'));
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ack = async (id: number) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await presenceRequest(`/api/presence/drift/${id}/ack`, { method: 'POST', body: '{}' });
      setNotice('تم تعليم البلاغ كمستلم. لا يوجد قلق تلقائي.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">تنبيهات انحراف السياسة</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            بلاغ لـ HR ومدير النظام فقط — **بدون قفل تلقائي** وبدون خصم راتب.
          </p>
        </div>
        <button onClick={() => void load()} className={btnCls}><RefreshCw className="w-4 h-4 inline" /> تحديث</button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      <div className={panelCls}>
        <div className="flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5 text-amber-600" /><h2 className="font-bold">البلاغات</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs border-b dark:border-slate-700">
              <th className="py-2 text-right">المستخدم/الفرع</th><th>السبب</th><th>وقت الرصد</th><th>الإجراء</th>
            </tr></thead>
            <tbody>
              {alerts.map(a => <tr key={a.id} className="border-b border-slate-100 dark:border-slate-700/60">
                <td className="py-2">{a.username || (a.user_id ? `#${a.user_id}` : '')} {a.branch_name || (a.branch_id ? `· فرع #${a.branch_id}` : '')}</td>
                <td>{a.reason || '—'}</td>
                <td dir="ltr">{a.detected_at ? new Date(a.detected_at).toLocaleString('ar-SA') : '—'}</td>
                <td>
                  {a.acknowledged_by
                    ? <span className="text-xs text-emerald-700 dark:text-emerald-300">استلمه {a.acknowledged_by}</span>
                    : <button disabled={busy} onClick={() => void ack(a.id)} className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700">تعليم كمستلم</button>}
                </td>
              </tr>)}
              {!alerts.length && <tr><td colSpan={4} className="py-10 text-center text-slate-400">لا توجد انحرافات مسجلة.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
