import { useCallback, useEffect, useState } from 'react';
import { DoorOpen, RefreshCw } from 'lucide-react';
import { presenceRequest, rowsOf } from '../lib/presence';

const panelCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm';
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm';
const btnCls = 'px-4 py-2 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50';

type ExitRequest = {
  id: number; approval_request_id?: number; user_id: number; employee_name?: string;
  starts_at: string; ends_at: string; reason?: string; status?: string;
};

export default function PresenceExitRequestsView() {
  const [items, setItems] = useState<ExitRequest[]>([]);
  const [form, setForm] = useState({ starts_at: '', ends_at: '', reason: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(rowsOf<ExitRequest>(await presenceRequest<any>('/api/presence/exit-requests'), 'requests'));
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!form.starts_at || !form.ends_at) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await presenceRequest('/api/presence/exit-request', {
        method: 'POST',
        body: JSON.stringify({
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          reason: form.reason,
        }),
      });
      setNotice('تم رفع طلب الخروج؛ يُعتمد عبر مسار الاعتمادات.');
      setForm({ starts_at: '', ends_at: '', reason: '' });
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">طلبات الخروج غير المعتمد</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            الطلب مرتبط بـ `approval_requests` من نوع `exit_permission`. الدقائق المعتمدة تُخصم من `inside_hours` في التقرير فقط — لا خصم راتب تلقائي.
          </p>
        </div>
        <button onClick={() => void load()} className={btnCls}><RefreshCw className="w-4 h-4 inline" /> تحديث</button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      <div className={panelCls}>
        <div className="flex items-center gap-2 mb-5"><DoorOpen className="w-5 h-5 text-brand-600" /><h2 className="font-bold">طلب جديد</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">من</label>
            <input type="datetime-local" className={inputCls} value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">إلى</label>
            <input type="datetime-local" className={inputCls} value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">السبب</label>
            <input className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="مثال: زيارة عميل" />
          </div>
        </div>
        <button onClick={() => void submit()} disabled={busy || !form.starts_at || !form.ends_at} className={`${btnCls} mt-5`}>رفع الطلب</button>
      </div>

      <div className={panelCls}>
        <h2 className="font-bold mb-4">الطلبات المسجلة</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs border-b dark:border-slate-700">
              <th className="py-2 text-right">الموظف</th><th>من</th><th>إلى</th><th>السبب</th><th>الحالة</th>
            </tr></thead>
            <tbody>
              {items.map(item => <tr key={item.id} className="border-b border-slate-100 dark:border-slate-700/60">
                <td className="py-2">{item.employee_name || `#${item.user_id}`}</td>
                <td dir="ltr">{new Date(item.starts_at).toLocaleString('ar-SA')}</td>
                <td dir="ltr">{new Date(item.ends_at).toLocaleString('ar-SA')}</td>
                <td>{item.reason || '—'}</td>
                <td>{item.status || 'قيد الاعتماد'}</td>
              </tr>)}
              {!items.length && <tr><td colSpan={5} className="py-8 text-center text-slate-400">لا توجد طلبات خروج مسجلة.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
