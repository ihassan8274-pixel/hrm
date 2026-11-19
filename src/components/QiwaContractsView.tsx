import { useState, useEffect, FormEvent } from 'react';
import { 
  FileText, Plus, Search, Calendar, ShieldCheck, AlertCircle, 
  Clock, CheckCircle2, Building, RefreshCw, Printer, X
} from 'lucide-react';
import type { QiwaContract, Employee } from '../types';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

export default function QiwaContractsView() {
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();
  const [contracts, setContracts] = useState<QiwaContract[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [viewingContract, setViewingContract] = useState<QiwaContract | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    contract_type: 'fixed_term',
    job_title: '',
    work_location: 'الرياض - المقر الرئيسي',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    probation_days: '90',
    notice_period_days: '60',
    basic_salary: '',
    housing_allowance: '',
    transport_allowance: '',
    other_allowances: '0',
    weekly_working_hours: '48',
    annual_leave_days: '21',
    auto_renew: true,
    qiwa_status: 'authenticated'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cRes, eRes] = await Promise.all([
        fetch('/api/qiwa/contracts'),
        fetch('/api/employees')
      ]);
      const [cData, eData] = await Promise.all([cRes.json(), eRes.json()]);
      setContracts(cData);
      setEmployees(eData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEmployeeChange = (empId: string) => {
    const emp = employees.find(e => e.id === Number(empId));
    if (emp) {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const start = emp.join_date || new Date().toISOString().split('T')[0];
      let end = '';
      if (!isSaudi) {
        const d = new Date(start);
        d.setFullYear(d.getFullYear() + 1);
        end = d.toISOString().split('T')[0];
      }
      setFormData({
        ...formData,
        employee_id: empId,
        job_title: emp.position || emp.job_title || 'موظف',
        basic_salary: String(emp.basic_salary || 5000),
        housing_allowance: String(emp.housing_allowance || 1250),
        transport_allowance: String(emp.transport_allowance || 500),
        contract_type: isSaudi ? 'indefinite' : 'fixed_term',
        start_date: start,
        end_date: end
      });
    } else {
      setFormData({ ...formData, employee_id: empId });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/qiwa/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = (c.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.contract_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.job_title || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || c.contract_type === filterType;
    return matchesSearch && matchesType;
  });

  const expiringSoonCount = contracts.filter(c => c.days_until_expiry !== null && c.days_until_expiry <= 60 && c.days_until_expiry > 0).length;
  const noticeAlertCount = contracts.filter(c => c.days_until_notice_deadline !== null && c.days_until_notice_deadline <= 30 && c.days_until_notice_deadline >= 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">إدارة وتوثيق عقود العمل الموحدة (منصة قوى)</h2>
              <p className="text-sm text-slate-500">متابعة العقود الإلكترونية الموثقة، فترات الإشعار والتجديد التلقائي وفق نظام العمل السعودي</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const res = await fetch('/api/qiwa/draft-from-employees', { method: 'POST' });
              const data = await res.json();
              alert(data.error || `تم إنشاء ${data.created || 0} مسودة عقد من بيانات الموظفين`);
              fetchData();
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold"
          >
            مسودات من الموظفين
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            إنشاء عقد موحد جديد
          </button>
        </div>
      </div>

      {/* KPI Alert Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 font-medium">إجمالي العقود الموثقة</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><ShieldCheck className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{contracts.length}</p>
          <span className="text-xs text-emerald-600 font-medium">100% متوافقة مع متطلبات قوى</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 font-medium">عقود قاربت على الانتهاء (خلال 60 يوماً)</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold text-amber-700">{expiringSoonCount}</p>
          <span className="text-xs text-slate-500">تتطلب مراجعة رغبة التجديد</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 font-medium">مهلة إشعار عدم التجديد (المادة 75)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><AlertCircle className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold text-rose-700">{noticeAlertCount}</p>
          <span className="text-xs text-rose-600 font-medium">أقل من 30 يوماً على الموعد النهائي للإشعار</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 font-medium">التجديد التلقائي النشط</span>
            <div className="p-2 bg-brand-50 text-brand-600 rounded-lg"><RefreshCw className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold text-brand-700">{contracts.filter(c => c.auto_renew === 1).length}</p>
          <span className="text-xs text-brand-600 font-medium">يُجدد تلقائياً لمدة مماثلة</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="بحث باسم الموظف، المسمى، أو رقم العقد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'fixed_term', label: 'محدد المدة' },
            { id: 'indefinite', label: 'غير محدد المدة' },
            { id: 'flexible', label: 'عمل مرن' },
            { id: 'remote', label: 'عن بعد' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                filterType === tab.id
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5">رقم العقد ومرجع قوى</th>
                <th className="px-4 py-3.5">الموظف</th>
                <th className="px-4 py-3.5">نوع العقد</th>
                <th className="px-4 py-3.5">فترة العقد</th>
                <th className="px-4 py-3.5">فترة التجربة والإشعار</th>
                <th className="px-4 py-3.5">الراتب والبدلات</th>
                <th className="px-4 py-3.5">حالة التوثيق</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">جاري التحميل...</td>
                </tr>
              ) : filteredContracts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">لا توجد عقود مسجلة تطابق البحث</td>
                </tr>
              ) : (
                filteredContracts.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800 font-mono text-xs">{c.contract_number}</p>
                      <span className="text-[11px] text-slate-400 font-mono">{c.qiwa_reference || 'قيد الاعتماد'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800">{c.employee_name}</p>
                      <span className="text-xs text-slate-500">{c.job_title} • {c.nationality || 'سعودي'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">
                        {c.contract_type === 'fixed_term' ? 'محدد المدة' : 
                         c.contract_type === 'indefinite' ? 'غير محدد المدة' : 
                         c.contract_type === 'remote' ? 'عمل عن بعد' : 
                         c.contract_type === 'flexible' ? 'عمل مرن' : 'دوام جزئي'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>من: {c.start_date}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {c.end_date ? `إلى: ${c.end_date}` : 'مستمر (غير محدد)'}
                      </div>
                      {c.days_until_expiry !== null && c.days_until_expiry > 0 && c.days_until_expiry <= 60 && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded">
                          متبقي {c.days_until_expiry} يوم
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="text-slate-700">تجربة: <strong>{c.probation_days}</strong> يوماً</p>
                      <p className="text-slate-500 mt-0.5">إشعار: <strong>{c.notice_period_days}</strong> يوماً</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="font-bold text-slate-800">{(c.basic_salary + c.housing_allowance + c.transport_allowance + (c.other_allowances || 0)).toLocaleString()} ر.س</p>
                      <span className="text-[11px] text-slate-400">أساسي: {c.basic_salary.toLocaleString()} ر.س</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        موثق بقوى
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => setViewingContract(c)}
                        className="p-2 text-brand-600 hover:bg-emerald-50 rounded-xl transition font-medium text-xs inline-flex items-center gap-1.5"
                      >
                        <Printer className="w-4 h-4" />
                        معاينة وطباعة
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Contract Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">إنشاء وتوثيق عقد عمل موحد (قوى)</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                  <select
                    required
                    value={formData.employee_id}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">اختر الموظف...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.is_saudi ? 'سعودي' : 'غير سعودي'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع العقد *</label>
                  <select
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="fixed_term">محدد المدة (لغير السعوديين أو بعقد محدد)</option>
                    <option value="indefinite">غير محدد المدة (للسعوديين)</option>
                    <option value="flexible">عمل مرن (بالساعة)</option>
                    <option value="remote">عمل عن بعد</option>
                    <option value="part_time">دوام جزئي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي المعتمد *</label>
                  <input
                    type="text"
                    required
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">موقع ومقر العمل</label>
                  <input
                    type="text"
                    value={formData.work_location}
                    onChange={(e) => setFormData({ ...formData, work_location: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ بداية العقد *</label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ نهاية العقد (إن وجد)</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فترة التجربة (المادة 53)</label>
                  <select
                    value={formData.probation_days}
                    onChange={(e) => setFormData({ ...formData, probation_days: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="90">90 يوماً (الافتراضي النظامي)</option>
                    <option value="180">180 يوماً (باتفاق كتابي صريح)</option>
                    <option value="0">بدون فترة تجربة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فترة الإشعار (المادة 75)</label>
                  <select
                    value={formData.notice_period_days}
                    onChange={(e) => setFormData({ ...formData, notice_period_days: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="60">60 يوماً (الحد الأدنى للمعينين شهرياً)</option>
                    <option value="90">90 يوماً</option>
                    <option value="30">30 يوماً</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الراتب الأساسي (ر.س) *</label>
                  <input
                    type="number"
                    required
                    value={formData.basic_salary}
                    onChange={(e) => setFormData({ ...formData, basic_salary: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بدل السكن (ر.س)</label>
                  <input
                    type="number"
                    value={formData.housing_allowance}
                    onChange={(e) => setFormData({ ...formData, housing_allowance: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بدل النقل (ر.س)</label>
                  <input
                    type="number"
                    value={formData.transport_allowance}
                    onChange={(e) => setFormData({ ...formData, transport_allowance: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الإجازة السنوية (أيام - المادة 109)</label>
                  <input
                    type="number"
                    value={formData.annual_leave_days}
                    onChange={(e) => setFormData({ ...formData, annual_leave_days: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="auto_renew"
                  checked={formData.auto_renew}
                  onChange={(e) => setFormData({ ...formData, auto_renew: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="auto_renew" className="text-xs font-medium text-slate-700">
                  تجديد العقد تلقائياً لمدد مماثلة ما لم يشعر أحد الطرفين الآخر كتابياً بعدم الرغبة في التجديد
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition"
                >
                  حفظ وتوثيق العقد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Viewer / Print Modal */}
      {viewingContract && (
        <div className="print-modal-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="print-document bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl space-y-6 print:p-0">
            <div className="flex items-center justify-between border-b pb-4 print:hidden no-print">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <h3 className="font-bold text-slate-800">عقد عمل موحد معتمد - منصة قوى</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  طباعة العقد
                </button>
                <button onClick={() => setViewingContract(null)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Contract Document */}
            <div className="border-2 border-slate-800 p-8 rounded-xl space-y-6 text-slate-800 text-sm leading-relaxed">
              <Letterhead company={company} />

              <div className="text-center border-b-2 border-slate-800 pb-4">
                <h2 className="text-xl font-extrabold">المملكة العربية السعودية</h2>
                <h3 className="text-md font-bold text-emerald-800 mt-1">عقد عمل موحد (منصة قوى الإلكترونية)</h3>
                <p className="text-xs text-slate-500 mt-1 font-mono">رقم العقد: {viewingContract.contract_number} | الرقم المرجعي: {viewingContract.qiwa_reference}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <p className="font-bold text-slate-900">الطرف الأول (صاحب العمل):</p>
                  <p>المنشأة: {company?.org_name}</p>
                  <p>
                    السجل التجاري: {company?.cr_number || '---'} | الرقم الموحد: {company?.unified_number_700 || '---'}
                  </p>
                  <p>المقر: {viewingContract.work_location}</p>
                </div>
                <div>
                  <p className="font-bold text-slate-900">الطرف الثاني (العامل):</p>
                  <p>الاسم: {viewingContract.employee_name}</p>
                  <p>الهوية / الإقامة: {viewingContract.national_id_iqama || 'سجل رسمي'}</p>
                  <p>الجنسية: {viewingContract.nationality || 'سعودي'}</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <p><strong>البند الأول (المهنة ومقر العمل):</strong> يعمل الطرف الثاني لدى الطرف الأول بمهنة ({viewingContract.job_title}) في مدينة ({viewingContract.work_location}).</p>
                <p><strong>البند الثاني (مدة العقد):</strong> يبدأ سريان هذا العقد من تاريخ ({viewingContract.start_date}) {viewingContract.end_date ? `وينتهي في (${viewingContract.end_date})` : 'وهو عقد غير محدد المدة'}.</p>
                <p><strong>البند الثالث (فترة التجربة - المادة 53):</strong> يخضع الطرف الثاني لفترة تجربة مدتها ({viewingContract.probation_days}) يوماً، ويحق لأي من الطرفين إنهاء العقد خلالها دون مكافأة أو تعويض.</p>
                <p><strong>البند الرابع (الأجر والبدلات):</strong> يدفع الطرف الأول للطرف الثاني أجراً شهرياً يتكون من: راتب أساسي ({viewingContract.basic_salary.toLocaleString()} ر.س) + بدل سكن ({viewingContract.housing_allowance.toLocaleString()} ر.س) + بدل نقل ({viewingContract.transport_allowance.toLocaleString()} ر.س) بإجمالي شهري قدره ({(viewingContract.basic_salary + viewingContract.housing_allowance + viewingContract.transport_allowance).toLocaleString()} ر.س) عبر نظام حماية الأجور (مدد).</p>
                <p><strong>البند الخامس (ساعات العمل والإجازات):</strong> ساعات العمل ({viewingContract.weekly_working_hours}) ساعة أسبوعياً، ويستحق العامل إجازة سنوية بأجر كامل مدتها ({viewingContract.annual_leave_days}) يوماً تقويمياً وفق المادة (109).</p>
                <p><strong>البند السادس (الإنهاء وفترة الإشعار - المادتان 75 و 77):</strong> في حال رغبة أحد الطرفين في عدم التجديد أو إنهاء العقد غير محدد المدة لسبب مشروع، يلتزم بإشعار الطرف الآخر كتابياً بمدة لا تقل عن ({viewingContract.notice_period_days}) يوماً.</p>
              </div>

              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs border-t border-slate-300">
                <div>
                  <p className="font-bold">توقيع وختم صاحب العمل</p>
                  <p className="mt-8 text-emerald-800 font-bold">معتمد إلكترونياً عبر منصة قوى ✓</p>
                </div>
                <div>
                  <p className="font-bold">توقيع وقبول العامل</p>
                  <p className="mt-8 text-emerald-800 font-bold">تم القبول والمصادقة رقمياً ✓</p>
                </div>
              </div>

              <DocumentFooter company={company} reference={viewingContract.contract_number} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
