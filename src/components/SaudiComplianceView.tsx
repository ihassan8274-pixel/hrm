import { useState, useEffect, FormEvent } from 'react';
import { 
  ShieldCheck, AlertTriangle, CheckCircle, Clock, FileText, 
  Download, RefreshCw, Calculator, CreditCard, Users, Building, 
  Calendar, Check, X, Printer, Search, Filter, ArrowUpRight,
  Shield, UserCheck, Briefcase, Plus, FileCheck, Layers,
  Plane, DollarSign, TrendingUp, Sparkles, Scale, AlertCircle
} from 'lucide-react';
import type { SaudiComplianceSummary, SaudiGovernmentRenewal, EndOfServiceCalculation } from '../types';
import { downloadProtectedFile } from '../lib/api';
import VisasMuqeemView from './VisasMuqeemView';
import AccountingProvisionsView from './AccountingProvisionsView';
import TotalCostEmploymentView from './TotalCostEmploymentView';
import OvertimeRamadanView from './OvertimeRamadanView';
import LaborLawAiConsultantView from './LaborLawAiConsultantView';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

function todayAsInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

interface ExpiringDocEmployee {
  id: number;
  name: string;
  position?: string;
  nationality: string;
  is_saudi: number;
  national_id_iqama: string;
  border_number?: string;
  iqama_expiry_gregorian?: string;
  iqama_expiry_hijri?: string;
  iqama_profession?: string;
  work_permit_number?: string;
  work_permit_expiry?: string;
  work_permit_fee?: number;
  gosi_number?: string;
  gosi_registered_salary?: number;
  basic_salary: number;
  housing_allowance?: number;
  transport_allowance?: number;
  insurance_company?: string;
  medical_insurance_category?: string;
  medical_insurance_policy?: string;
  medical_insurance_expiry?: string;
  medical_dependents_count?: number;
  saudi_iban?: string;
  bank_name?: string;
  branch_name?: string;
  department_name?: string;
  iqamaDaysRemaining: number | null;
  iqamaStatus: 'valid' | 'warning_30' | 'warning_60' | 'warning_90' | 'expired';
  workPermitDaysRemaining: number | null;
  workPermitStatus: 'valid' | 'warning' | 'expired';
  medicalDaysRemaining: number | null;
  medicalStatus: 'valid' | 'warning' | 'expired';
}

interface GosiRecord {
  employee_id: number;
  name: string;
  is_saudi: number;
  nationality: string;
  national_id_iqama: string;
  gosi_number: string;
  branch_name: string;
  department_name: string;
  basic_salary: number;
  housing_allowance: number;
  contributory_salary: number;
  annuities_emp: number;
  annuities_comp: number;
  saned_emp: number;
  saned_comp: number;
  hazards_comp: number;
  emp_share: number;
  comp_share: number;
  total_gosi_due: number;
}

export default function SaudiComplianceView() {
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();
  const [activeTab, setActiveTab] = useState<'overview' | 'iqama' | 'visas' | 'gosi' | 'medical' | 'eos' | 'provisions' | 'cost_employment' | 'overtime' | 'wps' | 'ai_consultant' | 'renewals'>('overview');
  const [summary, setSummary] = useState<SaudiComplianceSummary | null>(null);
  const [documents, setDocuments] = useState<ExpiringDocEmployee[]>([]);
  const [gosiRecords, setGosiRecords] = useState<GosiRecord[]>([]);
  const [renewals, setRenewals] = useState<SaudiGovernmentRenewal[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Quick Renewal Modal
  const [selectedEmpForRenew, setSelectedEmpForRenew] = useState<ExpiringDocEmployee | null>(null);
  const [renewalType, setRenewalType] = useState<'iqama' | 'medical_insurance'>('iqama');
  const [renewalMonths, setRenewalMonths] = useState<number>(12);
  const [renewalCost, setRenewalCost] = useState<number>(10250);
  const [renewalSadad, setRenewalSadad] = useState<string>('');
  const [renewalNotes, setRenewalNotes] = useState<string>('');
  const [isSubmittingRenew, setIsSubmittingRenew] = useState(false);

  // End of Service State
  const [eosForm, setEosForm] = useState({
    employee_id: 0,
    employee_name: '',
    national_id_iqama: '',
    start_date: '2020-01-01',
    end_date: new Date().toISOString().split('T')[0],
    basic_salary: 8000,
    allowances: 2000,
    reason: 'employer_termination',
    leave_balance_compensation: 0,
    other_entitlements: 0,
    deductions: 0
  });
  const [eosResult, setEosResult] = useState<EndOfServiceCalculation | null>(null);

  // WPS Month/Year
  const [wpsMonth, setWpsMonth] = useState(new Date().getMonth() + 1);
  const [wpsYear, setWpsYear] = useState(new Date().getFullYear());
  const [wpsValueDate, setWpsValueDate] = useState(todayAsInputValue);
  const [exportingSif, setExportingSif] = useState(false);
  const [bankProfile, setBankProfile] = useState<{ crNumber: string | null; settlementBankCode: string | null; mappedBanks: string[] } | null>(null);
  const [exportReady, setExportReady] = useState(false);
  const [exportBlockers, setExportBlockers] = useState<string[]>([]);

  const exportSifFile = async () => {
    setExportingSif(true);
    try {
      const params = new URLSearchParams({
        month: String(wpsMonth),
        year: String(wpsYear),
        value_date: wpsValueDate,
      });
      const failure = await downloadProtectedFile(
        `/api/saudi/wps-export?${params.toString()}`,
        `SIF_${wpsYear}${String(wpsMonth).padStart(2, '0')}.sif`
      );
      if (failure) alert(failure.message);
    } finally {
      setExportingSif(false);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [sumRes, docRes, gosiRes, renewRes] = await Promise.all([
        fetch('/api/saudi/compliance-summary'),
        fetch('/api/saudi/expiring-documents'),
        fetch('/api/saudi/gosi-report'),
        fetch('/api/saudi/renewals')
      ]);

      const sumData = await sumRes.json();
      const docData = await docRes.json();
      const gosiData = await gosiRes.json();
      const renewData = await renewRes.json();

      setSummary(sumData);
      setDocuments(docData);
      setGosiRecords(gosiData);
      setRenewals(renewData);
    } catch (err) {
      console.error("Error fetching Saudi compliance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    fetch('/api/wps/audit')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        if (d.bankProfile) setBankProfile(d.bankProfile);
        setExportReady(d.exportReady === true);
        setExportBlockers(Array.isArray(d.exportBlockers) ? d.exportBlockers : []);
      })
      .catch(() => {});
  }, []);

  // Quick Renew submit
  const handleQuickRenewSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForRenew) return;

    setIsSubmittingRenew(true);
    try {
      await fetch('/api/saudi/quick-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmpForRenew.id,
          type: renewalType,
          duration_months: renewalMonths,
          cost: renewalCost,
          sadad_number: renewalSadad,
          notes: renewalNotes
        })
      });

      setSelectedEmpForRenew(null);
      await fetchAllData();
    } catch (err) {
      alert("حدث خطأ أثناء تنفيذ عملية التجديد");
    } finally {
      setIsSubmittingRenew(false);
    }
  };

  // Open Quick Renew modal
  const openRenewModal = (emp: ExpiringDocEmployee, type: 'iqama' | 'medical_insurance') => {
    setSelectedEmpForRenew(emp);
    setRenewalType(type);
    setRenewalMonths(12);
    if (type === 'iqama') {
      setRenewalCost(10250); // 9600 work permit + 650 passport
    } else {
      setRenewalCost(2500); // estimated health insurance
    }
    setRenewalSadad(`SADAD-${Math.floor(100000 + Math.random() * 900000)}`);
    setRenewalNotes(type === 'iqama' ? 'تجديد الإقامة ورخصة العمل لمدة سنة' : 'تجديد وثيقة التأمين الطبي المعتمدة');
  };

  // Calculate EOS
  const [eosError, setEosError] = useState<string | null>(null);
  const handleCalculateEOS = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/saudi/eos-calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eosForm)
      });
      const data = await res.json();
      // ردّ خطأ ليس نتيجة: تجرّد الشاشة من بياناتها.
      if (!res.ok || !data || typeof data.total_salary !== 'number') {
        setEosError((data && (data.error || data.message)) || 'تعذّر احتساب مكافأة نهاية الخدمة');
        setEosResult(null);
        return;
      }
      setEosError(null);
      setEosResult(data);
    } catch (err) {
      console.error(err);
      setEosError('تعذّر الاتصال بالخادم أثناء الاحتساب');
    }
  };

  // Populate EOS from selected employee
  const handleSelectEosEmployee = (empId: number) => {
    const emp = documents.find(d => d.id === empId);
    if (emp) {
      setEosForm({
        ...eosForm,
        employee_id: emp.id,
        employee_name: emp.name,
        national_id_iqama: emp.national_id_iqama || '',
        basic_salary: emp.basic_salary,
        allowances: (emp.housing_allowance || 0) + (emp.transport_allowance || 0),
      });
    }
  };

  // Filtered documents
  const filteredDocs = documents.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (emp.national_id_iqama && emp.national_id_iqama.includes(searchTerm)) ||
                          (emp.iqama_profession && emp.iqama_profession.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (filterStatus === 'expired') {
      return emp.iqamaStatus === 'expired' || emp.workPermitStatus === 'expired' || emp.medicalStatus === 'expired';
    } else if (filterStatus === 'warning_30') {
      return emp.iqamaStatus === 'warning_30' || emp.workPermitStatus === 'warning' || emp.medicalStatus === 'warning';
    } else if (filterStatus === 'warning_60') {
      return emp.iqamaStatus === 'warning_60';
    } else if (filterStatus === 'warning_90') {
      return emp.iqamaStatus === 'warning_90';
    } else if (filterStatus === 'saudi') {
      return emp.is_saudi === 1;
    } else if (filterStatus === 'expat') {
      return emp.is_saudi === 0;
    }
    return true;
  });

  // Export GOSI CSV
  const exportGosiCsv = () => {
    const headers = ['رقم المشترك', 'اسم الموظف', 'الهوية / الإقامة', 'الجنسية', 'الأساسي', 'بدل السكن', 'أجر الاشتراك', 'حصة الموظف', 'حصة المنشأة', 'إجمالي التأمينات'];
    const rows = gosiRecords.map(r => [
      r.gosi_number,
      `"${r.name}"`,
      r.national_id_iqama,
      r.nationality,
      r.basic_salary,
      r.housing_allowance,
      r.contributory_salary,
      r.emp_share,
      r.comp_share,
      r.total_gosi_due
    ]);
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `GOSI_Statement_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 font-sans pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-800 p-6 md:p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-emerald-600/60 backdrop-blur-md rounded-full text-xs font-bold border border-emerald-400/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-200" />
              نظام العمل واللوائح السعودية المعتمدة
            </span>
            <span className="px-3 py-1 bg-amber-500/30 text-amber-200 rounded-full text-xs font-bold border border-amber-400/20">
              منصة قوى • مدد • التأمينات • الضمان الصحي
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">إدارة الإقامات ورخص العمل والتأمينات والتأمين الطبي</h1>
          <p className="text-emerald-100/90 text-sm mt-1 max-w-2xl">
            متابعة شاملة للامتثال التنظيمي في المملكة العربية السعودية، توثيق الإقامات ورخص العمل، واشتراكات التأمينات GOSI، والتأمين الطبي، وحماية الأجور WPS، ونطاقات.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <button 
            onClick={fetchAllData}
            className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-white border border-white/20 transition-all flex items-center gap-2 font-bold text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </button>
          
          <button
            onClick={exportSifFile}
            disabled={exportingSif || !wpsValueDate}
            className="px-5 py-3 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 rounded-2xl font-black text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{exportingSif ? 'جارٍ التوليد...' : 'تصدير ملف الحوالات (WPS)'}</span>
          </button>
        </div>

        {/* Decorative background vectors */}
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl overflow-x-auto scrollbar-none border border-slate-200/60 shadow-inner">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>لوحة الامتثال والتوطين</span>
        </button>

        <button
          onClick={() => setActiveTab('iqama')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'iqama'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>الإقامات ورخص العمل</span>
          {(summary?.expiredIqamas || 0) + (summary?.iqamasExpiring30Days || 0) > 0 && (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">
              {(summary?.expiredIqamas || 0) + (summary?.iqamasExpiring30Days || 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('visas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'visas'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Plane className="w-4 h-4 text-brand-600" />
          <span>التأشيرات ومقيم</span>
        </button>

        <button
          onClick={() => setActiveTab('gosi')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'gosi'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>التأمينات (GOSI)</span>
        </button>

        <button
          onClick={() => setActiveTab('medical')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'medical'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>التأمين الطبي (CCHI)</span>
        </button>

        <button
          onClick={() => setActiveTab('eos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'eos'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>مكافأة نهاية الخدمة</span>
        </button>

        <button
          onClick={() => setActiveTab('provisions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'provisions'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span>المخصصات المحاسبية (IAS 19)</span>
        </button>

        <button
          onClick={() => setActiveTab('cost_employment')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'cost_employment'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-purple-600" />
          <span>التكلفة الشاملة (TCOE)</span>
        </button>

        <button
          onClick={() => setActiveTab('overtime')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'overtime'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-600" />
          <span>العمل الإضافي ورمضان</span>
        </button>

        <button
          onClick={() => setActiveTab('wps')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'wps'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>حماية الأجور (مدد)</span>
        </button>

        <button
          onClick={() => setActiveTab('ai_consultant')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${
            activeTab === 'ai_consultant'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
              : 'text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>المستشار القانوني الذكي</span>
        </button>

        <button
          onClick={() => setActiveTab('renewals')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'renewals'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>سجل التجديدات وسداد</span>
        </button>
      </div>

      {/* Tab 1: Overview & Saudization */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Saudization Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-3">
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
                  <UserCheck className="w-6 h-6" />
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-black ${
                  summary?.nitaqatStatus === 'platinum' ? 'bg-brand-100 text-brand-700' :
                  summary?.nitaqatStatus === 'high_green' ? 'bg-emerald-100 text-emerald-700' :
                  summary?.nitaqatStatus === 'mid_green' ? 'bg-teal-100 text-teal-700' :
                  summary?.nitaqatStatus === 'low_green' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {summary?.nitaqatLabel || 'نطاق أخضر'}
                </span>
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">نسبة التوطين (نطاقات)</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-slate-800">{summary?.saudizationRate || 0}%</span>
                <span className="text-xs text-slate-500 font-semibold">({summary?.saudiEmployees || 0} من {summary?.totalEmployees || 0} موظف)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, summary?.saudizationRate || 0)}%` }}
                />
              </div>
            </div>

            {/* Iqama Alerts */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <CreditCard className="w-6 h-6" />
                </div>
                {(summary?.expiredIqamas || 0) > 0 && (
                  <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-black">
                    {summary?.expiredIqamas} منتهية!
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">تنبيهات الإقامات والرخص</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-slate-800">
                  {(summary?.expiredIqamas || 0) + (summary?.iqamasExpiring30Days || 0) + (summary?.iqamasExpiring60Days || 0)}
                </span>
                <span className="text-xs text-slate-500 font-semibold">تحتاج متابعة وتجديد</span>
              </div>
              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                {summary?.iqamasExpiring30Days || 0} تنتهي خلال 30 يوماً
              </p>
            </div>

            {/* Medical Insurance */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
                  <FileCheck className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-1 bg-teal-100 text-teal-800 rounded-full text-xs font-black">
                  مجلس الضمان CCHI
                </span>
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">التأمين الطبي المعتمد</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-slate-800">{documents.filter(d => d.medical_insurance_policy).length}</span>
                <span className="text-xs text-slate-500 font-semibold">وثيقة مفعلة</span>
              </div>
              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1 font-medium">
                <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
                {summary?.medicalExpiring30Days || 0} وثيقة تنتهي خلال 30 يوم
              </p>
            </div>

            {/* Monthly GOSI Total */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-1 bg-brand-100 text-brand-800 rounded-full text-xs font-black">
                  فاتورة التأمينات
                </span>
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">مطالبة GOSI الشهرية</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-black text-slate-800">{summary?.monthlyGosiGrandTotal?.toLocaleString() || 0}</span>
                <span className="text-xs font-bold text-slate-500">ر.س</span>
              </div>
              <p className="text-xs text-slate-400 mt-3 font-medium">
                حصة المنشأة: {summary?.monthlyGosiTotalEmployer?.toLocaleString()} ر.س
              </p>
            </div>
          </div>

          {/* Quick Alert Banner if any Iqamas are expiring soon */}
          {(summary?.expiredIqamas || 0) + (summary?.iqamasExpiring30Days || 0) > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-transparent p-5 rounded-3xl border border-amber-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500 text-white rounded-2xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base">تنبيه نظامي: إقامات ورخص عمل بحاجة للتجديد الفوري</h3>
                  <p className="text-slate-600 text-xs mt-0.5">
                    يوجد {summary?.expiredIqamas} إقامة منتهية و {summary?.iqamasExpiring30Days} إقامة تنتهي خلال 30 يوم لتفادي الغرامات المالية ونقل الخدمات.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setActiveTab('iqama'); setFilterStatus('warning_30'); }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-xs transition-all flex items-center gap-2 whitespace-nowrap shadow-sm"
              >
                <span>معالجة وتجديد الإقامات الآن</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick Action Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800">حاسبة تكاليف الإقامة ورخص العمل</h3>
                  <p className="text-xs text-slate-500">رسوم المقابل المالي والجوازات</p>
                </div>
              </div>
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">المقابل المالي لرخصة العمل (سنوي):</span>
                  <span className="font-black text-slate-800 font-mono">9,600 ر.س</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">رسوم تجديد الجوازات والإقامة:</span>
                  <span className="font-black text-slate-800 font-mono">650 ر.س</span>
                </div>
                <div className="flex justify-between py-1.5 font-bold text-emerald-800">
                  <span>إجمالي باقة التجديد السنوية للوافد:</span>
                  <span className="font-black font-mono">10,250 ر.س</span>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('iqama')}
                className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-brand-700 font-black rounded-2xl text-xs transition-all text-center block"
              >
                استعراض ومتابعة الإقامات
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-brand-50 text-brand-700 rounded-2xl">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800">قواعد التأمينات الاجتماعية (GOSI)</h3>
                  <p className="text-xs text-slate-500">نسب الاشتراكات المعتمدة نظاماً</p>
                </div>
              </div>
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">الموظف السعودي (معاشات + ساند):</span>
                  <span className="font-black text-brand-700 font-mono">9.75%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">صاحب العمل للسعودي (معاشات + أخطار + ساند):</span>
                  <span className="font-black text-brand-700 font-mono">11.75%</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="font-bold">صاحب العمل لغير السعودي (أخطار مهنية):</span>
                  <span className="font-black text-brand-700 font-mono">2.00%</span>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('gosi')}
                className="w-full py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-black rounded-2xl text-xs transition-all text-center block"
              >
                استعراض كشف التأمينات الشهري
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-50 text-teal-700 rounded-2xl">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800">حماية الأجور ومنصة مدد</h3>
                  <p className="text-xs text-slate-500">الربط البنكي والتصدير القياسي</p>
                </div>
              </div>
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">صيغة الملف:</span>
                  <span className="font-black text-slate-800 font-mono">SCR / EDR (قالب داخلي)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">رقم السجل التجاري:</span>
                  <span className="font-bold text-slate-800">{bankProfile?.crNumber || 'غير مُعرَّف في الإعدادات'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="font-bold">كود بنك التسوية:</span>
                  <span className="font-bold text-slate-800">{bankProfile?.settlementBankCode || 'غير مُعرَّف في الإعدادات'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="font-bold">حالة تصدير ملف البنك:</span>
                  {exportReady ? (
                    <span className="text-emerald-600 font-black flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      جاهز للتوليد
                    </span>
                  ) : (
                    <span className="text-amber-700 font-black flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      محجوب — {exportBlockers.length} مانع
                    </span>
                  )}
                </div>
              </div>
              {exportBlockers.length > 0 && (
                <ul className="space-y-1 text-xs text-amber-800">
                  {exportBlockers.map(blocker => (
                    <li key={blocker}>• {blocker}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500">
                الصيغة قالب داخلي غير معتمد من البنك، وتُراجع مواصفته لدى البنك قبل الرفع.
              </p>
              <button 
                onClick={() => setActiveTab('wps')}
                className="w-full py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-black rounded-2xl text-xs transition-all text-center block"
              >
                توليد ملف الرواتب والتحميل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Iqama & Work Permits */}
      {activeTab === 'iqama' && (
        <div className="space-y-6">
          {/* Controls & Filter Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="بحث باسم الموظف أو رقم الإقامة أو المهنة..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="all">جميع الموظفين</option>
                  <option value="expat">الموظفين الوافدين فقط</option>
                  <option value="saudi">المواطنين السعوديين</option>
                  <option value="warning_30">تنتهي خلال 30 يوماً</option>
                  <option value="warning_60">تنتهي خلال 60 يوماً</option>
                  <option value="warning_90">تنتهي خلال 90 يوماً</option>
                  <option value="expired">الإقامات المنتهية</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span>إجمالي الموظفين في الجدول: {filteredDocs.length}</span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 text-xs font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="p-4">الموظف / الجنسية</th>
                    <th className="p-4">رقم الهوية / الإقامة</th>
                    <th className="p-4">المهنة في الإقامة (قوى)</th>
                    <th className="p-4">تاريخ انتهاء الإقامة</th>
                    <th className="p-4">الأيام المتبقية</th>
                    <th className="p-4">رخصة العمل</th>
                    <th className="p-4">التأمين الطبي</th>
                    <th className="p-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocs.map(emp => {
                    const isExpat = emp.is_saudi === 0;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                              emp.is_saudi === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800">{emp.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  emp.is_saudi === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'
                                }`}>
                                  {emp.nationality || (emp.is_saudi === 1 ? 'سعودي' : 'وافد')}
                                </span>
                                <span className="text-xs text-slate-400">{emp.department_name}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="p-4 font-mono font-bold text-slate-700">
                          <div>{emp.national_id_iqama || 'N/A'}</div>
                          {emp.border_number && (
                            <span className="text-[10px] text-slate-400 block">رقم الحدود: {emp.border_number}</span>
                          )}
                        </td>

                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                            {emp.iqama_profession || emp.position}
                          </span>
                        </td>

                        <td className="p-4">
                          {isExpat ? (
                            <div>
                              <p className="font-mono font-bold text-slate-700">{emp.iqama_expiry_gregorian || 'غير محدد'}</p>
                              {emp.iqama_expiry_hijri && (
                                <p className="text-[11px] text-slate-400">{emp.iqama_expiry_hijri} هـ</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-700 font-bold text-xs">مواطن سعودي</span>
                          )}
                        </td>

                        <td className="p-4">
                          {isExpat ? (
                            emp.iqamaStatus === 'expired' ? (
                              <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                منتهية ({Math.abs(emp.iqamaDaysRemaining || 0)} يوم)
                              </span>
                            ) : emp.iqamaStatus === 'warning_30' ? (
                              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                                <Clock className="w-3.5 h-3.5" />
                                تنتهي خلال {emp.iqamaDaysRemaining} يوم
                              </span>
                            ) : emp.iqamaStatus === 'warning_60' ? (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold w-fit">
                                {emp.iqamaDaysRemaining} يوم
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
                                <Check className="w-3 h-3" />
                                سارية ({emp.iqamaDaysRemaining} يوم)
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-xs">سارية المفعول</span>
                          )}
                        </td>

                        <td className="p-4">
                          {isExpat ? (
                            <div>
                              <p className="font-mono text-xs font-bold text-slate-700">{emp.work_permit_number || 'WP-قوى'}</p>
                              <span className="text-[10px] text-slate-400">{emp.work_permit_expiry || emp.iqama_expiry_gregorian}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">لا ينطبق</span>
                          )}
                        </td>

                        <td className="p-4">
                          <div>
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs font-bold">
                              {emp.medical_insurance_category || 'Class A'}
                            </span>
                            <p className="text-[11px] text-slate-500 mt-0.5">{emp.insurance_company || 'التعاونية'}</p>
                          </div>
                        </td>

                        <td className="p-4 text-center">
                          {isExpat ? (
                            <button
                              onClick={() => openRenewModal(emp, 'iqama')}
                              className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 mx-auto"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>تجديد فوري</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => openRenewModal(emp, 'medical_insurance')}
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all mx-auto"
                            >
                              تحديث التأمين
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: GOSI Social Insurance */}
      {activeTab === 'gosi' && (
        <div className="space-y-6">
          {/* Top Summary Banner */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h2 className="text-xl font-black text-slate-800">كشف اشتراكات التأمينات الاجتماعية (GOSI)</h2>
              <p className="text-slate-500 text-sm mt-1">
                توزيع اشتراكات فرع المعاشات، ساند (Saned)، والأخطار المهنية وفق الوعاء التأميني (الأساسي + بدل السكن)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={exportGosiCsv}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black text-xs transition-all flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>تصدير كشف GOSI (Excel/CSV)</span>
              </button>
            </div>
          </div>

          {/* GOSI Table */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 text-xs font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="p-4">الموظف / الجنسية</th>
                    <th className="p-4">رقم المشترك GOSI</th>
                    <th className="p-4">الأساسي</th>
                    <th className="p-4">بدل السكن</th>
                    <th className="p-4 font-black text-brand-900">أجر الاشتراك التأميني</th>
                    <th className="p-4 text-emerald-700">حصة الموظف</th>
                    <th className="p-4 text-brand-700">حصة المنشأة</th>
                    <th className="p-4 text-slate-800 font-black">إجمالي المستحق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gosiRecords.map(rec => (
                    <tr key={rec.employee_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${rec.is_saudi === 1 ? 'bg-emerald-500' : 'bg-brand-500'}`} />
                          <div>
                            <p className="font-bold text-slate-800">{rec.name}</p>
                            <span className="text-[11px] text-slate-400">{rec.nationality} • {rec.department_name}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 font-mono font-bold text-slate-700">{rec.gosi_number}</td>
                      <td className="p-4 font-mono font-bold text-slate-600">{rec.basic_salary.toLocaleString()} ر.س</td>
                      <td className="p-4 font-mono font-bold text-slate-600">{rec.housing_allowance.toLocaleString()} ر.س</td>
                      
                      <td className="p-4 font-mono font-black text-brand-900 bg-brand-50/30">
                        {rec.contributory_salary.toLocaleString()} ر.س
                      </td>

                      <td className="p-4 font-mono font-bold text-emerald-700">
                        {rec.is_saudi === 1 ? (
                          <div>
                            <span>{rec.emp_share.toLocaleString()} ر.س</span>
                            <span className="text-[10px] text-slate-400 block">(9% معاشات + 0.75% ساند)</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">0.00 ر.س (0%)</span>
                        )}
                      </td>

                      <td className="p-4 font-mono font-bold text-brand-700">
                        <div>
                          <span>{rec.comp_share.toLocaleString()} ر.س</span>
                          <span className="text-[10px] text-slate-400 block">
                            {rec.is_saudi === 1 ? '(11.75% معاشات وأخطار وساند)' : '(2% أخطار مهنية)'}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 font-mono font-black text-slate-900">
                        {rec.total_gosi_due.toLocaleString()} ر.س
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black text-slate-800 border-t border-slate-200">
                    <td colSpan={4} className="p-4 text-left">إجمالي الفاتورة الشهرية لمؤسسة التأمينات الاجتماعية:</td>
                    <td className="p-4 font-mono font-black text-brand-900">
                      {gosiRecords.reduce((sum, r) => sum + r.contributory_salary, 0).toLocaleString()} ر.س
                    </td>
                    <td className="p-4 font-mono text-emerald-700">
                      {gosiRecords.reduce((sum, r) => sum + r.emp_share, 0).toLocaleString()} ر.س
                    </td>
                    <td className="p-4 font-mono text-brand-700">
                      {gosiRecords.reduce((sum, r) => sum + r.comp_share, 0).toLocaleString()} ر.س
                    </td>
                    <td className="p-4 font-mono text-slate-900 text-base">
                      {gosiRecords.reduce((sum, r) => sum + r.total_gosi_due, 0).toLocaleString()} ر.س
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Medical Insurance */}
      {activeTab === 'medical' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-800">إدارة التأمين الطبي ومجلس الضمان الصحي (CCHI)</h2>
              <p className="text-slate-500 text-sm mt-1">متابعة وثائق التأمين التعاوني للموظفين والتابعين وفئات التغطية الصحية</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {documents.map(emp => (
              <div key={emp.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 hover:border-emerald-200 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{emp.name}</h3>
                    <p className="text-xs text-slate-400">{emp.department_name} • {emp.position}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${
                    emp.medical_insurance_category === 'VIP' ? 'bg-purple-100 text-purple-700' :
                    emp.medical_insurance_category === 'Class A' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-brand-100 text-brand-700'
                  }`}>
                    {emp.medical_insurance_category || 'Class A'}
                  </span>
                </div>

                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">شركة التأمين:</span>
                    <span className="font-black text-slate-800">{emp.insurance_company || 'التعاونية للتأمين'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">رقم الوثيقة:</span>
                    <span className="font-mono font-bold text-slate-700">{emp.medical_insurance_policy || 'CCHI-POL-9921'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">تاريخ الانتهاء:</span>
                    <span className="font-mono font-bold text-slate-700">{emp.medical_insurance_expiry || '2027-04-30'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">التابعين المشمولين:</span>
                    <span className="font-black text-emerald-700">{emp.medical_dependents_count || 0} أفراد</span>
                  </div>
                </div>

                <button
                  onClick={() => openRenewModal(emp, 'medical_insurance')}
                  className="w-full py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-black rounded-2xl text-xs transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تجديد وثيقة التأمين الطبي</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: End of Service Calculator */}
      {activeTab === 'eos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Calculator Input Form */}
            <div className="lg:col-span-6 bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800">حاسبة مكافأة نهاية الخدمة المعتمدة</h2>
                    <p className="text-slate-500 text-xs">احتساب دقيق وفق المادتين 84 و 85 من نظام العمل السعودي</p>
                  </div>
                </div>
              </div>

              {/* Select Existing Employee */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">اختيار موظف موجود لتعبئة البيانات تلقائياً</label>
                <select
                  onChange={e => handleSelectEosEmployee(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={0}>-- اختيار موظف --</option>
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.position})</option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleCalculateEOS} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">اسم الموظف</label>
                  <input
                    type="text"
                    value={eosForm.employee_name}
                    onChange={e => setEosForm({ ...eosForm, employee_name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ بداية العقد</label>
                    <input
                      type="date"
                      value={eosForm.start_date}
                      onChange={e => setEosForm({ ...eosForm, start_date: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ نهاية الخدمة</label>
                    <input
                      type="date"
                      value={eosForm.end_date}
                      onChange={e => setEosForm({ ...eosForm, end_date: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">الراتب الأساسي (ر.س)</label>
                    <input
                      type="number"
                      value={eosForm.basic_salary}
                      onChange={e => setEosForm({ ...eosForm, basic_salary: Number(e.target.value) })}
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">إجمالي البدلات الثابتة (ر.س)</label>
                    <input
                      type="number"
                      value={eosForm.allowances}
                      onChange={e => setEosForm({ ...eosForm, allowances: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">سبب إنهاء العلاقة العقدية</label>
                  <select
                    value={eosForm.reason}
                    onChange={e => setEosForm({ ...eosForm, reason: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none"
                  >
                    <option value="employer_termination">إنهاء العقد من صاحب العمل (المادة 84 - استحقاق 100%)</option>
                    <option value="resignation">استقالة الموظف (المادة 85 - استحقاق متدرج حسب السنوات)</option>
                    <option value="contract_expiry">انتهاء مدة العقد محدد المدة (استحقاق 100%)</option>
                    <option value="mutual_agreement">اتفاق الطرفين على إنهاء العقد (استحقاق 100%)</option>
                    <option value="force_majeure">قوة قاهرة / ترك العمل لعذر مشروع بالمادة 87 (استحقاق 100%)</option>
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">تعويض الإجازات</label>
                    <input
                      type="number"
                      value={eosForm.leave_balance_compensation}
                      onChange={e => setEosForm({ ...eosForm, leave_balance_compensation: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">مستحقات أخرى</label>
                    <input
                      type="number"
                      value={eosForm.other_entitlements}
                      onChange={e => setEosForm({ ...eosForm, other_entitlements: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">استقطاعات / سلف</label>
                    <input
                      type="number"
                      value={eosForm.deductions}
                      onChange={e => setEosForm({ ...eosForm, deductions: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black text-sm shadow-md transition-all mt-4"
                >
                  احتساب مكافأة نهاية الخدمة وتوليد المسير
                </button>
              </form>
            </div>

            {/* Results Display */}
            <div className="lg:col-span-6 space-y-6">
              {eosResult ? (
                <div className="print-document bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
                  <Letterhead company={company} />

                  <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div>
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                        نتيجة التصفية والمكافأة
                      </span>
                      <h3 className="text-xl font-black text-slate-800 mt-2">{eosResult.employee_name}</h3>
                    </div>
                    <button
                      onClick={() => window.print()}
                      className="no-print p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" />
                      <span>طباعة السند</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl">
                      <p className="text-xs text-slate-400 font-bold">مدة الخدمة الإجمالية</p>
                      <p className="text-base font-black text-slate-800 mt-1">
                        {eosResult.years} سنة و {eosResult.months} شهر و {eosResult.days} يوم
                      </p>
                      <span className="text-[11px] text-slate-500 font-mono">({eosResult.total_service_years} سنة)</span>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl">
                      <p className="text-xs text-slate-400 font-bold">الأجر الفعلي المعتمد</p>
                      <p className="text-base font-black text-slate-800 mt-1 font-mono">
                        {eosResult.total_salary.toLocaleString()} ر.س
                      </p>
                      <span className="text-[11px] text-slate-500">الأساسي + البدلات</span>
                    </div>
                  </div>

                  <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 space-y-2 text-xs">
                    <p className="font-bold text-emerald-900">سند الاحتساب النظامي:</p>
                    <p className="text-emerald-800">{eosResult.reason_text}</p>
                    <div className="flex justify-between pt-2 border-t border-emerald-200/60 font-bold">
                      <span>نسبة الاستحقاق من المكافأة:</span>
                      <span className="font-black font-mono">{eosResult.entitlement_percentage}%</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-sm py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-bold">المكافأة الأساسية (المادة 84):</span>
                      <span className="font-mono font-bold text-slate-800">{eosResult.base_gratuity.toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-bold">المكافأة المستحقة بعد تطبيق المادة 85:</span>
                      <span className="font-mono font-bold text-emerald-700">{eosResult.final_amount.toLocaleString()} ر.س</span>
                    </div>
                    {eosResult.leave_balance_compensation > 0 && (
                      <div className="flex justify-between text-sm py-1 border-b border-slate-100">
                        <span className="text-slate-500 font-bold">تعويض رصيد الإجازات:</span>
                        <span className="font-mono font-bold text-slate-800">+{eosResult.leave_balance_compensation.toLocaleString()} ر.س</span>
                      </div>
                    )}
                    {eosResult.deductions > 0 && (
                      <div className="flex justify-between text-sm py-1 border-b border-slate-100 text-rose-600">
                        <span className="font-bold">استقطاعات وسلف:</span>
                        <span className="font-mono font-bold">-{eosResult.deductions.toLocaleString()} ر.س</span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline p-4 bg-slate-900 text-white rounded-2xl mt-4">
                      <div>
                        <p className="text-xs text-emerald-300 font-bold">صافي المبلغ المستحق للصرف النهائي</p>
                        <span className="text-xs text-slate-400">شيك مصدق / تحويل بنكي</span>
                      </div>
                      <div className="text-2xl font-black font-mono text-emerald-400">
                        {eosResult.net_payable.toLocaleString()} ر.س
                      </div>
                    </div>
                  </div>

                  <DocumentFooter company={company} />
                </div>
              ) : eosError ? (
                <div className="bg-rose-50 p-10 rounded-3xl border border-rose-200 text-center space-y-2">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                  <h3 className="font-black text-rose-800 text-base">تعذّر إتمام الاحتساب</h3>
                  <p className="text-rose-700 text-xs">{eosError}</p>
                </div>
              ) : (
                <div className="bg-slate-50 p-12 rounded-3xl border border-dashed border-slate-200 text-center space-y-3">
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto text-slate-400 shadow-sm">
                    <Calculator className="w-7 h-7" />
                  </div>
                  <h3 className="font-black text-slate-700 text-base">جاهز للاحتساب النظامي</h3>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto">
                    قم بإدخال بيانات الموظف والتواريخ والأجر في النموذج على اليمين للقيام باحتساب مكافأة نهاية الخدمة بدقة وسرعة.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Wages Protection System (WPS / Mudad) */}
      {activeTab === 'wps' && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
              <div className="p-4 bg-teal-50 text-teal-700 rounded-3xl">
                <Building className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">نظام حماية الأجور السعودي (منصة مدد WPS)</h2>
                <p className="text-slate-500 text-sm mt-1">
                  توليد ملف الحوالات البنكية بصيغة SCR/EDR — قالب داخلي غير معتمد من البنك، تُراجع مواصفته لدى البنك قبل الرفع.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-base font-black text-slate-800">تحديد فترة مسير الرواتب</h3>
                
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">الشهر</label>
                    <select
                      value={wpsMonth}
                      onChange={e => setWpsMonth(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl font-bold text-slate-800 outline-none"
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i+1} value={i+1}>شهر {i+1}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">السنة</label>
                    <select
                      value={wpsYear}
                      onChange={e => setWpsYear(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl font-bold text-slate-800 outline-none"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="wps-value-date" className="block text-xs font-bold text-slate-500 mb-1">
                    تاريخ القيمة (تاريخ صرف الحوالات) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="wps-value-date"
                    type="date"
                    value={wpsValueDate}
                    onChange={e => setWpsValueDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl font-bold text-slate-800 outline-none"
                  />
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl space-y-3 text-xs text-slate-600 border border-slate-100">
                  <div className="flex justify-between">
                    <span className="font-bold">السجل التجاري (CR):</span>
                    <span className="font-mono font-bold text-slate-800">
                      {bankProfile?.crNumber || 'غير مُعرَّف في الإعدادات'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">كود بنك التسوية:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {bankProfile?.settlementBankCode || 'غير مُعرَّف في الإعدادات'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">صيغة الملف:</span>
                    <span className="font-mono font-bold text-emerald-700">SCR / EDR (قالب داخلي)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">بنوك مرتبطة بكود:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {bankProfile?.mappedBanks?.length ? bankProfile.mappedBanks.join('، ') : 'لا يوجد'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={exportSifFile}
                  disabled={exportingSif || !wpsValueDate}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{exportingSif ? 'جارٍ التوليد...' : 'تحميل ملف الحوالات (WPS SIF)'}</span>
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-black text-slate-800">خطوات رفع الملف على منصة مدد</h3>
                <div className="space-y-3 text-xs text-slate-600">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">1</span>
                    <p className="mt-0.5">قم بإنشاء مسير الرواتب للشهر من تبويب مسير الرواتب والتأكد من اعتماد البدلات.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">2</span>
                    <p className="mt-0.5">اضغط على زر تحميل الملف أعلاه ليتم تنزيل ملف بامتداد (.sif) بصيغة SCR/EDR.</p>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">3</span>
                    <p className="mt-0.5">سجل الدخول إلى حساب المنشأة في منصة (مدد) أو الخدمات المصرفية للشركات وقم برفع الملف مباشرة.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Renewals History & Sadad */}
      {activeTab === 'renewals' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h2 className="text-xl font-black text-slate-800 mb-1">سجل التجديدات والمعاملات الحكومية</h2>
            <p className="text-slate-500 text-sm">أرشيف موثق لجميع عمليات تجديد الإقامات ورخص العمل والتأمين الطبي وأرقام سداد</p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 text-xs font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="p-4">الموظف</th>
                    <th className="p-4">نوع المعاملة</th>
                    <th className="p-4">المدة</th>
                    <th className="p-4">التكلفة الإجمالية</th>
                    <th className="p-4">رقم فاتورة سداد</th>
                    <th className="p-4">تاريخ الانتهاء الجديد</th>
                    <th className="p-4">حالة المعاملة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {renewals.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 font-bold text-slate-800">{r.employee_name || 'موظف'}</td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                          {r.type === 'iqama' ? 'تجديد إقامة ورخصة عمل' : r.type === 'medical_insurance' ? 'تجديد تأمين طبي' : r.type}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-600">{r.duration_months} شهر</td>
                      <td className="p-4 font-mono font-black text-emerald-700">{r.cost.toLocaleString()} ر.س</td>
                      <td className="p-4 font-mono text-xs text-slate-600">{r.sadad_number || 'SADAD-101'}</td>
                      <td className="p-4 font-mono text-xs text-slate-700">{r.expiry_after || 'ساري'}</td>
                      <td className="p-4">
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3.5 h-3.5" />
                          مكتمل بنجاح
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Visas & Muqeem */}
      {activeTab === 'visas' && <VisasMuqeemView />}

      {/* Tab: Accounting Provisions IAS 19 */}
      {activeTab === 'provisions' && <AccountingProvisionsView />}

      {/* Tab: Total Cost of Employment */}
      {activeTab === 'cost_employment' && <TotalCostEmploymentView />}

      {/* Tab: Overtime & Ramadan Policy */}
      {activeTab === 'overtime' && <OvertimeRamadanView />}

      {/* Tab: AI Saudi Labor Law Consultant */}
      {activeTab === 'ai_consultant' && <LaborLawAiConsultantView />}

      {/* Quick Renewal Modal */}
      {selectedEmpForRenew && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    {renewalType === 'iqama' ? 'تجديد الإقامة ورخصة العمل' : 'تجديد التأمين الطبي'}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedEmpForRenew.name} ({selectedEmpForRenew.national_id_iqama})</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEmpForRenew(null)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickRenewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">مدة التجديد</label>
                <select
                  value={renewalMonths}
                  onChange={e => {
                    const months = Number(e.target.value);
                    setRenewalMonths(months);
                    if (renewalType === 'iqama') {
                      setRenewalCost(months === 3 ? 2562 : months === 6 ? 5125 : months === 12 ? 10250 : 20500);
                    } else {
                      setRenewalCost(months === 12 ? 2500 : 5000);
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none"
                >
                  <option value={3}>3 أشهر (تجديد ربع سنوي)</option>
                  <option value={6}>6 أشهر (تجديد نصف سنوي)</option>
                  <option value={12}>12 شهراً (سنة كاملة - افتراضي)</option>
                  <option value={24}>24 شهراً (سنتان)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">التكلفة الإجمالية المحتسبة (ر.س)</label>
                <input
                  type="number"
                  value={renewalCost}
                  onChange={e => setRenewalCost(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-mono font-black text-emerald-700 outline-none"
                />
                {renewalType === 'iqama' && (
                  <p className="text-[11px] text-slate-400 mt-1">تشمل 9,600 ر.س رخصة العمل والمقابل المالي + 650 ر.س الجوازات</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">رقم فاتورة سداد المرجعي</label>
                <input
                  type="text"
                  value={renewalSadad}
                  onChange={e => setRenewalSadad(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-mono font-bold text-slate-800 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات المعاملة</label>
                <textarea
                  value={renewalNotes}
                  onChange={e => setRenewalNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-medium text-slate-800 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isSubmittingRenew}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {isSubmittingRenew ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>تأكيد التجديد وتحديث البيانات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEmpForRenew(null)}
                  className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
