import { useState, useEffect, FormEvent } from 'react';
import { 
  Plus, Trash2, Edit2, Search, Filter, User, Users, Briefcase, 
  Wallet, Tag, Building2, CreditCard, ShieldCheck, Shield, FileCheck, 
  Calendar, Check, AlertTriangle, Clock, Printer, FileText, ScanFace
} from 'lucide-react';
import type { Employee, Branch, AllowanceType, EmployeeAllowance, Department } from '../types';
import SalaryCertificateModal from './SalaryCertificateModal';
import { apiGet, apiMutate, safeArray } from '../lib/api';

export default function EmployeesView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [certEmployee, setCertEmployee] = useState<Employee | null>(null);
  const [activeFormTab, setActiveFormTab] = useState<'basic' | 'iqama' | 'payroll' | 'insurance'>('basic');
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState(0);
  const [filterNationality, setFilterNationality] = useState<'all' | 'saudi' | 'expat'>('all');
  
  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);
  
  const initialForm = {
    name: '',
    position: '',
    job_title: '',
    branch_id: 0,
    department_id: 0,
    basic_salary: 0,
    deductions: 0,
    insurance_number: '',
    bank_account: '',
    nationality: 'سعودي',
    is_saudi: 1,
    national_id_iqama: '',
    border_number: '',
    iqama_expiry_gregorian: '',
    iqama_expiry_hijri: '',
    iqama_profession: '',
    work_permit_number: '',
    work_permit_expiry: '',
    work_permit_fee: 9600,
    gosi_number: '',
    gosi_registered_salary: 0,
    housing_allowance: 0,
    transport_allowance: 0,
    other_allowances: 0,
    insurance_company: 'التعاونية للتأمين',
    medical_insurance_category: 'Class A',
    medical_insurance_policy: '',
    medical_insurance_expiry: '',
    medical_dependents_count: 0,
    saudi_iban: '',
    bank_name: 'مصرف الراجحي',
    contract_type: 'fixed' as 'fixed' | 'unlimited',
    contract_start_date: '',
    contract_end_date: '',
    payment_method: 'bank' as 'cash' | 'bank' | 'split',
    passport_number: '',
    passport_expiry: '',
    health_cert_number: '',
    health_cert_expiry: '',
    allowances_list: [] as EmployeeAllowance[]
  };

  const [formData, setFormData] = useState(initialForm);
  const [pendingDocs, setPendingDocs] = useState<{ doc_type: string; doc_number: string; expiry_date: string; data_uri: string }[]>([]);
  const [docForm, setDocForm] = useState({ doc_type: 'passport', doc_number: '', expiry_date: '', data_uri: '' });

  const fetchData = async () => {
    try {
      const [empRes, branchRes, deptRes, typeRes] = await Promise.allSettled([
        apiGet('/api/employees'),
        apiGet('/api/branches'),
        apiGet('/api/departments'),
        apiGet('/api/allowance-types')
      ]);

      if (empRes.status === 'fulfilled' && empRes.value) {
        setEmployees(safeArray(empRes.value));
      }
      if (branchRes.status === 'fulfilled' && branchRes.value) {
        setBranches(safeArray(branchRes.value));
      }
      if (deptRes.status === 'fulfilled' && deptRes.value) {
        setDepartments(safeArray(deptRes.value));
      }
      if (typeRes.status === 'fulfilled' && typeRes.value) {
        setAllowanceTypes(safeArray(typeRes.value));
      }
    } catch (err) {
      console.error("fetchData error:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const url = editingId ? `/api/employees/${editingId}` : '/api/employees';
    const method = editingId ? 'PUT' : 'POST';

    try {
      const data = await apiMutate(url, formData, method);
      const employeeId = editingId || data?.id;

      if (employeeId && pendingDocs.length > 0) {
        for (const doc of pendingDocs) {
          await apiMutate('/api/employee-documents', { employee_id: employeeId, doc_type: doc.doc_type, doc_number: doc.doc_number, expiry_date: doc.expiry_date, data_uri: doc.data_uri }, 'POST');
        }
      }

      setFormData(initialForm);
      setPendingDocs([]);
      setIsAdding(false);
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error("handleSubmit error:", err);
      alert('حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا الموظف؟')) {
      try {
        await apiMutate(`/api/employees/${id}`, {}, 'DELETE');
        fetchData();
      } catch (err) {
        console.error("handleDelete error:", err);
        alert('حدث خطأ أثناء الحذف');
      }
    }
  };

  const handleEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData({
      name: emp.name,
      position: emp.position,
      job_title: emp.job_title || emp.position,
      branch_id: emp.branch_id,
      department_id: emp.department_id || 0,
      basic_salary: emp.basic_salary,
      deductions: emp.deductions,
      insurance_number: emp.insurance_number || '',
      bank_account: emp.bank_account || emp.saudi_iban || '',
      nationality: emp.nationality || (emp.is_saudi === 1 ? 'سعودي' : 'مقيم'),
      is_saudi: emp.is_saudi !== undefined ? emp.is_saudi : (emp.nationality === 'سعودي' ? 1 : 0),
      national_id_iqama: emp.national_id_iqama || '',
      border_number: emp.border_number || '',
      iqama_expiry_gregorian: emp.iqama_expiry_gregorian || '',
      iqama_expiry_hijri: emp.iqama_expiry_hijri || '',
      iqama_profession: emp.iqama_profession || '',
      work_permit_number: emp.work_permit_number || '',
      work_permit_expiry: emp.work_permit_expiry || '',
      work_permit_fee: emp.work_permit_fee || 9600,
      gosi_number: emp.gosi_number || '',
      gosi_registered_salary: emp.gosi_registered_salary || 0,
      housing_allowance: emp.housing_allowance || 0,
      transport_allowance: emp.transport_allowance || 0,
      other_allowances: emp.other_allowances || 0,
      insurance_company: emp.insurance_company || 'التعاونية للتأمين',
      medical_insurance_category: emp.medical_insurance_category || 'Class A',
      medical_insurance_policy: emp.medical_insurance_policy || '',
      medical_insurance_expiry: emp.medical_insurance_expiry || '',
      medical_dependents_count: emp.medical_dependents_count || 0,
      saudi_iban: emp.saudi_iban || emp.bank_account || '',
      bank_name: emp.bank_name || 'مصرف الراجحي',
      contract_type: emp.contract_type || 'fixed',
      contract_start_date: emp.contract_start_date || '',
      contract_end_date: emp.contract_end_date || '',
      payment_method: emp.payment_method || 'bank',
      passport_number: emp.passport_number || '',
      passport_expiry: emp.passport_expiry || '',
      health_cert_number: emp.health_cert_number || '',
      health_cert_expiry: emp.health_cert_expiry || '',
      allowances_list: emp.allowances_details || []
    });
    setIsAdding(true);
  };

  const addAllowanceToForm = () => {
    setFormData({
      ...formData,
      allowances_list: [...formData.allowances_list, { type_id: 0, amount: 0 }]
    });
  };

  const updateAllowanceInForm = (index: number, field: keyof EmployeeAllowance, value: number) => {
    const updated = [...formData.allowances_list];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, allowances_list: updated });
  };

  const removeAllowanceFromForm = (index: number) => {
    setFormData({
      ...formData,
      allowances_list: formData.allowances_list.filter((_, i) => i !== index)
    });
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (emp.national_id_iqama && emp.national_id_iqama.includes(searchTerm));
    const matchesBranch = filterBranch === 0 || emp.branch_id === filterBranch;
    
    let matchesNat = true;
    if (filterNationality === 'saudi') {
      matchesNat = emp.is_saudi === 1 || emp.nationality === 'سعودي' || emp.nationality === 'سعودية';
    } else if (filterNationality === 'expat') {
      matchesNat = emp.is_saudi === 0 || (emp.nationality !== 'سعودي' && emp.nationality !== 'سعودية');
    }

    return matchesSearch && matchesBranch && matchesNat;
  });

return (
    <div className="space-y-6" dir="rtl">
      {loading ? (
        <div className="space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 rounded-xl w-[75%]" />
            <div className="h-4 bg-slate-200 rounded w-[25%]" />
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-full mb-2" />
            <div className="h-4 bg-slate-200 rounded w-[75%]" />
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">إدارة الموظفين والامتثال السعودي</h1>
          <p className="text-slate-500 text-sm">بيانات الموظفين، الإقامات، رخص العمل، التأمينات GOSI، والتأمين الطبي</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData(initialForm);
            setIsAdding(true);
          }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-emerald-700 transition-all active:scale-95 shadow-md shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-4 top-[50%] -translate-y-[50%] text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="بحث بالاسم أو رقم الهوية/الإقامة أو المسمى..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200-60 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            className="px-4 py-3 bg-slate-50 border border-slate-200-60 rounded-2xl outline-none font-bold text-slate-700 text-xs"
            value={filterNationality}
            onChange={e => setFilterNationality(e.target.value as any)}
          >
            <option value="all">جميع الجنسيات</option>
            <option value="saudi">سعودي فقط (نطاقات)</option>
            <option value="expat">مقيم / وافد فقط</option>
          </select>

          <select 
            className="px-4 py-3 bg-slate-50 border border-slate-200-60 rounded-2xl outline-none font-bold text-slate-700 text-xs"
            value={filterBranch}
            onChange={e => setFilterBranch(Number(e.target.value))}
          >
            <option value="0">كل الفروع</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <div className="text-xs font-black text-emerald-800 bg-emerald-50 px-4 py-3 rounded-2xl border border-emerald-100 flex items-center whitespace-nowrap">
            {filteredEmployees.length} موظف
          </div>
        </div>
      </div>

      {/* Add / Edit Form Modal / Card */}
      {isAdding && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-xl font-black text-slate-800">
                {editingId ? 'تعديل بيانات الموظف والامتثال السعودي' : 'إضافة موظف جديد بالنظام السعودي'}
              </h3>
              <p className="text-xs text-slate-400">تحديث كافة تفاصيل الإقامة، التأمينات الاجتماعية، والتأمين الطبي</p>
            </div>
            <button
              onClick={() => setIsAdding(false)}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 font-bold"
            >
              ✕
            </button>
          </div>

          {/* Form Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveFormTab('basic')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeFormTab === 'basic' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              1. البيانات الأساسية والتعاقد
            </button>
            <button
              type="button"
              onClick={() => setActiveFormTab('iqama')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeFormTab === 'iqama' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              2. الإقامة ورخصة العمل (قوى)
            </button>
            <button
              type="button"
              onClick={() => setActiveFormTab('payroll')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeFormTab === 'payroll' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              3. الراتب والبدلات والتأمينات (GOSI)
            </button>
            <button
              type="button"
              onClick={() => setActiveFormTab('insurance')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeFormTab === 'insurance' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              4. التأمين الطبي (CCHI) والحساب البنكي
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tab 1: Basic & Contract */}
            {activeFormTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">الاسم الكامل (كما في الهوية/الإقامة)</label>
                  <input 
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">الجنسية</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    value={formData.nationality}
                    onChange={e => {
                      const nat = e.target.value;
                      const isSaudi = nat === 'سعودي' || nat === 'سعودية' ? 1 : 0;
                      setFormData({ ...formData, nationality: nat, is_saudi: isSaudi });
                    }}
                  >
                    <option value="سعودي">سعودي</option>
                    <option value="مصر">مصري</option>
                    <option value="الهند">هندي</option>
                    <option value="باكستان">باكستاني</option>
                    <option value="اليمن">يمني</option>
                    <option value="الأردن">أردني</option>
                    <option value="سوريا">سوري</option>
                    <option value="السودان">سوداني</option>
                    <option value="الفلبين">فلبيني</option>
                    <option value="أخرى">جنسية أخرى</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم الهوية الوطنية / الإقامة (10 أرقام)</label>
                  <input 
                    type="text"
                    maxLength={10}
                    placeholder="مثال: 1089234123"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                    value={formData.national_id_iqama}
                    onChange={e => setFormData({ ...formData, national_id_iqama: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم الحدود (للقادمين الجدد)</label>
                  <input 
                    type="text"
                    placeholder="مثال: 308945612"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                    value={formData.border_number}
                    onChange={e => setFormData({ ...formData, border_number: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">المسمى الوظيفي الداخلي</label>
                  <input 
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    value={formData.position}
                    onChange={e => setFormData({ ...formData, position: e.target.value, job_title: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">المهنة المعتمدة في منصة قوى / الإقامة</label>
                  <input 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-bold"
                    value={formData.iqama_profession}
                    onChange={e => setFormData({ ...formData, iqama_profession: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">الإدارة / القسم</label>
                  <select 
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    value={formData.department_id}
                    onChange={e => setFormData({ ...formData, department_id: Number(e.target.value) })}
                  >
                    <option value={0}>اختر الإدارة...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">الفرع</label>
                  <select 
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    value={formData.branch_id}
                    onChange={e => setFormData({ ...formData, branch_id: Number(e.target.value) })}
                  >
                    <option value={0}>اختر الفرع...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">نوع عقد العمل</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-bold"
                    value={formData.contract_type}
                    onChange={e => setFormData({ ...formData, contract_type: e.target.value as any })}
                  >
                    <option value="fixed">محدد المدة (سنوي)</option>
                    <option value="indefinite">غير محدد المدة (مفتوح)</option>
                    <option value="temporary">مؤقت / موسمي</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">تاريخ بداية العقد</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                    value={formData.contract_start_date}
                    onChange={e => setFormData({ ...formData, contract_start_date: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">تاريخ نهاية العقد</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                    value={formData.contract_end_date}
                    onChange={e => setFormData({ ...formData, contract_end_date: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Tab 2: Iqama & Work Permit */}
            {activeFormTab === 'iqama' && (
              <div className="space-y-6">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200-60 text-xs text-amber-900">
                  <p className="font-black mb-0.5">ملاحظة تنظيمية خاصة بالوافدين:</p>
                  <span>تعتمد منصة قوى ووزارة الموارد البشرية رخص العمل السنوية بقيمة 9,600 ر.س مع 650 ر.س رسوم الجوازات.</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">تاريخ انتهاء الإقامة (ميلادي)</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold"
                      value={formData.iqama_expiry_gregorian}
                      onChange={e => setFormData({ ...formData, iqama_expiry_gregorian: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">تاريخ انتهاء الإقامة (هجري)</label>
                    <input 
                      type="text"
                      placeholder="1447/08/15"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.iqama_expiry_hijri}
                      onChange={e => setFormData({ ...formData, iqama_expiry_hijri: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">رقم رخصة العمل (منصة قوى)</label>
                    <input 
                      type="text"
                      placeholder="WP-10928374"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.work_permit_number}
                      onChange={e => setFormData({ ...formData, work_permit_number: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">تاريخ انتهاء رخصة العمل</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.work_permit_expiry}
                      onChange={e => setFormData({ ...formData, work_permit_expiry: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">رسوم المقابل المالي السنوي (ر.س)</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold"
                      value={formData.work_permit_fee}
                      onChange={e => setFormData({ ...formData, work_permit_fee: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">رقم جواز السفر</label>
                    <input type="text" placeholder="N1234567" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.passport_number || ''} onChange={e => setFormData({ ...formData, passport_number: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">تاريخ انتهاء الجواز</label>
                    <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.passport_expiry || ''} onChange={e => setFormData({ ...formData, passport_expiry: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">رقم الشهادة الصحية</label>
                    <input type="text" placeholder="HC-0001" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.health_cert_number || ''} onChange={e => setFormData({ ...formData, health_cert_number: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">تاريخ انتهاء الشهادة الصحية</label>
                    <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                      value={formData.health_cert_expiry || ''} onChange={e => setFormData({ ...formData, health_cert_expiry: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Payroll & GOSI */}
            {activeFormTab === 'payroll' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">الراتب الأساسي (ر.س)</label>
                    <input 
                      required
                      type="number"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-black text-slate-800"
                      value={formData.basic_salary}
                      onChange={e => setFormData({ ...formData, basic_salary: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">بدل السكن الشهري (ر.س)</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold"
                      value={formData.housing_allowance}
                      onChange={e => setFormData({ ...formData, housing_allowance: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">بدل النقل والمواصلات (ر.س)</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold"
                      value={formData.transport_allowance}
                      onChange={e => setFormData({ ...formData, transport_allowance: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">رقم المشترك في التأمينات GOSI</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold"
                      value={formData.gosi_number || formData.insurance_number}
                      onChange={e => setFormData({ ...formData, gosi_number: e.target.value, insurance_number: e.target.value })}
                    />
                  </div>
                </div>

                {/* GOSI Computed wage summary */}
                <div className="p-4 bg-brand-50-60 rounded-2xl border border-brand-100 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-brand-950">الأجر الخاضع لاشتراك التأمينات الاجتماعية (الأساسي + السكن بحد أقصى 45 ألف):</span>
                    <p className="text-brand-700 mt-0.5">
                      {formData.is_saudi ? 'يستقطع منه 9.75% من الموظف و 11.75% على صاحب العمل' : 'يتحمل صاحب العمل 2% أخطار مهنية ولا استقطاع على الوافد'}
                    </p>
                  </div>
                  <span className="text-lg font-black font-mono text-brand-900">
                    {Math.min(45000, Number(formData.basic_salary) + Number(formData.housing_allowance)).toLocaleString()} ر.س
                  </span>
                </div>

                {/* Additional Allowances */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 text-xs">بدلات ومكافآت إضافية أخرى</h4>
                    <button 
                      type="button"
                      onClick={addAllowanceToForm}
                      className="text-xs font-bold bg-brand-50 text-brand-700 px-3 py-1.5 rounded-xl hover:bg-brand-100 transition-colors"
                    >
                      + إضافة بدل آخر
                    </button>
                  </div>

                  {formData.allowances_list.map((al, idx) => (
                    <div key={idx} className="flex gap-3 items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400">نوع البدل</label>
                        <select 
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200-80 rounded-xl outline-none text-xs font-bold"
                          value={al.type_id}
                          onChange={e => updateAllowanceInForm(idx, 'type_id', Number(e.target.value))}
                        >
                          <option value={0}>اختر النوع...</option>
                          {allowanceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400">القيمة (ر.س)</label>
                        <input 
                          type="number"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200-80 rounded-xl outline-none text-xs font-mono font-bold"
                          value={al.amount}
                          onChange={e => updateAllowanceInForm(idx, 'amount', Number(e.target.value))}
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeAllowanceFromForm(idx)}
                        className="p-2 text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 4: Medical Insurance & Bank */}
            {activeFormTab === 'insurance' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">شركة التأمين الطبي (مجلس الضمان CCHI)</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-bold"
                    value={formData.insurance_company}
                    onChange={e => setFormData({ ...formData, insurance_company: e.target.value })}
                  >
                    <option value="التعاونية للتأمين">التعاونية للتأمين (Tawuniya)</option>
                    <option value="بوبا العربية">بوبا العربية (Bupa Arabia)</option>
                    <option value="ميدغلف">ميدغلف (Medgulf)</option>
                    <option value="تكافل الراجحي">تكافل الراجحي (Al Rajhi Takaful)</option>
                    <option value="سلامة للتأمين">سلامة للتأمين (Salama)</option>
                    <option value="الدرع العربي">الدرع العربي</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">فئة شبكة العلاج والتغطية</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-bold"
                    value={formData.medical_insurance_category}
                    onChange={e => setFormData({ ...formData, medical_insurance_category: e.target.value })}
                  >
                    <option value="VIP">VIP (كبار الشخصيات)</option>
                    <option value="Class A">فئة A (Class A)</option>
                    <option value="Class B">فئة B (Class B)</option>
                    <option value="Class C">فئة C (Class C)</option>
                    <option value="Class D">فئة D (Class D - عمالة)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم وثيقة التأمين الطبي</label>
                  <input 
                    type="text"
                    placeholder="POL-884920"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                    value={formData.medical_insurance_policy}
                    onChange={e => setFormData({ ...formData, medical_insurance_policy: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">تاريخ انتهاء وثيقة التأمين الطبي</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono"
                    value={formData.medical_insurance_expiry}
                    onChange={e => setFormData({ ...formData, medical_insurance_expiry: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">عدد التابعين المشمولين بالتأمين</label>
                  <input 
                    type="number"
                    min={0}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold"
                    value={formData.medical_dependents_count}
                    onChange={e => setFormData({ ...formData, medical_dependents_count: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">اسم البنك المعتمد لتحويل الراتب</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-bold"
                    value={formData.bank_name}
                    onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
                  >
                    <option value="مصرف الراجحي">مصرف الراجحي</option>
                    <option value="البنك الأهلي السعودي">البنك الأهلي السعودي (SNB)</option>
                    <option value="مصرف الإنماء">مصرف الإنماء</option>
                    <option value="بنك الرياض">بنك الرياض</option>
                    <option value="بنك البلاد">بنك البلاد</option>
                    <option value="البنك السعودي الأول (SAB)">البنك السعودي الأول (SAB)</option>
                    <option value="البنك العربي الوطني (ANB)">البنك العربي الوطني</option>
                  </select>
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم الحساب البنكي الدولي الآيبان (Saudi IBAN)</label>
                  <input 
                    type="text"
                    placeholder="SA0380000000608010167519"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200-80 rounded-xl outline-none font-mono font-bold text-slate-800"
                    value={formData.saudi_iban || formData.bank_account}
                    onChange={e => setFormData({ ...formData, saudi_iban: e.target.value, bank_account: e.target.value })}
                  />
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">طريقة دفع الراتب</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFormData({ ...formData, payment_method: 'bank' })}
                      className={`py-2.5 rounded-xl text-sm font-bold border ${formData.payment_method === 'bank' ? 'bg-brand-600 text-white border-brand-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>بنكي (تحويل)</button>
                    <button type="button" onClick={() => setFormData({ ...formData, payment_method: 'cash' })}
                      className={`py-2.5 rounded-xl text-sm font-bold border ${formData.payment_method === 'cash' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>نقدي</button>
                  </div>
                </div>
              </div>
            )}

            {/* Attach Documents */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <h4 className="font-black text-slate-800 mb-1 flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> إرفاق مستندات الموظف (اختياري)</h4>
              <p className="text-[11px] text-slate-400 mb-4">جواز سفر، إقامة، شهادة صحية، عقد... تُحفظ في ملف الموظف وتُغذي التنبيهات.</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <select value={docForm.doc_type} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
                  <option value="passport">جواز سفر</option>
                  <option value="iqama">إقامة</option>
                  <option value="health_cert">شهادة صحية</option>
                  <option value="contract">عقد عمل</option>
                  <option value="other">أخرى</option>
                </select>
                <input value={docForm.doc_number} onChange={e => setDocForm({ ...docForm, doc_number: e.target.value })} placeholder="رقم الوثيقة" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
                <input type="date" value={docForm.expiry_date} onChange={e => setDocForm({ ...docForm, expiry_date: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
                <input type="file" accept="image/*,application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setDocForm({ ...docForm, data_uri: String(r.result) }); r.readAsDataURL(f); } }} className="w-full text-sm" />
              </div>
              <button type="button" onClick={() => { if (docForm.data_uri || docForm.doc_number) { setPendingDocs([...pendingDocs, docForm]); setDocForm({ doc_type: 'passport', doc_number: '', expiry_date: '', data_uri: '' }); } }}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700">+ إضافة وثيقة للقائمة</button>
              {pendingDocs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {pendingDocs.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
                      <span className="font-bold text-slate-700">{d.doc_type} {d.doc_number && `· ${d.doc_number}`}</span>
                      <button type="button" onClick={() => setPendingDocs(pendingDocs.filter((_, x) => x !== i))} className="text-red-500 hover:text-red-700 text-xs font-bold">إزالة</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setIsAdding(false)} 
                className="px-8 py-3 rounded-2xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
              >
                إلغاء
              </button>
              <button 
                type="submit" 
                className="px-12 py-3 rounded-2xl font-black bg-brand-600 text-white shadow-lg shadow-emerald-200 hover:bg-brand-700 transition-colors text-sm"
              >
                {editingId ? 'تحديث وحفظ البيانات' : 'حفظ الموظف الجديد'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Employees Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50-80 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-4">الموظف / الهوية</th>
                <th className="px-6 py-4 text-center">القسم / الفرع</th>
                <th className="px-6 py-4 text-center">الإقامة / رخصة العمل</th>
                <th className="px-6 py-4 text-center">الراتب الأساسي</th>
                <th className="px-6 py-4 text-center">البدلات (سكن/نقل)</th>
                <th className="px-6 py-4 text-center">التأمينات GOSI</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map(emp => {
                const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي' || emp.nationality === 'سعودية';
                return (
                  <tr key={emp.id} className="hover:bg-slate-50-60 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${
                          isSaudi ? 'bg-emerald-100 text-emerald-800' : 'bg-brand-100 text-brand-800'
                        }`}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{emp.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              isSaudi ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {emp.nationality || (isSaudi ? 'سعودي' : 'مقيم')}
                            </span>
                            <span className="font-mono text-xs text-slate-400 font-bold">
                              {emp.national_id_iqama || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="text-xs font-bold text-slate-700 block">{emp.department_name || 'بدون قسم'}</span>
                      <span className="text-[10px] font-bold text-slate-400">{emp.branch_name}</span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      {isSaudi ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                          مواطن سعودي
                        </span>
                      ) : (
                        <div>
                          <span className="text-xs font-mono font-bold text-slate-700 block">
                            {emp.iqama_expiry_gregorian || 'سارية'}
                          </span>
                          <span className="text-[10px] text-slate-400">{emp.iqama_profession || 'مهنة معتمدة'}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-center font-mono font-bold text-slate-800">
                      {(emp.basic_salary || 0).toLocaleString()} ر.س
                    </td>

                    <td className="px-6 py-4 text-center font-mono text-xs font-bold text-brand-700">
                      <div>
                        <span>{((emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.allowances || 0)).toLocaleString()} ر.س</span>
                        {(emp.housing_allowance || 0) > 0 && (
                          <span className="text-[10px] text-slate-400 block">(سكن: {emp.housing_allowance})</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs font-bold font-mono">
                        {emp.gosi_number || emp.insurance_number || 'مسجل'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={async () => {
                            try {
                              const { registerPlatformBiometric, webauthnSupported } = await import('../lib/webauthn-client');
                              if (!webauthnSupported()) return alert('البصمة تتطلب HTTPS على هذا الجهاز');
                              const optRes = await fetch('/api/webauthn/register/options', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ employee_id: emp.id })
                              });
                              const opts = await optRes.json();
                              if (!optRes.ok) throw new Error(opts.error);
                              const cred = await registerPlatformBiometric(opts);
                              const save = await fetch('/api/webauthn/register', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ employee_id: emp.id, method: 'face', ...cred })
                              });
                              const data = await save.json();
                              if (!save.ok) throw new Error(data.error);
                              alert('تم تسجيل بصمة الموظف على هذا الجهاز');
                            } catch (e) { alert((e as Error).message); }
                          }}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
                          title="تسجيل بصمة الوجه/الإصبع"
                        >
                          <ScanFace className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setCertEmployee(emp)}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
                          title="إصدار شهادة تعريف بالراتب"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(emp)}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(emp.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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

      {/* شهادة تعريف بالراتب — زر الطابعة في جدول الموظفين بيفتح المودال ده */}
      {certEmployee && (
        <SalaryCertificateModal
          employee={certEmployee}
          isOpen={Boolean(certEmployee)}
          onClose={() => setCertEmployee(null)}
        />
      )}
    </div>
  );
}
