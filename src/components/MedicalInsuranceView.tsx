import { useState, useEffect, FormEvent } from 'react';
import { 
  ShieldCheck, Plus, Users, HeartPulse, AlertCircle, 
  Calendar, CheckCircle2, Trash2, Clock, Building2,
  DollarSign, FileText, UserPlus, X, RefreshCw, Sparkles
} from 'lucide-react';
import type { MedicalDependent, MedicalPolicy } from '../types';

export default function MedicalInsuranceView() {
  const [summary, setSummary] = useState<any>(null);
  const [dependents, setDependents] = useState<MedicalDependent[]>([]);
  const [policies, setPolicies] = useState<MedicalPolicy[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'dependents' | 'policies' | 'endorsements'>('summary');
  
  // Modal states
  const [showAddDepModal, setShowAddDepModal] = useState(false);
  const [showAddPolicyModal, setShowAddPolicyModal] = useState(false);
  const [depForm, setDepForm] = useState({
    employee_id: '',
    name: '',
    relationship: 'spouse',
    national_id_iqama: '',
    birth_date: '',
    gender: 'female',
    category: 'Class A',
    annual_premium: 2500
  });

  const [policyForm, setPolicyForm] = useState({
    policy_number: '',
    insurance_company: 'التعاونية للتأمين',
    start_date: new Date().toISOString().split('T')[0],
    expiry_date: '2027-02-28',
    total_members: 25,
    total_premium: 65000,
    cchi_approval_number: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, depRes, polRes, empRes] = await Promise.all([
        fetch('/api/medical/summary'),
        fetch('/api/medical/dependents'),
        fetch('/api/medical/policies'),
        fetch('/api/employees')
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (depRes.ok) setDependents(await depRes.json());
      if (polRes.ok) setPolicies(await polRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (err) {
      console.error('Error fetching medical data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddDependent = async (e: FormEvent) => {
    e.preventDefault();
    if (!depForm.employee_id || !depForm.name) return;

    try {
      const res = await fetch('/api/medical/dependents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depForm)
      });
      if (res.ok) {
        setShowAddDepModal(false);
        setDepForm({
          employee_id: '',
          name: '',
          relationship: 'spouse',
          national_id_iqama: '',
          birth_date: '',
          gender: 'female',
          category: 'Class A',
          annual_premium: 2500
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDependent = async (id: number) => {
    if (!confirm('هل أنت متأكد من إلغاء وحذف هذا التابع من وثيقة التأمين الطبي؟')) return;
    try {
      const res = await fetch(`/api/medical/dependents/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPolicy = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/medical/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policyForm)
      });
      if (res.ok) {
        setShowAddPolicyModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getRelationshipLabel = (rel: string) => {
    switch (rel) {
      case 'spouse': return 'زوج / زوجة';
      case 'son': return 'ابن';
      case 'daughter': return 'ابنة';
      case 'parent': return 'والد / والدة';
      default: return rel;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <HeartPulse className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              إدارة التأمين الطبي ومجلس الضمان الصحي (CCHI)
              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
                نظام التأمين الإلزامي المعتمد
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              متابعة وثائق التأمين الطبي، إدارة التابعين والعائلات، وتدقيق الامتثال لمعايير الضمان الصحي والتسويات (Pro-rata).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddDepModal(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm shadow-emerald-200"
          >
            <UserPlus className="w-4 h-4" />
            إضافة تابع / عائلة
          </button>
          <button
            onClick={() => setShowAddPolicyModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            إضافة وثيقة تأمين
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">إجمالي المؤمن عليهم</span>
              <Users className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{summary.totalMembers} مستفيد</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>الموظفين: {summary.insuredEmployeesCount}</span>
              <span>•</span>
              <span>التابعون: {summary.dependentsCount}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">إجمالي قسط التأمين السنوي</span>
              <DollarSign className="w-5 h-5 text-brand-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{summary.totalAnnualPremium?.toLocaleString()} ر.س</div>
            <div className="text-xs text-slate-400 mt-1">
              المعدل الشهري: {summary.monthlyAveragePremium?.toLocaleString()} ر.س / شهر
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">الوثائق النشطة</span>
              <ShieldCheck className="w-5 h-5 text-teal-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{policies.length} وثيقة معتمدة</div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              متوافقة مع مجلس الضمان الصحي (CCHI)
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">تنبيهات التجديد (60 يوم)</span>
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{summary.upcomingExpiringPolicies?.length || 0} وثائق</div>
            <div className="text-xs text-amber-600 mt-1">تتطلب تسعير ومراجعة التجديد السنوي</div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('summary')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'summary' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          لوحة الوثائق والفئات (CCHI)
        </button>
        <button
          onClick={() => setActiveTab('dependents')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'dependents' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          سجل التابعين والعائلات ({dependents.length})
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'policies' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          الوثائق والشركات ({policies.length})
        </button>
      </div>

      {/* Tab 1: Summary & Categories */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              توزيع الفئات التأمينية للموظفين (Policy Classes)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['VIP', 'Class A', 'Class B', 'Class C'].map(cat => {
                const count = summary?.categoryStats?.find((c: any) => c.category === cat)?.count || 0;
                return (
                  <div key={cat} className="p-4 rounded-xl border border-slate-100 bg-slate-50 text-center">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 inline-block mb-1">
                      {cat}
                    </span>
                    <div className="text-2xl font-bold text-slate-800">{count}</div>
                    <div className="text-xs text-slate-400">موظف مشمول</div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="font-semibold text-slate-700 mb-3 text-sm">التزامات نظام الضمان الصحي التعاوني (CCHI Guidelines):</h3>
              <ul className="space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>إلزامية التأمين الصحي الشامل لكافة الموظفين السعوديين وغير السعوديين وعائلاتهم (الزوج/الزوجة والأبناء حتى 25 سنة، والبنات غير المتزوجات).</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>الحد الائتماني للوثيقة الموحدة يغطي حتى 500,000 ر.س سنوياً لكل مستفيد شامل العمليات والتنويم والأدوية والأسنان.</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>الربط الفوري مع منصة إخلاء الطرف لإلغاء بطاقة التأمين واسترداد القسط النسبي (Pro-rata) فور مغادرة الموظف.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand-600" />
              شركات التأمين المعتمدة
            </h2>
            <div className="space-y-3">
              {policies.map(pol => (
                <div key={pol.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-sm">{pol.insurance_company}</span>
                    <span className="text-xs bg-brand-100 text-brand-800 font-medium px-2 py-0.5 rounded">
                      {pol.status === 'active' ? 'نشطة' : pol.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex justify-between">
                    <span>رقم الوثيقة: {pol.policy_number}</span>
                    <span>المنتهية: {pol.expiry_date}</span>
                  </div>
                  <div className="text-xs text-slate-600 font-medium pt-1 border-t border-slate-200 flex justify-between">
                    <span>المشتركون: {pol.total_members}</span>
                    <span>القسط: {pol.total_premium?.toLocaleString()} ر.س</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Dependents List */}
      {activeTab === 'dependents' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">سجل أفراد عائلات الموظفين والتابعين المشمولين بالتأمين</h2>
            <button
              onClick={() => setShowAddDepModal(true)}
              className="flex items-center gap-1.5 text-xs bg-emerald-50 text-brand-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              إضافة تابع جديد
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">اسم التابع</th>
                  <th className="p-3.5">الموظف الأساسي</th>
                  <th className="p-3.5">صلة القرابة</th>
                  <th className="p-3.5">رقم الهوية / الإقامة</th>
                  <th className="p-3.5">الفئة التأمينية</th>
                  <th className="p-3.5">رقم البطاقة</th>
                  <th className="p-3.5">القسط السنوي</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dependents.map(dep => (
                  <tr key={dep.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 font-medium text-slate-800">{dep.name}</td>
                    <td className="p-3.5 text-slate-600">{dep.employee_name}</td>
                    <td className="p-3.5">
                      <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-md font-medium">
                        {getRelationshipLabel(dep.relationship)}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">{dep.national_id_iqama}</td>
                    <td className="p-3.5">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-semibold">
                        {dep.category}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-xs text-slate-500">{dep.card_number}</td>
                    <td className="p-3.5 font-medium text-slate-700">{dep.annual_premium?.toLocaleString()} ر.س</td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleDeleteDependent(dep.id)}
                        className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                        title="إلغاء التابع"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {dependents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      لا يوجد تابعين مسجلين حالياً
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Policies List */}
      {activeTab === 'policies' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">سجل وثائق التأمين الطبي السارية والمؤرشفة</h2>
            <button
              onClick={() => setShowAddPolicyModal(true)}
              className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة وثيقة
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">رقم الوثيقة</th>
                  <th className="p-3.5">شركة التأمين</th>
                  <th className="p-3.5">تاريخ السريان</th>
                  <th className="p-3.5">تاريخ الانتهاء</th>
                  <th className="p-3.5">رقم اعتماد CCHI</th>
                  <th className="p-3.5">عدد المؤمنين</th>
                  <th className="p-3.5">القسط الإجمالي</th>
                  <th className="p-3.5">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policies.map(pol => (
                  <tr key={pol.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5 font-mono font-medium text-slate-800">{pol.policy_number}</td>
                    <td className="p-3.5 font-medium text-slate-700">{pol.insurance_company}</td>
                    <td className="p-3.5 text-slate-600">{pol.start_date}</td>
                    <td className="p-3.5 text-slate-600">{pol.expiry_date}</td>
                    <td className="p-3.5 font-mono text-xs text-slate-500">{pol.cchi_approval_number}</td>
                    <td className="p-3.5 font-medium text-slate-800">{pol.total_members} مستفيد</td>
                    <td className="p-3.5 font-bold text-slate-800">{pol.total_premium?.toLocaleString()} ر.س</td>
                    <td className="p-3.5">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                        سارية ومعتمدة
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Dependent Modal */}
      {showAddDepModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                إضافة تابع / فرد عائلة إلى التأمين الطبي
              </h3>
              <button onClick={() => setShowAddDepModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDependent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف الأساسي *</label>
                <select
                  required
                  value={depForm.employee_id}
                  onChange={e => setDepForm({ ...depForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.position || 'موظف'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">اسم التابع بالكامل *</label>
                  <input
                    type="text"
                    required
                    value={depForm.name}
                    onChange={e => setDepForm({ ...depForm, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                    placeholder="الاسم الثلاثي..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">صلة القرابة *</label>
                  <select
                    value={depForm.relationship}
                    onChange={e => setDepForm({ ...depForm, relationship: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="spouse">زوج / زوجة</option>
                    <option value="son">ابن</option>
                    <option value="daughter">ابنة</option>
                    <option value="parent">والد / والدة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الهوية / الإقامة *</label>
                  <input
                    type="text"
                    required
                    value={depForm.national_id_iqama}
                    onChange={e => setDepForm({ ...depForm, national_id_iqama: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                    placeholder="10XXXXXXXX أو 2XXXXXXXXX"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ الميلاد *</label>
                  <input
                    type="date"
                    required
                    value={depForm.birth_date}
                    onChange={e => setDepForm({ ...depForm, birth_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الفئة التأمينية</label>
                  <select
                    value={depForm.category}
                    onChange={e => setDepForm({ ...depForm, category: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="VIP">VIP (ذهبية شاملة)</option>
                    <option value="Class A">Class A (فئة أ)</option>
                    <option value="Class B">Class B (فئة ب)</option>
                    <option value="Class C">Class C (فئة ج)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">القسط السنوي التقديري (ر.س)</label>
                  <input
                    type="number"
                    value={depForm.annual_premium}
                    onChange={e => setDepForm({ ...depForm, annual_premium: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddDepModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-all"
                >
                  حفظ وتسجيل في الوثيقة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Policy Modal */}
      {showAddPolicyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800">إضافة وثيقة تأمين طبي جديدة</h3>
              <button onClick={() => setShowAddPolicyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddPolicy} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الوثيقة *</label>
                  <input
                    type="text"
                    required
                    value={policyForm.policy_number}
                    onChange={e => setPolicyForm({ ...policyForm, policy_number: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                    placeholder="CCHI-XXX-2026"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">شركة التأمين *</label>
                  <select
                    value={policyForm.insurance_company}
                    onChange={e => setPolicyForm({ ...policyForm, insurance_company: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="التعاونية للتأمين">التعاونية للتأمين</option>
                    <option value="بوبا العربية">بوبا العربية</option>
                    <option value="تكافل الراجحي">تكافل الراجحي</option>
                    <option value="ميدغلف">ميدغلف</option>
                    <option value="سلامة للتأمين">سلامة للتأمين</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ البدء</label>
                  <input
                    type="date"
                    value={policyForm.start_date}
                    onChange={e => setPolicyForm({ ...policyForm, start_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    value={policyForm.expiry_date}
                    onChange={e => setPolicyForm({ ...policyForm, expiry_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">عدد المؤمنين المشمولين</label>
                  <input
                    type="number"
                    value={policyForm.total_members}
                    onChange={e => setPolicyForm({ ...policyForm, total_members: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">إجمالي القسط السنوي (ر.س)</label>
                  <input
                    type="number"
                    value={policyForm.total_premium}
                    onChange={e => setPolicyForm({ ...policyForm, total_premium: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPolicyModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl"
                >
                  حفظ الوثيقة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
