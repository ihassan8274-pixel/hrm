import { useState, useEffect } from 'react';
import { 
  Calculator, Download, Printer, RefreshCw, Layers, 
  TrendingUp, Calendar, AlertCircle, CheckCircle, FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import type { AccountingProvisionSummary } from '../types';
import { Letterhead } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

export default function AccountingProvisionsView() {
  const [data, setData] = useState<AccountingProvisionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();

  const fetchProvisions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saudi/accounting-provisions');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error loading accounting provisions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProvisions();
  }, []);

  const handleExportCSV = () => {
    if (!data?.provisions) return;
    const headers = [
      'رقم الموظف',
      'اسم الموظف',
      'الهوية / الإقامة',
      'الجنسية',
      'تاريخ المباشرة',
      'سنوات الخدمة',
      'الأجر الشهري الأساسي والبدلات',
      'المخصص الشهري لمكافأة نهاية الخدمة',
      'المخصص التراكمي لنهاية الخدمة',
      'رصيد الإجازات المستحق (أيام)',
      'مخصص الإجازات التراكمي',
      'مخصص تذاكر السفر السنوي',
      'إجمالي المخصص الشهري'
    ];

    const rows = data.provisions.map(p => [
      p.employee_id,
      `"${p.employee_name}"`,
      p.national_id_iqama,
      p.is_saudi ? 'سعودي' : 'مقيم',
      p.start_date,
      p.service_years,
      p.total_wage,
      p.monthly_eosb_provision,
      p.cumulative_eosb_provision,
      p.annual_leave_accrued_days,
      p.leave_provision_amount,
      p.annual_ticket_provision,
      p.total_monthly_provisions
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `IAS19_Saudi_Provisions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredProvisions = data?.provisions.filter(p => 
    p.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.national_id_iqama.includes(searchTerm)
  ) || [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* ترويسة تظهر على الورق فقط — الورق لا يبدأ بلا ترويسة. */}
      <div className="print-only">
        <Letterhead company={company} />
      </div>

      {/* Header and Summary Cards */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-800">مخصصات نهاية الخدمة والإجازات المحاسبية (معيار IAS 19)</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              متوافق مع المعايير السعودية والدولية
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            حساب القيود والاستحقاقات الشهرية التراكمية لمكافأة نهاية الخدمة (المادة 84) والإجازات السنوية وتذاكر السفر
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-600/20 transition-all"
          >
            <Download className="w-4 h-4" />
            تصدير تقرير القيود (Excel/CSV)
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Printer className="w-4 h-4" />
            طباعة
          </button>
          <button
            onClick={fetchProvisions}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary Financial Metric Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-lg space-y-1">
          <span className="text-xs text-slate-400 font-bold block">إجمالي مخصص نهاية الخدمة التراكمي</span>
          <h4 className="text-2xl font-black text-emerald-400">
            {data?.totalCumulativeEOSB?.toLocaleString() || 0} <span className="text-xs text-slate-300 font-normal">ر.س</span>
          </h4>
          <p className="text-[10px] text-slate-400 pt-1">رصيد الالتزام القائم حتى تاريخ اليوم</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold block">المخصص الشهري لمكافأة نهاية الخدمة</span>
          <h4 className="text-2xl font-black text-slate-800">
            {data?.totalMonthlyEOSB?.toLocaleString() || 0} <span className="text-xs text-slate-400 font-normal">ر.س / شهرياً</span>
          </h4>
          <p className="text-[10px] text-slate-400 pt-1">القيد الشهري في قائمة الدخل (حساب المصروفات)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold block">إجمالي مخصص الإجازات السنوية</span>
          <h4 className="text-2xl font-black text-brand-600">
            {data?.totalLeaveProvision?.toLocaleString() || 0} <span className="text-xs text-slate-400 font-normal">ر.س</span>
          </h4>
          <p className="text-[10px] text-slate-400 pt-1">مقابل رصيد الأيام المستحقة (21 أو 30 يوم)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs text-slate-500 font-bold block">إجمالي المخصصات الشهرية المجمعة</span>
          <h4 className="text-2xl font-black text-purple-700">
            {((data?.totalMonthlyEOSB || 0) + Math.round((data?.totalLeaveProvision || 0) / 12)).toLocaleString()} <span className="text-xs text-slate-400 font-normal">ر.س</span>
          </h4>
          <p className="text-[10px] text-slate-400 pt-1">نهاية الخدمة + إجازات + تذاكر سفر</p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="بحث باسم الموظف أو رقم الإقامة / الهوية..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <div className="text-xs text-slate-500 font-bold">
          عدد الموظفين الخاضعين للمخصص: <span className="text-slate-800 font-black">{filteredProvisions.length}</span>
        </div>
      </div>

      {/* Provisions Detail Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5">تاريخ المباشرة / الخدمة</th>
                <th className="p-3.5">الأجر الشامل الحسابي</th>
                <th className="p-3.5">المخصص الشهري (EOSB)</th>
                <th className="p-3.5 bg-emerald-50 text-emerald-900 font-black">المخصص التراكمي (EOSB)</th>
                <th className="p-3.5">أيام الإجازة السنوية</th>
                <th className="p-3.5">مخصص رصيد الإجازات</th>
                <th className="p-3.5">مخصص التذكرة السنوي</th>
                <th className="p-3.5 font-black text-slate-900">إجمالي المخصص الشهري</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProvisions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                    لا توجد سجلات مطابقة
                  </td>
                </tr>
              ) : (
                filteredProvisions.map(p => (
                  <tr key={p.employee_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <p className="font-bold text-slate-800">{p.employee_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {p.national_id_iqama} • {p.is_saudi ? 'سعودي' : 'مقيم'}
                      </p>
                    </td>
                    <td className="p-3.5">
                      <p className="font-mono text-slate-700">{p.start_date}</p>
                      <p className="text-[10px] text-emerald-700 font-bold">
                        {p.service_years} سنة و {p.service_months} شهر
                      </p>
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{p.total_wage.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-bold text-slate-700">{p.monthly_eosb_provision.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-black text-emerald-700 bg-emerald-50/40">
                      {p.cumulative_eosb_provision.toLocaleString()} ر.س
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700">
                        {p.annual_leave_accrued_days} يوم
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-700">{p.leave_provision_amount.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-bold text-slate-600">
                      {p.annual_ticket_provision ? `${p.annual_ticket_provision.toLocaleString()} ر.س` : '-'}
                    </td>
                    <td className="p-3.5 font-black text-purple-800 bg-purple-50/30">
                      {p.total_monthly_provisions.toLocaleString()} ر.س
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
