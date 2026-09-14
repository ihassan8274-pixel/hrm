import { useState, useEffect } from 'react';
import { Wallet, Landmark, Building2, FileText, RefreshCw, TrendingUp, Percent, CalendarClock } from 'lucide-react';

export default function SalaryReportsView() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [company, setCompany] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [statement, setStatement] = useState<any[]>([]);
  const [provisions, setProvisions] = useState<any>(null);
  const [tab, setTab] = useState<'company' | 'branch' | 'statement' | 'provisions'>('company');

  const load = async () => {
    const q = `?month=${month}&year=${year}`;
    const [c, b, s, p] = await Promise.all([
      fetch(`/api/reports/company-salary${q}`).then(r => r.json()),
      fetch(`/api/reports/branch-salary${q}`).then(r => r.json()),
      fetch(`/api/reports/payroll-statement${q}`).then(r => r.json()),
      fetch(`/api/reports/provisions${q}`).then(r => r.json()),
    ]);
    setCompany(c); setBranches(b.branches || []); setStatement(s); setProvisions(p);
  };
  useEffect(() => { load(); }, [month, year]);

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800">تقارير الرواتب</h2>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
          <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"><RefreshCw className="w-4 h-4" /> تحديث</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ v: 'company', l: 'إجمالي الشركة (نقدي/بنكي)', i: TrendingUp }, { v: 'branch', l: 'رواتب الفروع (تكلفة فعلية)', i: Building2 }, { v: 'statement', l: 'كشف الرواتب', i: FileText }, { v: 'provisions', l: 'المخصصات الشهرية', i: CalendarClock }].map(t => (
          <button key={t.v} onClick={() => setTab(t.v as any)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border ${tab === t.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            <t.i className="w-4 h-4" /> {t.l}
          </button>
        ))}
      </div>

      {tab === 'company' && company && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Wallet className="w-5 h-5" /> إجمالي نقدي</div>
            <p className="text-3xl font-black text-slate-800">{fmt(company.cash_total)}</p>
            <p className="text-xs text-slate-400 mt-1">{company.cash_count} موظف</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Landmark className="w-5 h-5" /> إجمالي بنكي</div>
            <p className="text-3xl font-black text-slate-800">{fmt(company.bank_total)}</p>
            <p className="text-xs text-slate-400 mt-1">{company.bank_count} موظف</p>
          </div>
          <div className="bg-blue-600 rounded-2xl p-6 shadow-sm text-white">
            <div className="flex items-center gap-2 text-blue-100 text-sm mb-2"><TrendingUp className="w-5 h-5" /> الإجمالي الكلي</div>
            <p className="text-3xl font-black">{fmt(company.total)}</p>
            <p className="text-xs text-blue-100 mt-1">شهر {company.month}/{company.year}</p>
          </div>
        </div>
      )}

      {tab === 'branch' && (
        <div className="space-y-4">
          {branches.map(b => (
            <div key={b.branch_id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-slate-800 flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /> {b.branch_name}</h3>
                <span className="text-lg font-black text-emerald-600">{fmt(b.total_cost)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100"><th className="py-2">الموظف</th><th className="py-2">أيام العمل</th><th className="py-2">الراتب الشهري</th><th className="py-2">التكلفة على الفرع</th></tr></thead>
                  <tbody>
                    {(b.details || []).map((d: any, i: number) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-2 font-bold text-slate-700">موظف #{d.employee_id}</td>
                        <td className="py-2 text-slate-600">{d.days} يوم</td>
                        <td className="py-2 text-slate-600">{fmt(d.monthly)}</td>
                        <td className="py-2 font-bold text-emerald-600">{fmt(d.cost)}</td>
                      </tr>
                    ))}
                    {(b.details || []).length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">لا حضور مسجل لهذا الفرع في هذا الشهر</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-400">تُحسب التكلفة الفعلية لكل فرع حسب أيام حضور الموظف فيه (الراتب الشهري ÷ 30 × الأيام). مثال: موظف عمل 10 أيام في فرع ثم نُقل تظهر تكلفه على الفرع الأول.</p>
        </div>
      )}

      {tab === 'statement' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4">كشف الرواتب — شهر {month}/{year}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100">
                <th className="py-2">الموظف</th><th className="py-2">الفرع</th><th className="py-2">الأساسي</th><th className="py-2">البدلات</th><th className="py-2">الخصومات</th><th className="py-2">صافي</th><th className="py-2">طريقة الدفع</th>
              </tr></thead>
              <tbody>
                {statement.map(p => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-700">{p.employee_name}</td>
                    <td className="py-2 text-slate-600">{p.branch_name}</td>
                    <td className="py-2 text-slate-600">{fmt(p.basic_salary)}</td>
                    <td className="py-2 text-slate-600">{fmt(p.allowances)}</td>
                    <td className="py-2 text-red-600">{fmt(p.deductions)}</td>
                    <td className="py-2 font-bold text-emerald-600">{fmt(p.net_salary)}</td>
                    <td className="py-2"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${p.payment_method === 'cash' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{p.payment_method === 'cash' ? 'نقدي' : 'بنكي'}</span></td>
                  </tr>
                ))}
                {statement.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">لا بيانات رواتب لهذا الشهر — أنشئ مسير الرواتب أولاً</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'provisions' && provisions && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Landmark className="w-5 h-5" /> مخصص نهاية الخدمة</div>
              <p className="text-2xl font-black text-slate-800">{fmt(provisions.total_eosb)}</p>
              <p className="text-xs text-emerald-600 font-bold mt-1">نسبة {provisions.eosb_ratio}% من الرواتب</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><CalendarClock className="w-5 h-5" /> مخصص الإجازات</div>
              <p className="text-2xl font-black text-slate-800">{fmt(provisions.total_leave)}</p>
              <p className="text-xs text-emerald-600 font-bold mt-1">نسبة {provisions.leave_ratio}% من الرواتب</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><TrendingUp className="w-5 h-5" /> إجمالي المخصصات</div>
              <p className="text-2xl font-black text-slate-800">{fmt(provisions.total_provision)}</p>
              <p className="text-xs text-emerald-600 font-bold mt-1">نسبة {provisions.total_ratio}% من الرواتب</p>
            </div>
            <div className="bg-blue-600 rounded-2xl p-6 shadow-sm text-white">
              <div className="flex items-center gap-2 text-blue-100 text-sm mb-2"><Percent className="w-5 h-5" /> أساس الرواتب</div>
              <p className="text-2xl font-black">{fmt(provisions.payroll_base)}</p>
              <p className="text-xs text-blue-100 mt-1">شهر {provisions.month}/{provisions.year}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4">تفاصيل المخصصات لكل موظف</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100">
                  <th className="py-2">الموظف</th><th className="py-2">الأجر الشهري</th><th className="py-2">أيام العمل</th><th className="py-2">نهاية الخدمة</th><th className="py-2">الإجازات</th><th className="py-2">الإجمالي</th>
                </tr></thead>
                <tbody>
                  {(provisions.employees || []).map((r: any) => (
                    <tr key={r.employee_id} className="border-b border-slate-50">
                      <td className="py-2 font-bold text-slate-700">{r.name}</td>
                      <td className="py-2 text-slate-600">{fmt(r.monthly_wage)}</td>
                      <td className="py-2 text-slate-600">{r.days}</td>
                      <td className="py-2 text-slate-600">{fmt(r.eosb_provision)}</td>
                      <td className="py-2 text-slate-600">{fmt(r.leave_provision)}</td>
                      <td className="py-2 font-bold text-emerald-600">{fmt(r.total_provision)}</td>
                    </tr>
                  ))}
                  {(provisions.employees || []).length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">لا موظفون</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">نهاية الخدمة: نصف شهر عن كل سنة (يُستحق شهرياً) على أيام العمل. الإجازات: 21 يوم سنوية تُستحق شهرياً.</p>
          </div>
        </div>
      )}
    </div>
  );
}
