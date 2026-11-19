import { useState, useEffect, FormEvent } from 'react';
import { 
  Plane, Globe, Calendar, Plus, RefreshCw, AlertCircle, 
  CheckCircle2, Clock, DollarSign, Search, Filter, 
  UserCheck, Shield, ExternalLink, Ticket, ArrowRightLeft, FileCheck
} from 'lucide-react';
import type { VisaRecord, FlightTicketRecord } from '../types';

export default function VisasMuqeemView() {
  const [activeSubTab, setActiveSubTab] = useState<'visas' | 'tickets' | 'budget'>('visas');
  const [visas, setVisas] = useState<VisaRecord[]>([]);
  const [tickets, setTickets] = useState<FlightTicketRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // New Visa Modal State
  const [isVisaModalOpen, setIsVisaModalOpen] = useState(false);
  const [visaForm, setVisaForm] = useState({
    employee_id: 0,
    visa_type: 'exit_reentry_single',
    duration_days: 60,
    travel_before_date: '',
    return_before_date: '',
    cost: 200,
    notes: ''
  });

  // New Ticket Modal State
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    employee_id: 0,
    destination: 'القاهرة - مصر',
    trip_type: 'round_trip',
    departure_date: '',
    return_date: '',
    cost: 2500,
    allowance_type: 'ticket_issued',
    dependents_included: 0,
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vRes, tRes, eRes, bRes] = await Promise.all([
        fetch('/api/visas'),
        fetch('/api/flight-tickets'),
        fetch('/api/employees'),
        fetch('/api/saudi/government-budget')
      ]);
      const [vData, tData, eData, bData] = await Promise.all([
        vRes.json(),
        tRes.json(),
        eRes.json(),
        bRes.json()
      ]);
      setVisas(vData || []);
      setTickets(tData || []);
      setEmployees(eData || []);
      setBudget(bData || null);
    } catch (err) {
      console.error("Error fetching visas/tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleIssueVisa = async (e: FormEvent) => {
    e.preventDefault();
    if (!visaForm.employee_id) return alert('يرجى اختيار الموظف');

    try {
      const res = await fetch('/api/visas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visaForm)
      });
      const data = await res.json();
      if (data.success) {
        setIsVisaModalOpen(false);
        setVisaForm({
          employee_id: 0,
          visa_type: 'exit_reentry_single',
          duration_days: 60,
          travel_before_date: '',
          return_before_date: '',
          cost: 200,
          notes: ''
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBookTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticketForm.employee_id) return alert('يرجى اختيار الموظف');

    try {
      const res = await fetch('/api/flight-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketForm)
      });
      const data = await res.json();
      if (data.success) {
        setIsTicketModalOpen(false);
        setTicketForm({
          employee_id: 0,
          destination: 'القاهرة - مصر',
          trip_type: 'round_trip',
          departure_date: '',
          return_date: '',
          cost: 2500,
          allowance_type: 'ticket_issued',
          dependents_included: 0,
          notes: ''
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredVisas = visas.filter(v => 
    v.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.visa_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.national_id_iqama?.includes(searchTerm)
  );

  const getVisaBadge = (type: string) => {
    switch (type) {
      case 'exit_reentry_single':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">خروج وعودة مفردة (200 ر.س)</span>;
      case 'exit_reentry_multiple':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">خروج وعودة متعددة (500 ر.س)</span>;
      case 'final_exit':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">تأشيرة خروج نهائي</span>;
      case 'work_visa':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">تأشيرة عمل جديدة</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-700">{type}</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Sub navigation header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('visas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'visas' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Plane className="w-4 h-4" />
            تأشيرات الجوازات ومقيم ({visas.length})
          </button>
          <button
            onClick={() => setActiveSubTab('tickets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'tickets' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Ticket className="w-4 h-4" />
            تذاكر السفر والبدلات ({tickets.length})
          </button>
          <button
            onClick={() => setActiveSubTab('budget')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'budget' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            ميزانية الرسوم الحكومية السنوية
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'visas' && (
            <button
              onClick={() => setIsVisaModalOpen(true)}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              إصدار تأشيرة جديدة
            </button>
          )}
          {activeSubTab === 'tickets' && (
            <button
              onClick={() => setIsTicketModalOpen(true)}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              حجز تذكرة / بدل سفر
            </button>
          )}
          <button
            onClick={fetchData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. VISAS TAB */}
      {activeSubTab === 'visas' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">إجمالي التأشيرات الصادرة</span>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{visas.length}</h4>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">تأشيرات سارية</span>
              <h4 className="text-2xl font-black text-emerald-600 mt-1">
                {visas.filter(v => v.status === 'active').length}
              </h4>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">خروج وعودة مفردة / متعددة</span>
              <h4 className="text-2xl font-black text-brand-600 mt-1">
                {visas.filter(v => v.visa_type.includes('exit_reentry')).length}
              </h4>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">إجمالي رسوم سداد التأشيرات</span>
              <h4 className="text-2xl font-black text-slate-800 mt-1">
                {visas.reduce((sum, v) => sum + (v.cost || 0), 0).toLocaleString()} <span className="text-xs font-normal">ر.س</span>
              </h4>
            </div>
          </div>

          {/* Search bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="بحث باسم الموظف، رقم التأشيرة، أو رقم الإقامة..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Visas Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">الموظف / الإقامة</th>
                    <th className="p-3.5">نوع التأشيرة</th>
                    <th className="p-3.5">رقم التأشيرة</th>
                    <th className="p-3.5">المدة المصرح بها</th>
                    <th className="p-3.5">تاريخ الإصدار</th>
                    <th className="p-3.5">آخر موعد للعودة</th>
                    <th className="p-3.5">رسوم سداد</th>
                    <th className="p-3.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVisas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                        لا توجد تأشيرات مسجلة حتى الآن
                      </td>
                    </tr>
                  ) : (
                    filteredVisas.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <p className="font-bold text-slate-800">{v.employee_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{v.national_id_iqama} ({v.nationality})</p>
                        </td>
                        <td className="p-3.5">{getVisaBadge(v.visa_type)}</td>
                        <td className="p-3.5 font-mono font-bold text-slate-700">{v.visa_number}</td>
                        <td className="p-3.5 font-bold text-slate-800">{v.duration_days || 60} يوم</td>
                        <td className="p-3.5 font-mono text-slate-600">{v.issue_date || '-'}</td>
                        <td className="p-3.5 font-mono font-bold text-rose-600">{v.return_before_date || 'غير محدد'}</td>
                        <td className="p-3.5 font-bold text-slate-800">{v.cost?.toLocaleString() || 200} ر.س</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            v.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {v.status === 'active' ? 'سارية المفعول' : v.status}
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
      )}

      {/* 2. TICKETS TAB */}
      {activeSubTab === 'tickets' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">إجمالي تذاكر وبدلات السفر</span>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{tickets.length}</h4>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">إجمالي تكاليف التذاكر</span>
              <h4 className="text-2xl font-black text-emerald-600 mt-1">
                {tickets.reduce((sum, t) => sum + (t.cost || 0), 0).toLocaleString()} <span className="text-xs font-normal">ر.س</span>
              </h4>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block">بدل نقدي مقابل تذكرة</span>
              <h4 className="text-2xl font-black text-brand-600 mt-1">
                {tickets.filter(t => t.allowance_type === 'cash_allowance').length}
              </h4>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">الموظف</th>
                    <th className="p-3.5">الوجهة</th>
                    <th className="p-3.5">نوع الرحلة</th>
                    <th className="p-3.5">تاريخ المغادرة</th>
                    <th className="p-3.5">تاريخ العودة</th>
                    <th className="p-3.5">التكلفة (ر.س)</th>
                    <th className="p-3.5">طريقة الصرف</th>
                    <th className="p-3.5">المرافقين</th>
                    <th className="p-3.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                        لا توجد تذاكر مسجلة
                      </td>
                    </tr>
                  ) : (
                    tickets.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 font-bold text-slate-800">{t.employee_name}</td>
                        <td className="p-3.5 font-bold text-slate-700">{t.destination}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700">
                            {t.trip_type === 'round_trip' ? 'ذهاب وعودة' : 'ذهاب فقط'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-600">{t.departure_date || '-'}</td>
                        <td className="p-3.5 font-mono text-slate-600">{t.return_date || '-'}</td>
                        <td className="p-3.5 font-black text-emerald-700">{t.cost?.toLocaleString()} ر.س</td>
                        <td className="p-3.5 font-bold text-slate-600">
                          {t.allowance_type === 'ticket_issued' ? 'تذكرة مصدرة' : 'بدل نقدي بالراتب'}
                        </td>
                        <td className="p-3.5 font-bold text-slate-700">{t.dependents_included || 0}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            معتمدة
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
      )}

      {/* 3. GOVERNMENT BUDGET TAB */}
      {activeSubTab === 'budget' && budget && (
        <div className="space-y-6">
          <div className="bg-gradient-to-l from-emerald-800 to-slate-900 text-white p-8 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div>
                <span className="text-xs text-emerald-300 font-bold block uppercase tracking-wider">الميزانية السنوية التقديرية</span>
                <h2 className="text-3xl font-black mt-1">
                  {budget.annualTotalGovernmentCost?.toLocaleString()} <span className="text-base font-normal">ر.س / سنوياً</span>
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  المتوسط الشهري الموصى بحجزه كمخصصات: <strong>{budget.monthlyAverageGovernmentCost?.toLocaleString()} ر.س / شهرياً</strong>
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-center">
                <span className="text-xs text-slate-300 font-bold block">إجمالي القوى العاملة</span>
                <div className="flex items-center gap-3 mt-1 justify-center">
                  <span className="text-sm font-black text-emerald-400">{budget.saudiCount} سعودي</span>
                  <span className="text-slate-400">|</span>
                  <span className="text-sm font-black text-brand-300">{budget.expatCount} مقيم</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>المقابل المالي (رخص العمل)</span>
                <span className="text-slate-400 font-mono">9,600 ر.س / عامل</span>
              </div>
              <h4 className="text-xl font-black text-slate-900">{budget.annualWorkPermitFees?.toLocaleString()} ر.س</h4>
              <p className="text-[10px] text-slate-400">تدفع سنوياً عبر منصة قوى لتجديد رخص العمل</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>رسوم تجديد الإقامات (الجوازات)</span>
                <span className="text-slate-400 font-mono">650 ر.س / مقيم</span>
              </div>
              <h4 className="text-xl font-black text-slate-900">{budget.annualIqamaRenewalFees?.toLocaleString()} ر.س</h4>
              <p className="text-[10px] text-slate-400">تدفع عبر منصة مقيم / سداد للخدمات الحكومية</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>حصة المنشأة في التأمينات (GOSI)</span>
                <span className="text-slate-400 font-mono">11.75% / 2.0%</span>
              </div>
              <h4 className="text-xl font-black text-slate-900">{budget.annualGosiEmployerContribution?.toLocaleString()} ر.س</h4>
              <p className="text-[10px] text-slate-400">مجموع اشتراكات صاحب العمل السنوية في التأمينات</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>التأمين الطبي الإلزامي (مجلس الضمان)</span>
                <span className="text-slate-400 font-mono">تقديري</span>
              </div>
              <h4 className="text-xl font-black text-slate-900">{budget.annualMedicalInsuranceEstimate?.toLocaleString()} ر.س</h4>
              <p className="text-[10px] text-slate-400">بوليصة التأمين الطبي للموظفين وعوائلهم المعتمدة لدى CCHI</p>
            </div>
          </div>

          {/* Branch breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800">توزيع ميزانية الرسوم الحكومية حسب الفروع والمواقع</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">الفرع</th>
                    <th className="p-3">الموظفون السعوديون</th>
                    <th className="p-3">الموظفون المقيمون</th>
                    <th className="p-3">التكلفة التقديرية السنوية للفرع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {budget.branchBreakdown?.map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-800">{b.branch_name}</td>
                      <td className="p-3 font-bold text-emerald-700">{b.saudi_count}</td>
                      <td className="p-3 font-bold text-brand-700">{b.expat_count}</td>
                      <td className="p-3 font-black text-slate-900">{b.total_cost?.toLocaleString()} ر.س</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* New Visa Modal */}
      {isVisaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
            <h3 className="text-lg font-black text-slate-800">إصدار وتسجيل تأشيرة جديدة</h3>
            <form onSubmit={handleIssueVisa} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المقيم</label>
                <select
                  value={visaForm.employee_id}
                  onChange={(e) => setVisaForm({ ...visaForm, employee_id: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employees.filter(e => e.is_saudi === 0 || e.nationality !== 'سعودي').map(e => (
                    <option key={e.id} value={e.id}>{e.name} - {e.national_id_iqama} ({e.nationality})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع التأشيرة</label>
                <select
                  value={visaForm.visa_type}
                  onChange={(e) => {
                    const type = e.target.value;
                    const cost = type === 'exit_reentry_single' ? 200 : type === 'exit_reentry_multiple' ? 500 : 0;
                    setVisaForm({ ...visaForm, visa_type: type, cost });
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="exit_reentry_single">خروج وعودة مفردة (200 ر.س)</option>
                  <option value="exit_reentry_multiple">خروج وعودة متعددة (500 ر.س)</option>
                  <option value="final_exit">تأشيرة خروج نهائي</option>
                  <option value="work_visa">تأشيرة عمل وتفويض</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدة (أيام)</label>
                  <input
                    type="number"
                    value={visaForm.duration_days}
                    onChange={(e) => setVisaForm({ ...visaForm, duration_days: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رسوم السداد (ر.س)</label>
                  <input
                    type="number"
                    value={visaForm.cost}
                    onChange={(e) => setVisaForm({ ...visaForm, cost: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ السفر المتوقع</label>
                  <input
                    type="date"
                    value={visaForm.travel_before_date}
                    onChange={(e) => setVisaForm({ ...visaForm, travel_before_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">آخر موعد للعودة</label>
                  <input
                    type="date"
                    value={visaForm.return_before_date}
                    onChange={(e) => setVisaForm({ ...visaForm, return_before_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsVisaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black shadow-md shadow-brand-600/20"
                >
                  تأكيد وإصدار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {isTicketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
            <h3 className="text-lg font-black text-slate-800">تسجيل وحجز تذكرة سفر للموظف</h3>
            <form onSubmit={handleBookTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف</label>
                <select
                  value={ticketForm.employee_id}
                  onChange={(e) => setTicketForm({ ...ticketForm, employee_id: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} - {e.national_id_iqama}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوجهة (المدينة والدولة)</label>
                  <input
                    type="text"
                    value={ticketForm.destination}
                    onChange={(e) => setTicketForm({ ...ticketForm, destination: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الرحلة</label>
                  <select
                    value={ticketForm.trip_type}
                    onChange={(e) => setTicketForm({ ...ticketForm, trip_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="round_trip">ذهاب وعودة</option>
                    <option value="one_way">ذهاب فقط (خروج نهائي)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الصرف</label>
                  <select
                    value={ticketForm.allowance_type}
                    onChange={(e) => setTicketForm({ ...ticketForm, allowance_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="ticket_issued">تذكرة سفر مصدرة رسمياً</option>
                    <option value="cash_allowance">صرف بدل نقدي مع الراتب</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التكلفة الإجمالية (ر.س)</label>
                  <input
                    type="number"
                    value={ticketForm.cost}
                    onChange={(e) => setTicketForm({ ...ticketForm, cost: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المغادرة</label>
                  <input
                    type="date"
                    value={ticketForm.departure_date}
                    onChange={(e) => setTicketForm({ ...ticketForm, departure_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ العودة</label>
                  <input
                    type="date"
                    value={ticketForm.return_date}
                    onChange={(e) => setTicketForm({ ...ticketForm, return_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTicketModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black shadow-md shadow-brand-600/20"
                >
                  حفظ وتأكيد التذكرة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
