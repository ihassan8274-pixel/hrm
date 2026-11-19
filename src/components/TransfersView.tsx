import { useState, useEffect } from 'react';
import { ArrowLeftRight, RefreshCw, Building2, User } from 'lucide-react';

interface Employee { id: number; name: string; position: string; branch_id: number; }
interface Branch { id: number; name: string; }
interface Transfer { id: number; employee_name: string; from_branch: string; to_branch: string; effective_date: string; reason: string; }

export default function TransfersView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [form, setForm] = useState({ employee_id: '', to_branch_id: '', effective_date: '', reason: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    const [e, b, t] = await Promise.all([
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/branches').then(r => r.json()),
      fetch('/api/transfers').then(r => r.json()),
    ]);
    setEmployees(e); setBranches(b); setTransfers(t);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.employee_id || !form.to_branch_id) return setMessage({ type: 'error', text: 'اختر الموظف والفرع الجديد' });
    const res = await fetch('/api/transfers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: Number(form.employee_id), to_branch_id: Number(form.to_branch_id), effective_date: form.effective_date, reason: form.reason })
    });
    const data = await res.json();
    if (data.success) { setMessage({ type: 'success', text: 'تم نقل الموظف وتحديث موقعه الجغرافي' }); setForm({ employee_id: '', to_branch_id: '', effective_date: '', reason: '' }); load(); }
    else setMessage({ type: 'error', text: data.error || 'فشل النقل' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800">نقل الموظف بين الفروع</h2>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"><RefreshCw className="w-4 h-4" /> تحديث</button>
      </div>

      {message && <div className={`px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{message.text}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-brand-600" /> نقل موظف</h3>
          <div className="space-y-3">
            <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50">
              <option value="">اختر الموظف</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
            </select>
            <select value={form.to_branch_id} onChange={e => setForm({ ...form, to_branch_id: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50">
              <option value="">الفرع الجديد</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="سبب النقل" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            <button onClick={submit} className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-brand-700">تنفيذ النقل</button>
            <p className="text-[11px] text-slate-400">عند النقل يتغير الموقع الجغرافي المرتبط بالموظف إلى موقع الفرع الجديد لتسجيل الحضور.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
          <h3 className="font-black text-slate-800 mb-4">سجل النقل</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100"><th className="py-2">الموظف</th><th className="py-2">من فرع</th><th className="py-2">إلى فرع</th><th className="py-2">تاريخ النقل</th><th className="py-2">السبب</th></tr></thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-700 flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /> {t.employee_name}</td>
                    <td className="py-2 text-slate-600 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" /> {t.from_branch || '—'}</td>
                    <td className="py-2 text-slate-600 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-emerald-500" /> {t.to_branch}</td>
                    <td className="py-2 text-slate-600">{t.effective_date}</td>
                    <td className="py-2 text-xs text-slate-400">{t.reason || '—'}</td>
                  </tr>
                ))}
                {transfers.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">لا سجلات نقل</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
