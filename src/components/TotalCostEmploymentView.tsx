import { useState, useEffect } from 'react';
import { 
  TrendingUp, DollarSign, Users, PieChart as PieIcon, 
  Download, RefreshCw, BarChart3, ShieldCheck, Scale, ArrowUpRight
} from 'lucide-react';
import type { TotalCostEmploymentRecord } from '../types';

export default function TotalCostEmploymentView() {
  const [employees, setEmployees] = useState<TotalCostEmploymentRecord[]>([]);
  const [totalMonthly, setTotalMonthly] = useState<number>(0);
  const [totalAnnual, setTotalAnnual] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [filterNationality, setFilterNationality] = useState<'all' | 'saudi' | 'expat'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saudi/cost-of-employment');
      const data = await res.json();
      setEmployees(data.employees || []);
      setTotalMonthly(data.totalMonthlyAll || 0);
      setTotalAnnual(data.totalAnnualAll || 0);
    } catch (err) {
      console.error("Error loading cost of employment:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = employees.filter(e => {
    const matchesSearch = e.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) || e.department_name.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterNationality === 'saudi') return matchesSearch && e.is_saudi === 1;
    if (filterNationality === 'expat') return matchesSearch && e.is_saudi === 0;
    return matchesSearch;
  });

  const avgMultiplier = employees.length > 0 
    ? (employees.reduce((sum, e) => sum + e.cost_multiplier, 0) / employees.length).toFixed(2)
    : '1.45';

  return (
    <div className="space-y-6" dir="rtl">
      {/* Overview Banner */}
      <div className="bg-gradient-to-l from-slate-900 via-brand-950 to-slate-900 text-white p-8 rounded-3xl shadow-xl">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
          <div className="space-y-2">
            <span className="text-xs text-brand-300 font-bold uppercase tracking-wider block">
              التحليل المالي المتقدم للرواتب والمستحقات
            </span>
            <h2 className="text-3xl font-black">
              التكلفة الفعلية الشاملة للموظف (Total Cost of Employment)
            </h2>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              تحسب التكلفة الحقيقية التي تتحملها المنشأة لكل موظف: (الراتب المباشر + حصة التأمينات GOSI + التأمين الطبي + المقابل المالي والإقامة + مخصص نهاية الخدمة + مخصص الإجازة والتذكرة).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="text-center p-2">
              <span className="text-[11px] text-slate-300 font-bold block">إجمالي التكلفة الشهرية</span>
              <span className="text-xl font-black text-emerald-400 mt-1 block">
                {totalMonthly.toLocaleString()} ر.س
              </span>
            </div>
            <div className="text-center p-2">
              <span className="text-[11px] text-slate-300 font-bold block">متوسط معامل التكلفة</span>
              <span className="text-xl font-black text-amber-300 mt-1 block">
                {avgMultiplier}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and actions bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="بحث بالاسم أو القسم..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none w-full sm:w-64"
          />
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setFilterNationality('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterNationality === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
            >
              الكل ({employees.length})
            </button>
            <button
              onClick={() => setFilterNationality('saudi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterNationality === 'saudi' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}
            >
              سعوديون
            </button>
            <button
              onClick={() => setFilterNationality('expat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterNationality === 'expat' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}
            >
              مقيمون
            </button>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Cost Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">الموظف / القسم</th>
                <th className="p-3.5">الراتب والبدلات (المباشر)</th>
                <th className="p-3.5">تأمينات المنشأة (GOSI)</th>
                <th className="p-3.5">التأمين الطبي</th>
                <th className="p-3.5">الرسوم الحكومية الشهرية</th>
                <th className="p-3.5">مخصصات (EOSB والإجازة)</th>
                <th className="p-3.5 bg-emerald-50 text-emerald-950 font-black">التكلفة الشهرية الفعلية</th>
                <th className="p-3.5 font-bold">التكلفة السنوية</th>
                <th className="p-3.5 text-center">معامل التكلفة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                    لا توجد بيانات مطابقة
                  </td>
                </tr>
              ) : (
                filtered.map(emp => (
                  <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <p className="font-bold text-slate-800">{emp.employee_name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{emp.department_name} • {emp.branch_name}</p>
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{emp.monthly_direct_salary.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-bold text-brand-700">+{emp.monthly_gosi_employer.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-bold text-slate-600">+{emp.monthly_medical_insurance.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-bold text-slate-600">
                      {emp.monthly_government_fees > 0 ? `+${emp.monthly_government_fees.toLocaleString()} ر.س` : '-'}
                    </td>
                    <td className="p-3.5 font-bold text-purple-700">
                      +{(emp.monthly_eosb_provision + emp.monthly_leave_provision + emp.monthly_ticket_provision).toLocaleString()} ر.س
                    </td>
                    <td className="p-3.5 font-black text-emerald-700 bg-emerald-50/50">
                      {emp.monthly_total_cost.toLocaleString()} ر.س
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">
                      {emp.annual_total_cost.toLocaleString()} ر.س
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                        {emp.cost_multiplier}x
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
