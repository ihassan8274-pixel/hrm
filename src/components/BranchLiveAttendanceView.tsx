import { useEffect, useState } from 'react';
import { RefreshCw, Users, Clock, UserX, AlertTriangle, MapPin } from 'lucide-react';

export default function BranchLiveAttendanceView() {
  const [data, setData] = useState<any>(null);
  const [monthRep, setMonthRep] = useState<any>(null);
  const load = async () => {
    const res = await fetch('/api/attendance/live');
    setData(await res.json());
    const now = new Date();
    const r = await fetch(`/api/attendance/branch-month-report?month=${now.getMonth() + 1}&year=${now.getFullYear()}`);
    setMonthRep(await r.json());
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const today = data?.today || [];
  const present = today.filter((r: any) => r.check_in_time && !r.check_out_time);
  const left = today.filter((r: any) => r.check_out_time);
  const late = today.filter((r: any) => r.status === 'late');
  const geoFails = data?.geo_fails || [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800">حضور الفروع الآن</h2>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold"><RefreshCw className="w-4 h-4" /> تحديث</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { l: 'داخل الدوام', n: present.length, i: Users, c: 'text-emerald-700 bg-emerald-50' },
          { l: 'انصرفوا', n: left.length, i: Clock, c: 'text-slate-700 bg-slate-50' },
          { l: 'متأخرون اليوم', n: late.length, i: AlertTriangle, c: 'text-amber-700 bg-amber-50' },
          { l: 'محاولات خارج النطاق', n: geoFails.length, i: MapPin, c: 'text-rose-700 bg-rose-50' },
        ].map(k => (
          <div key={k.l} className={`rounded-2xl p-4 border border-slate-100 ${k.c}`}>
            <k.i className="w-5 h-5 mb-2" />
            <p className="text-2xl font-black">{k.n}</p>
            <p className="text-xs font-bold">{k.l}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black mb-3">سجل اليوم</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-xs text-slate-400 border-b">
              <th className="py-2">الموظف</th><th>الفرع</th><th>دخول</th><th>خروج</th><th>الحالة</th><th>الطريقة</th>
            </tr></thead>
            <tbody>
              {today.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-2 font-bold">{r.employee_name}</td>
                  <td>{r.branch_name}</td>
                  <td className="font-mono text-xs">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('ar') : '-'}</td>
                  <td className="font-mono text-xs">{r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('ar') : '-'}</td>
                  <td>{r.status === 'late' ? 'متأخر' : r.check_out_time ? 'انصرف' : 'حاضر'}</td>
                  <td>{r.method === 'face' ? 'وجه' : r.method === 'fingerprint' ? 'إصبع' : r.method}</td>
                </tr>
              ))}
              {today.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400"><UserX className="w-8 h-8 mx-auto mb-2 opacity-40" />لا تسجيلات اليوم</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {monthRep?.rows && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-black mb-3">إقفال الشهر {monthRep.month}/{monthRep.year} (حضور حسب الفرع)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-xs text-slate-400 border-b"><th className="py-2">الموظف</th><th>الفرع</th><th>حضور</th><th>تأخير</th><th>غياب</th><th>إضافي</th></tr></thead>
              <tbody>
                {monthRep.rows.map((r: any) => (
                  <tr key={r.employee_id} className="border-b border-slate-50">
                    <td className="py-2 font-bold">{r.employee_name}</td>
                    <td>{r.branch_name}</td>
                    <td>{r.present_days || 0}</td>
                    <td>{r.late_days || 0}</td>
                    <td>{r.absence_days || 0}</td>
                    <td>{r.overtime_hours || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {geoFails.length > 0 && (
        <div className="bg-rose-50 rounded-2xl border border-rose-200 p-5">
          <h3 className="font-black text-rose-800 mb-2">محاولات خارج النطاق (آخر 24 ساعة)</h3>
          <ul className="text-sm space-y-1 text-rose-800">
            {geoFails.slice(0, 20).map((g: any) => (
              <li key={g.id}>{g.created_at} — {g.details || g.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
