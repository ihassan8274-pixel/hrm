import { useState, useEffect, FormEvent } from 'react';
import { 
  User, BadgeDollarSign, CalendarDays, FileText, Download, 
  ShieldCheck, Landmark, Clock, TrendingUp, Printer, QrCode, 
  Plane, CheckCircle2, FileCheck, Sparkles, Send
} from 'lucide-react';
import type { Employee, PayrollRecord, Leave } from '../types';
import SalaryCertificateModal from './SalaryCertificateModal';
import { getCurrencySymbol } from '../utils/currency';
import { useAuth } from '../context/AuthContext';

export default function ESSView() {
  const { hasRole } = useAuth();
  const selfServiceOnly = hasRole('employee_ess');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [selectedServiceTab, setSelectedServiceTab] = useState<'payslip' | 'certificates' | 'leaves' | 'requests' | 'documents' | 'attendance'>('payslip');
  const [currency, setCurrency] = useState('SAR');
  const [myDocs, setMyDocs] = useState<any[]>([]);
  const [myAttendance, setMyAttendance] = useState<any[]>([]);

  // Visa Request Form state
  const [visaReq, setVisaReq] = useState({
    type: 'multiple',
    duration_days: 60,
    travel_date: new Date().toISOString().split('T')[0],
    reason: 'إجازة سنوية وزيارة عائلية'
  });
  const [visaReqSuccess, setVisaReqSuccess] = useState(false);

  const selectedEmployee = employees.find(e => e.id === selectedId);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => { if (d?.currency) setCurrency(d.currency); }).catch(() => {});
    fetch('/api/employees').then(res => res.json()).then(data => {
      setEmployees(data || []);
      if (data && data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetch(`/api/payroll?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`)
        .then(res => res.json())
        .then(data => {
          setPayroll(data.filter((p: any) => p.employee_id === selectedId));
        });
      fetch('/api/leaves')
        .then(res => res.json())
        .then(data => {
          setLeaves(data.filter((l: any) => l.employee_id === selectedId));
        });
      fetch(`/api/documents/${selectedId}`)
        .then(res => res.json())
        .then(data => setMyDocs(Array.isArray(data) ? data : []))
        .catch(() => setMyDocs([]));
      fetch('/api/attendance/logs')
        .then(res => res.json())
        .then(data => setMyAttendance((Array.isArray(data) ? data : []).filter((l: any) => l.employee_id === selectedId)))
        .catch(() => setMyAttendance([]));
    }
  }, [selectedId]);

  const handleVisaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await fetch('/api/visas/exit-reentry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmployee.id,
          ...visaReq
        })
      });
      setVisaReqSuccess(true);
      setTimeout(() => setVisaReqSuccess(false), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  if (!selectedId && employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-200" dir="rtl">
        <User className="w-16 h-16 text-slate-200 mb-4 animate-pulse" />
        <h2 className="text-xl font-black text-slate-800 mb-2">منصة الخدمة الذاتية للموظفين (ESS)</h2>
        <p className="text-slate-400 mb-6 text-center max-w-sm text-xs">جارِ تحميل بيانات الموظفين...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Top Banner with Employee Selector */}
      <div className="bg-gradient-to-l from-slate-900 via-emerald-950 to-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-emerald-800/40">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 backdrop-blur-md flex items-center justify-center text-2xl font-black text-emerald-300">
            {selectedEmployee?.name?.[0] || 'م'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black">{selectedEmployee?.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {selectedEmployee?.is_saudi ? 'مواطن سعودي' : 'مقيم'}
              </span>
            </div>
            <p className="text-emerald-200/80 text-xs mt-0.5">
              {selectedEmployee?.job_title || selectedEmployee?.position} • {selectedEmployee?.department_name || 'العمليات'}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-[11px] bg-white/10 px-2.5 py-0.5 rounded-lg font-mono font-bold">
                رقم الهوية/الإقامة: {selectedEmployee?.national_id_iqama || '1029384756'}
              </span>
              <span className="text-[11px] bg-white/10 px-2.5 py-0.5 rounded-lg font-mono font-bold">
                الرقم الوظيفي: #{selectedEmployee?.id}
              </span>
              <span className="text-[11px] bg-emerald-400/20 text-emerald-200 px-2.5 py-0.5 rounded-lg font-bold">
                {selectedEmployee?.branch_name || 'الفرع الرئيسي - الرياض'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {!selfServiceOnly && (
          <select 
            value={selectedId || ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full sm:w-auto px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
          >
            {employees.map(e => (
              <option key={e.id} value={e.id} className="text-slate-900">
                {e.name} ({e.is_saudi ? 'سعودي' : 'مقيم'})
              </option>
            ))}
          </select>
          )}

          <button
            onClick={() => setIsCertModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>إصدار شهادة تعريف بالراتب</span>
          </button>
        </div>
      </div>

      {/* Quick Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2">
            <BadgeDollarSign className="w-5 h-5" />
          </div>
          <span className="text-xs text-slate-400 font-bold block">الراتب الأساسي الشهري</span>
          <h4 className="text-xl font-black text-slate-800">
            {(selectedEmployee?.basic_salary || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">{getCurrencySymbol(currency)}</span>
          </h4>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className="text-xs text-slate-400 font-bold block">إجمالي البدلات المعتمدة</span>
          <h4 className="text-xl font-black text-slate-800">
            {(selectedEmployee?.allowances || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">{getCurrencySymbol(currency)}</span>
          </h4>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-2">
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-xs text-slate-400 font-bold block">رصيد الإجازات السنوية المستحق</span>
          <h4 className="text-xl font-black text-slate-800">
            {selectedEmployee?.annual_leave_balance || 21} <span className="text-xs font-normal text-slate-400">يوم (المادة 109)</span>
          </h4>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-2">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-xs text-slate-400 font-bold block">اشتراك التأمينات (GOSI)</span>
          <h4 className="text-xl font-black text-purple-700">
            {selectedEmployee?.is_saudi ? '9.75%' : '0%'} <span className="text-xs font-normal text-slate-400">{selectedEmployee?.is_saudi ? 'معاشات وساند' : 'تأمين أخطار مهنية (على المنشأة)'}</span>
          </h4>
        </div>
      </div>

      {/* Navigation Sub-Tabs for ESS */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
        <button
          onClick={() => setSelectedServiceTab('payslip')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            selectedServiceTab === 'payslip' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          مفردات ومسير الراتب
        </button>
        <button
          onClick={() => setSelectedServiceTab('certificates')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            selectedServiceTab === 'certificates' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          شهادات التعريف الإلكترونية
        </button>
        <button
          onClick={() => setSelectedServiceTab('leaves')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            selectedServiceTab === 'leaves' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          سجل الإجازات والأرصدة
        </button>
        <button
          onClick={() => setSelectedServiceTab('requests')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            selectedServiceTab === 'requests' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          طلب تأشيرة خروج وعودة
        </button>
        <button
          onClick={() => setSelectedServiceTab('documents')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            selectedServiceTab === 'documents' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          مستنداتي
        </button>
        <button
          onClick={() => setSelectedServiceTab('attendance')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            selectedServiceTab === 'attendance' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          سجل حضوري
        </button>
      </div>

      {/* Tab 1: Payslip View */}
      {selectedServiceTab === 'payslip' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                قسيمة الراتب للشهر الجاري (متوافق مع حماية الأجور مدد)
              </h3>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between p-3.5 bg-slate-50 rounded-2xl font-bold">
                <span className="text-slate-600">الراتب الأساسي</span>
                <span className="text-slate-900 font-mono">{(selectedEmployee?.basic_salary || 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between px-3.5">
                <span className="text-slate-500 font-medium">بدل سكن ومواصلات</span>
                <span className="text-emerald-700 font-mono font-bold">+{(selectedEmployee?.allowances || 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between px-3.5">
                <span className="text-slate-500 font-medium">حصة التأمينات الاجتماعية GOSI (عامل)</span>
                <span className="text-rose-600 font-mono font-bold">
                  -{selectedEmployee?.is_saudi ? Math.round(((selectedEmployee?.basic_salary || 0) + (selectedEmployee?.allowances || 0)) * 0.0975).toLocaleString() : 0} ر.س
                </span>
              </div>
              <div className="flex justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100 font-black">
                <span className="text-emerald-950 text-sm">صافي الراتب المستحق في الحساب البنكي</span>
                <span className="text-emerald-900 text-lg font-mono">
                  {(payroll[0]?.net_salary ?? (
                    (selectedEmployee?.basic_salary || 0) +
                    (selectedEmployee?.allowances || 0) -
                    (selectedEmployee?.is_saudi ? Math.round(((selectedEmployee?.basic_salary || 0) + (selectedEmployee?.allowances || 0)) * 0.0975) : 0)
                  )).toLocaleString()} ر.س
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-slate-800">بيانات الحساب البنكي والتحويل السريع (سريع IPS)</h3>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">اسم البنك المعتمد:</span>
                <span className="text-slate-800 font-black">{selectedEmployee?.bank_name || 'مصرف الراجحي'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">رقم الآيبان الدولي (IBAN):</span>
                <span className="text-slate-800 font-mono font-black">{selectedEmployee?.iban || 'SA448000020160801009999'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">حالة التوثيق في مدد:</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> موثق ومطابق
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Salary Certificates Generator */}
      {selectedServiceTab === 'certificates' && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-black text-slate-800">إصدار خطابات وشهادات التعريف بالراتب المعتمدة</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                شهادات إلكترونية رسمية موثقة برمز استجابة سريعة (QR Code) موجهة للبنوك، السفارات، والجهات الحكومية
              </p>
            </div>
            <button
              onClick={() => setIsCertModalOpen(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
            >
              <FileCheck className="w-4 h-4" />
              تخصيص وطباعة الشهادة
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-black text-slate-800">شهادة تعريف موجهة للبنك</h4>
              <p className="text-[11px] text-slate-500">لأغراض التمويل العقاري أو الشخصي وإصدار البطاقات الائتمانية مع تفصيل البدلات.</p>
              <button
                onClick={() => setIsCertModalOpen(true)}
                className="text-xs font-bold text-emerald-700 hover:underline pt-2 block"
              >
                معاينة وإصدار ←
              </button>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-black text-slate-800">شهادة تعريف للسفارات والتأشيرات</h4>
              <p className="text-[11px] text-slate-500">باللغة الإنجليزية أو العربية لتقديمها للقنصليات والسفارات لإصدار تأشيرات السفر (Schengen, UK, US).</p>
              <button
                onClick={() => setIsCertModalOpen(true)}
                className="text-xs font-bold text-emerald-700 hover:underline pt-2 block"
              >
                معاينة وإصدار ←
              </button>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-black text-slate-800">شهادة تثبيت راتب</h4>
              <p className="text-[11px] text-slate-500">تعهد بتحويل الراتب ومستحقات نهاية الخدمة وفق متطلبات الجهات التمويلية.</p>
              <button
                onClick={() => setIsCertModalOpen(true)}
                className="text-xs font-bold text-emerald-700 hover:underline pt-2 block"
              >
                معاينة وإصدار ←
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Leaves & Balance */}
      {selectedServiceTab === 'leaves' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-800">سجل الإجازات والأرصدة النظامية (المادة 109)</h3>
          <div className="space-y-3">
            {leaves.map(l => (
              <div key={l.id} className="flex justify-between items-center p-3.5 bg-slate-50 rounded-2xl text-xs">
                <div>
                  <p className="font-bold text-slate-800">{l.type === 'annual' ? 'إجازة سنوية اعتيادية' : 'إجازة مرضية'}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">من {l.start_date} إلى {l.end_date}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                  l.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700'
                }`}>
                  {l.status === 'approved' ? 'معتمدة ومخصومة من الرصيد' : 'قيد المراجعة'}
                </span>
              </div>
            ))}
            {leaves.length === 0 && (
              <p className="text-center py-6 text-slate-400 text-xs">لا توجد طلبات إجازة سابقة</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Visa & Re-entry Request */}
      {selectedServiceTab === 'requests' && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 max-w-xl">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Plane className="w-5 h-5 text-blue-600" />
              طلب إصدار تأشيرة خروج وعودة (منصة مقيم / أبشر)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              تقديم طلب لإدارة الموارد البشرية لإصدار التأشيرة وسداد الرسوم الحكومية
            </p>
          </div>

          {visaReqSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              تم إرسال طلب التأشيرة بنجاح وسيتم إشعارك فور اكتمال السداد في منصة مقيم.
            </div>
          )}

          <form onSubmit={handleVisaSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع التأشيرة المطلوبة</label>
              <select
                value={visaReq.type}
                onChange={(e) => setVisaReq({ ...visaReq, type: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
              >
                <option value="single">خروج وعودة مفردة (سفرة واحدة - شهران 200 ر.س)</option>
                <option value="multiple">خروج وعودة متعددة (عدة سفرات - 3 أشهر 500 ر.س)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ السفر المتوقع</label>
                <input
                  type="date"
                  value={visaReq.travel_date}
                  onChange={(e) => setVisaReq({ ...visaReq, travel_date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المدة المطلوبة (أيام)</label>
                <input
                  type="number"
                  value={visaReq.duration_days}
                  onChange={(e) => setVisaReq({ ...visaReq, duration_days: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">سبب الطلب / وجهة السفر</label>
              <textarea
                value={visaReq.reason}
                onChange={(e) => setVisaReq({ ...visaReq, reason: e.target.value })}
                rows={2}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4 rtl:rotate-180" />
              إرسال طلب التأشيرة للموارد البشرية
            </button>
          </form>
        </div>
      )}

      {/* Tab: My Documents */}
      {selectedServiceTab === 'documents' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-600" /> مستنداتي الرسمية</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myDocs.map(d => (
              <div key={d.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-slate-700 text-sm">{d.doc_type}</span>
                </div>
                {d.doc_number && <p className="text-xs text-slate-500">رقم: {d.doc_number}</p>}
                {d.expiry_date && <p className="text-xs text-slate-500">ينتهي: {d.expiry_date}</p>}
                {d.file_path && <a href={d.file_path} target="_blank" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><Download className="w-3.5 h-3.5" /> عرض المستند</a>}
              </div>
            ))}
            {myDocs.length === 0 && <p className="text-sm text-slate-400 col-span-full text-center py-8">لا توجد مستندات مرفوعة بعد</p>}
          </div>
        </div>
      )}

      {/* Tab: My Attendance */}
      {selectedServiceTab === 'attendance' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-600" /> سجل حضوري وانصرافي</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100">
                <th className="py-2">التاريخ</th><th className="py-2">الفرع</th><th className="py-2">الدخول</th><th className="py-2">الانصراف</th><th className="py-2">الطريقة</th><th className="py-2">الحالة</th>
              </tr></thead>
              <tbody>
                {myAttendance.map(l => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{l.check_in_time ? new Date(l.check_in_time).toLocaleDateString() : '—'}</td>
                    <td className="py-2 text-slate-600">{l.branch_name}</td>
                    <td className="py-2 text-slate-600">{l.check_in_time ? new Date(l.check_in_time).toLocaleTimeString() : '—'}</td>
                    <td className="py-2 text-slate-600">{l.check_out_time ? new Date(l.check_out_time).toLocaleTimeString() : '—'}</td>
                    <td className="py-2 text-slate-600">{l.method}</td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${l.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{l.status === 'late' ? 'متأخر' : 'حاضر'}</span></td>
                  </tr>
                ))}
                {myAttendance.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">لا سجلات حضور</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Salary Certificate Modal */}
      {selectedEmployee && isCertModalOpen && (
        <SalaryCertificateModal
          employee={selectedEmployee}
          isOpen={isCertModalOpen}
          onClose={() => setIsCertModalOpen(false)}
        />
      )}
    </div>
  );
}
