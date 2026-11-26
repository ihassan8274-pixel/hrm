import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { presenceRequest, rowsOf } from '../lib/presence';

const panelCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm';
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm';
const btnCls = 'px-4 py-2 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50';

type Schedule = {
  id?: number; employee_id: number; employee_name?: string;
  work_start_time: string; work_end_time: string;
  working_days_json: string; break_minutes: number;
  effective_from: string; effective_to?: string | null;
};
type UserRow = { id: number; username?: string; name?: string; role?: string; employee_id?: number | null };

const DAYS = [
  { value: 0, label: 'الأحد' }, { value: 1, label: 'الاثنين' }, { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' }, { value: 4, label: 'الخميس' }, { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const parseDays = (raw: unknown): number[] => {
  try {
    const parsed = JSON.parse(String(raw || '[1,2,3,4,5]'));
    return Array.isArray(parsed) ? parsed.map(Number).filter(n => n >= 0 && n <= 6) : [1, 2, 3, 4, 5];
  } catch { return [1, 2, 3, 4, 5]; }
};

export default function PresenceSchedulesView() {
  const { user } = useAuth();
  const canManage = ['admin', 'hr_manager'].includes(String(user?.role || ''));
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({
    employee_id: '', work_start_time: '08:00', work_end_time: '17:00',
    working_days: [1, 2, 3, 4, 5], break_minutes: '0', effective_from: todayISO(), effective_to: '',
  });
  const [readOnly, setReadOnly] = useState(!canManage);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, u] = await Promise.allSettled([
        presenceRequest<any>('/api/presence/schedules'),
        canManage ? presenceRequest<any>('/api/presence/users') : Promise.resolve(null),
      ]);
      if (s.status === 'fulfilled') setSchedules(rowsOf<Schedule>(s.value, 'schedules'));
      else { setReadOnly(true); setError('الصلاحية تسمح بقراءة جدولك فقط.'); }
      if (u.status === 'fulfilled' && u.value) setUsers(rowsOf<UserRow>(u.value, 'users'));
    } catch (e) { setError((e as Error).message); }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.employee_id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await presenceRequest('/api/presence/schedules', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: Number(form.employee_id),
          work_start_time: form.work_start_time,
          work_end_time: form.work_end_time,
          working_days_json: JSON.stringify(form.working_days),
          break_minutes: Number(form.break_minutes) || 0,
          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
        }),
      });
      setNotice('تم حفظ توقيت العمل.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const toggleDay = (day: number) => setForm(prev => ({
    ...prev,
    working_days: prev.working_days.includes(day)
      ? prev.working_days.filter(d => d !== day) : [...prev.working_days, day].sort(),
  }));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">توقيتات العمل</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            أساس نافذة الحضور ومقسَم قيمة الدقيقة: الراتب ÷ (أيام العمل × ساعات اليوم × 60).
          </p>
        </div>
        <button onClick={() => void load()} className={btnCls}><RefreshCw className="w-4 h-4 inline" /> تحديث</button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      {!readOnly && (
        <div className={panelCls}>
          <div className="flex items-center gap-2 mb-5"><CalendarDays className="w-5 h-5 text-brand-600" /><h2 className="font-bold">إضافة توقيت</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">الموظف/المستخدم</label>
              <select className={inputCls} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">— اختر —</option>
                {users.map(u => <option key={u.id} value={u.employee_id || u.id}>{u.name || u.username} · {u.role || ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">البداية</label>
              <input type="time" className={inputCls} value={form.work_start_time} onChange={e => setForm({ ...form, work_start_time: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">النهاية</label>
              <input type="time" className={inputCls} value={form.work_end_time} onChange={e => setForm({ ...form, work_end_time: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">استراحة (دقائق)</label>
              <input type="number" min="0" className={inputCls} value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">ساري من</label>
              <input type="date" className={inputCls} value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">ساري إلى (اختياري)</label>
              <input type="date" className={inputCls} value={form.effective_to} onChange={e => setForm({ ...form, effective_to: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-500 mb-2">أيام العمل</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d => (
                <label key={d.value} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${form.working_days.includes(d.value)
                  ? 'bg-brand-600 text-white border-brand-600' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}>
                  <input type="checkbox" className="hidden" checked={form.working_days.includes(d.value)} onChange={() => toggleDay(d.value)} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
          <button onClick={() => void save()} disabled={busy || !form.employee_id} className={`${btnCls} mt-5`}>حفظ التوقيت</button>
        </div>
      )}

      <div className={panelCls}>
        <h2 className="font-bold mb-4">التوقيتات المسجلة</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs border-b dark:border-slate-700">
              <th className="py-2 text-right">الموظف</th><th>البداية</th><th>النهاية</th><th>الأيام</th><th>استراحة</th><th>ساري من</th>
            </tr></thead>
            <tbody>
              {schedules.map(s => <tr key={s.id || `${s.employee_id}-${s.effective_from}`} className="border-b border-slate-100 dark:border-slate-700/60">
                <td className="py-2">{s.employee_name || `#${s.employee_id}`}</td>
                <td dir="ltr">{s.work_start_time}</td><td dir="ltr">{s.work_end_time}</td>
                <td>{parseDays(s.working_days_json).map(d => DAYS.find(x => x.value === d)?.label).filter(Boolean).join('، ')}</td>
                <td>{Number(s.break_minutes || 0)} د</td><td dir="ltr">{s.effective_from}</td>
              </tr>)}
              {!schedules.length && <tr><td colSpan={6} className="py-8 text-center text-slate-400">لا توجد توقيتات مسجلة بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
