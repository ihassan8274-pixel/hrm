import { useState, useEffect, FormEvent } from 'react';
import { 
  Laptop, Clock, CheckCircle2, Plus, Calendar, 
  DollarSign, Award, FileText, UserCheck, RefreshCw, 
  Building, Sparkles, X, Layers, Briefcase
} from 'lucide-react';
import type { FlexibleWorkShift, TeleworkPermit } from '../types';

export default function FlexibleWorkTeleworkView() {
  const [shifts, setShifts] = useState<FlexibleWorkShift[]>([]);
  const [permits, setPermits] = useState<TeleworkPermit[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [flexStats, setFlexStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'flexible' | 'telework'>('flexible');

  // Shift Modal
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    hours_worked: 6,
    hourly_rate: 45,
    notes: 'دوام مرن بالساعة - دعم العمليات',
    qiwa_contract_ref: ''
  });

  // Telework Modal
  const [showPermitModal, setShowPermitModal] = useState(false);
  const [permitForm, setPermitForm] = useState({
    employee_id: '',
    permit_type: 'hybrid',
    remote_days_per_week: 2,
    contract_start: new Date().toISOString().split('T')[0],
    contract_end: '2026-12-31',
    telework_platform_registered: 1,
    productivity_score: 96
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shiftRes, permRes, empRes] = await Promise.all([
        fetch('/api/flexible/shifts'),
        fetch('/api/telework/permits'),
        fetch('/api/employees')
      ]);

      if (shiftRes.ok) {
        const sData = await shiftRes.json();
        setShifts(sData.shifts || []);
        setFlexStats({
          totalHours: sData.totalHours || 0,
          totalPaid: sData.totalPaid || 0,
          saudiFlexHours: sData.saudiFlexHours || 0,
          nitaqatUnitsGained: sData.nitaqatUnitsGained || 0
        });
      }
      if (permRes.ok) setPermits(await permRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (err) {
      console.error('Error loading flexible/telework data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveShift = async (e: FormEvent) => {
    e.preventDefault();
    if (!shiftForm.employee_id) return;
    try {
      const res = await fetch('/api/flexible/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftForm)
      });
      if (res.ok) {
        setShowShiftModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePermit = async (e: FormEvent) => {
    e.preventDefault();
    if (!permitForm.employee_id) return;
    try {
      const res = await fetch('/api/telework/permits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permitForm)
      });
      if (res.ok) {
        setShowPermitModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getPermitBadge = (type: string) => {
    switch (type) {
      case 'full_remote':
        return <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-0.5 rounded-full font-medium">عن بعد بالكامل (100%)</span>;
      case 'hybrid':
        return <span className="bg-brand-100 text-brand-800 text-xs px-2.5 py-0.5 rounded-full font-medium">هجين (أيام محددة)</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-medium">{type}</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <Laptop className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              العمل المرن وعقود الساعات والعمل عن بعد (Telework & Flexible)
              <span className="text-xs bg-teal-100 text-teal-800 font-semibold px-2.5 py-0.5 rounded-full">
                حساب نقاط التوطين (نطاقات وقوى)
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              إدارة ورديات العمل بالساعة (مرن)، احتساب وحدات التوطين (كل 168 ساعة = ثلث نقطة)، وتصاريح العمل عن بعد المعتمدة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm shadow-teal-200"
          >
            <Clock className="w-4 h-4" />
            تسجيل ساعات عمل مرن
          </button>
          <button
            onClick={() => setShowPermitModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            تصريح عمل عن بعد
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">إجمالي ساعات العمل المرن</span>
            <Clock className="w-5 h-5 text-teal-500" />
          </div>
          <div className="text-3xl font-black text-slate-800">{flexStats.totalHours?.toLocaleString()} ساعة</div>
          <div className="text-xs text-slate-400 mt-1">
            ساعات السعوديين: {flexStats.saudiFlexHours?.toLocaleString()} ساعة
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">مكاسب نقاط التوطين (نطاقات)</span>
            <Award className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-emerald-600">+{flexStats.nitaqatUnitsGained} نقطة</div>
          <div className="text-xs text-slate-400 mt-1">وفق معادلة قوى (168 ساعة = 0.33 موظف)</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">تصاريح العمل عن بعد المعتمدة</span>
            <Laptop className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{permits.length} موظف</div>
          <div className="text-xs text-purple-600 mt-1">مسجلين في منصة العمل عن بعد الوزارية</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">إجمالي أجور العمل المرن</span>
            <DollarSign className="w-5 h-5 text-brand-500" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{flexStats.totalPaid?.toLocaleString()} ر.س</div>
          <div className="text-xs text-slate-400 mt-1">مستحقات بالساعة بدون التزامات مكافأة نهاية خدمة</div>
        </div>
      </div>

      {/* Rules Notice */}
      <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-5 text-teal-900 space-y-2">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-700" />
          مزايا تنظيم العمل المرن والعمل عن بعد حسب لوائح وزارة الموارد البشرية:
        </h3>
        <p className="text-xs leading-relaxed text-teal-800">
          تتيح عقود العمل المرن للشركات احتساب كل 168 ساعة عمل منجزة من موظف سعودي كـ (ثلث نقطة توطين 0.33) في برنامج نطاقات. لا يخضع العامل المرن لفترة التجربة ولا يستحق إجازات مدفوعة أو مكافأة نهاية خدمة، ويكون الصرف حصراً بناءً على الساعات الفعلية الموثقة في منصة قوى.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('flexible')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'flexible' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          سجل ورديات وساعات العمل المرن ({shifts.length})
        </button>
        <button
          onClick={() => setActiveTab('telework')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'telework' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Laptop className="w-4 h-4" />
          تصاريح العمل عن بعد والإنتاجية ({permits.length})
        </button>
      </div>

      {/* Tab 1: Flexible Shifts */}
      {activeTab === 'flexible' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">سجل الساعات المنجزة وعقود منصة مرن</h2>
            <button
              onClick={() => setShowShiftModal(true)}
              className="flex items-center gap-1.5 text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              تسجيل وردية
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">الموظف</th>
                  <th className="p-3.5">تاريخ الوردية</th>
                  <th className="p-3.5">الساعات المنجزة</th>
                  <th className="p-3.5">أجر الساعة</th>
                  <th className="p-3.5">إجمالي الأجر</th>
                  <th className="p-3.5">مرجع عقد قوى المرن</th>
                  <th className="p-3.5">الاعتماد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map(shift => (
                  <tr key={shift.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{shift.employee_name}</div>
                      <div className="text-xs text-slate-500">{shift.department_name}</div>
                    </td>
                    <td className="p-3.5 text-slate-600 text-xs">{shift.date}</td>
                    <td className="p-3.5 font-bold text-teal-700">{shift.hours_worked} ساعات</td>
                    <td className="p-3.5 text-slate-700">{shift.hourly_rate} ر.س / ساعة</td>
                    <td className="p-3.5 font-bold text-slate-900">{shift.total_pay?.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-mono text-xs text-slate-500">{shift.qiwa_contract_ref}</td>
                    <td className="p-3.5">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                        معتمد ومحتسب في نطاقات
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Telework Permits */}
      {activeTab === 'telework' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">تصاريح العمل عن بعد ومتابعة الإنتاجية</h2>
            <button
              onClick={() => setShowPermitModal(true)}
              className="flex items-center gap-1.5 text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              تصريح جديد
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">الموظف</th>
                  <th className="p-3.5">نوع التصريح</th>
                  <th className="p-3.5">الأيام عن بعد أسبوعياً</th>
                  <th className="p-3.5">تاريخ البداية</th>
                  <th className="p-3.5">تاريخ الانتهاء</th>
                  <th className="p-3.5">مؤشر الإنتاجية الرقمية</th>
                  <th className="p-3.5">حالة التوثيق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permits.map(permit => (
                  <tr key={permit.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{permit.employee_name}</div>
                      <div className="text-xs text-slate-500">{permit.position} • {permit.department_name}</div>
                    </td>
                    <td className="p-3.5">{getPermitBadge(permit.permit_type)}</td>
                    <td className="p-3.5 font-semibold text-slate-700">{permit.remote_days_per_week} أيام</td>
                    <td className="p-3.5 text-xs text-slate-600">{permit.contract_start}</td>
                    <td className="p-3.5 text-xs text-slate-600">{permit.contract_end}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-600">%{permit.productivity_score}</span>
                        <div className="w-16 bg-slate-100 rounded-full h-2">
                          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${permit.productivity_score}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                        موثق في منصة العمل عن بعد
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Shift Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-600" />
                تسجيل وردية عمل مرن بالساعة
              </h3>
              <button onClick={() => setShowShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف بنظام العمل المرن *</label>
                <select
                  required
                  value={shiftForm.employee_id}
                  onChange={e => setShiftForm({ ...shiftForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.position || 'موظف'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ الوردية *</label>
                  <input
                    type="date"
                    required
                    value={shiftForm.date}
                    onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">عدد الساعات *</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={shiftForm.hours_worked}
                    onChange={e => setShiftForm({ ...shiftForm, hours_worked: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">أجر الساعة (ر.س) *</label>
                  <input
                    type="number"
                    required
                    value={shiftForm.hourly_rate}
                    onChange={e => setShiftForm({ ...shiftForm, hourly_rate: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ملاحظات وطبيعة المهام المنجزة</label>
                <input
                  type="text"
                  value={shiftForm.notes}
                  onChange={e => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl"
                >
                  اعتماد الوردية واحتساب النقاط
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Permit Modal */}
      {showPermitModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Laptop className="w-5 h-5 text-teal-600" />
                إصدار تصريح عمل عن بعد معتمد
              </h3>
              <button onClick={() => setShowPermitModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePermit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف *</label>
                <select
                  required
                  value={permitForm.employee_id}
                  onChange={e => setPermitForm({ ...permitForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.position})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">نمط العمل عن بعد</label>
                  <select
                    value={permitForm.permit_type}
                    onChange={e => setPermitForm({ ...permitForm, permit_type: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="hybrid">عمل هجين (أيام بالمكتب وأيام عن بعد)</option>
                    <option value="full_remote">عمل عن بعد دائم بالكامل (100%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">أيام العمل عن بعد أسبوعياً</label>
                  <input
                    type="number"
                    max={5}
                    min={1}
                    value={permitForm.remote_days_per_week}
                    onChange={e => setPermitForm({ ...permitForm, remote_days_per_week: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ بداية التصريح</label>
                  <input
                    type="date"
                    value={permitForm.contract_start}
                    onChange={e => setPermitForm({ ...permitForm, contract_start: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ انتهاء التصريح</label>
                  <input
                    type="date"
                    value={permitForm.contract_end}
                    onChange={e => setPermitForm({ ...permitForm, contract_end: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPermitModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl"
                >
                  إصدار وتوثيق التصريح
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
