import { useState, useEffect } from 'react';
import { AlertTriangle, IdCard, Stethoscope, FileBadge, UserX, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function AlertsCenterView() {
  const [expiries, setExpiries] = useState<any[]>([]);
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [lateness, setLateness] = useState<any[]>([]);
  const [tab, setTab] = useState<'expiries' | 'mismatch' | 'lateness'>('expiries');

  const load = async () => {
    const [e, m, l] = await Promise.all([
      fetch('/api/alerts/employee-expiries').then(r => r.json()),
      fetch('/api/alerts/job-mismatch').then(r => r.json()),
      fetch('/api/alerts/lateness').then(r => r.json()),
    ]);
    setExpiries(e); setMismatches(m); setLateness(l);
  };
  useEffect(() => { load(); }, []);

  const typeIcon = (t: string) => t === 'iqama' ? IdCard : t === 'health_cert' ? Stethoscope : FileBadge;
  const typeLabel = (t: string) => t === 'iqama' ? 'إقامة' : t === 'health_cert' ? 'شهادة صحية' : t === 'medical' ? 'تأمين طبي' : 'جواز سفر';

  const tabs = [
    { v: 'expiries', l: `قرب انتهاء الوثائق (${expiries.length})`, i: AlertTriangle },
    { v: 'mismatch', l: `مخالفة مسمى الإقامة (${mismatches.length})`, i: UserX },
    { v: 'lateness', l: `التأخير والغياب (${lateness.length})`, i: Clock },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800">مركز التنبيهات</h2>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"><RefreshCw className="w-4 h-4" /> تحديث</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.v} onClick={() => setTab(t.v)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border ${tab === t.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            <t.i className="w-4 h-4" /> {t.l}
          </button>
        ))}
      </div>

      {tab === 'expiries' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4">وثائق تقترب من الانتهاء</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100"><th className="py-2">الموظف</th><th className="py-2">الوثيقة</th><th className="py-2">تاريخ الانتهاء</th><th className="py-2">الأيام المتبقية</th><th className="py-2">تذكير</th></tr></thead>
              <tbody>
                {expiries.map((a, i) => {
                  const Icon = typeIcon(a.type);
                  const critical = a.days_left <= 0;
                  return (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2 font-bold text-slate-700">{a.name}</td>
                      <td className="py-2 flex items-center gap-2 text-slate-600"><Icon className="w-4 h-4 text-blue-600" /> {a.label}</td>
                      <td className="py-2 text-slate-600">{a.expiry}</td>
                      <td className="py-2"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{critical ? 'منتهية' : `${a.days_left} يوم`}</span></td>
                      <td className="py-2"><a className="text-xs font-bold text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`تذكير: ${a.label} للموظف ${a.name} تنتهي ${a.expiry}`)}`}>واتساب</a></td>
                    </tr>
                  );
                })}
                {expiries.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-400">لا تنبيهات</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'mismatch' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4">موظفون بمسمى إقامة مخالف للوظيفة الفعلية</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100"><th className="py-2">الموظف</th><th className="py-2">مسمى الإقامة</th><th className="py-2">الوظيفة الفعلية</th></tr></thead>
              <tbody>
                {mismatches.map((m, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-700">{m.name}</td>
                    <td className="py-2 text-slate-600">{m.iqama_profession}</td>
                    <td className="py-2"><span className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold">{m.job_title}</span></td>
                  </tr>
                ))}
                {mismatches.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400"><CheckCircle2 className="inline w-4 h-4" /> لا توجد مخالفات</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'lateness' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4">التأخير والغياب</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100"><th className="py-2">الموظف</th><th className="py-2">الفرع</th><th className="py-2">الحالة</th><th className="py-2">وقت الدخول</th></tr></thead>
              <tbody>
                {lateness.map((l, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-700">{l.employee_name}</td>
                    <td className="py-2 text-slate-600">{l.branch_name}</td>
                    <td className="py-2"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${l.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{l.status === 'late' ? 'متأخر' : 'غياب'}</span></td>
                    <td className="py-2 text-xs text-slate-400">{l.check_in_time ? new Date(l.check_in_time).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {lateness.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-400">لا سجلات تأخير أو غياب</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
