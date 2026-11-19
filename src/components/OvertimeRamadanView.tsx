import { useState, useEffect, FormEvent } from 'react';
import { 
  Clock, Plus, CheckCircle, Moon, Sun, AlertTriangle, 
  Trash2, RefreshCw, Calendar, ArrowRight, ShieldCheck, DollarSign
} from 'lucide-react';
import type { OvertimeRecord } from '../types';

export default function OvertimeRamadanView() {
  const [overtimes, setOvertimes] = useState<OvertimeRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [ramadanPolicy, setRamadanPolicy] = useState<{
    ramadan_mode: boolean;
    ramadan_working_hours: number;
    standard_working_hours: number;
  }>({
    ramadan_mode: false,
    ramadan_working_hours: 6,
    standard_working_hours: 8
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [form, setForm] = useState({
    employee_id: 0,
    date: new Date().toISOString().split('T')[0],
    normal_hours: 2,
    weekend_hours: 0,
    holiday_hours: 0,
    reason: 'إنجاز تسليمات عاجلة لمشروع العميل'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [oRes, eRes, pRes] = await Promise.all([
        fetch('/api/overtime'),
        fetch('/api/employees'),
        fetch('/api/policies/ramadan')
      ]);
      const [oData, eData, pData] = await Promise.all([
        oRes.json(),
        eRes.json(),
        pRes.json()
      ]);
      setOvertimes(oData || []);
      setEmployees(eData || []);
      if (pData) setRamadanPolicy(pData);
    } catch (err) {
      console.error("Error loading overtime data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleRamadan = async () => {
    const newMode = !ramadanPolicy.ramadan_mode;
    try {
      await fetch('/api/policies/ramadan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ramadanPolicy,
          ramadan_mode: newMode
        })
      });
      setRamadanPolicy(prev => ({ ...prev, ramadan_mode: newMode }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitOvertime = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.employee_id) return alert('يرجى اختيار الموظف');

    try {
      const res = await fetch('/api/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setForm({
          employee_id: 0,
          date: new Date().toISOString().split('T')[0],
          normal_hours: 2,
          weekend_hours: 0,
          holiday_hours: 0,
          reason: 'إنجاز تسليمات عاجلة لمشروع العميل'
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`/api/overtime/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      await fetch(`/api/overtime/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const totalOvertimePending = overtimes.filter(o => o.status === 'pending').reduce((sum, o) => sum + o.total_overtime_pay, 0);
  const totalOvertimeApproved = overtimes.filter(o => o.status === 'approved').reduce((sum, o) => sum + o.total_overtime_pay, 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Ramadan Mode Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            ramadanPolicy.ramadan_mode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {ramadanPolicy.ramadan_mode ? <Moon className="w-7 h-7" /> : <Sun className="w-7 h-7" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-800">
                نظام ساعات العمل في شهر رمضان المبارك (المادة 98)
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                ramadanPolicy.ramadan_mode 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {ramadanPolicy.ramadan_mode ? 'مفعل حالياً (6 ساعات/يوم)' : 'غير مفعل (8 ساعات اعتيادية)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              تطبيق قرار وزارة الموارد البشرية بتخفيض ساعات العمل الفعلية للمسلمين إلى 6 ساعات يومياً أو 36 ساعة أسبوعياً، واحتساب أي ساعة عمل إضافية بمعدل 150%.
            </p>
          </div>
        </div>

        <button
          onClick={handleToggleRamadan}
          className={`px-6 py-2.5 rounded-2xl text-xs font-black transition-all shadow-md ${
            ramadanPolicy.ramadan_mode 
              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30' 
              : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/30'
          }`}
        >
          {ramadanPolicy.ramadan_mode ? 'إيقاف وضع رمضان (العودة إلى 8 ساعات)' : 'تفعيل وضع شهر رمضان (6 ساعات)'}
        </button>
      </div>

      {/* Metrics and Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block">إجمالي سجلات العمل الإضافي</span>
          <h4 className="text-2xl font-black text-slate-800 mt-1">{overtimes.length}</h4>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block">مستحقات بانتظار الاعتماد</span>
          <h4 className="text-2xl font-black text-amber-600 mt-1">
            {totalOvertimePending.toLocaleString()} <span className="text-xs font-normal">ر.س</span>
          </h4>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 block">مستحقات معتمدة ومدرجة بالراتب</span>
          <h4 className="text-2xl font-black text-emerald-600 mt-1">
            {totalOvertimeApproved.toLocaleString()} <span className="text-xs font-normal">ر.س</span>
          </h4>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex justify-between items-center pb-2">
          <h3 className="text-sm font-black text-slate-800">
            سجلات الساعات الإضافية وقيمة الأجر (المادة 107)
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-600/20"
            >
              <Plus className="w-4 h-4" />
              تسجيل عمل إضافي
            </button>
            <button
              onClick={fetchData}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">ساعات عادية (150%)</th>
                <th className="p-3.5">ساعات عطلة (150%)</th>
                <th className="p-3.5">ساعات أعياد (200%)</th>
                <th className="p-3.5">أجر الساعة الأساسي</th>
                <th className="p-3.5 bg-emerald-50 text-emerald-950 font-black">إجمالي المستحق</th>
                <th className="p-3.5">السبب / المهمة</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overtimes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                    لا توجد سجلات عمل إضافي مسجلة
                  </td>
                </tr>
              ) : (
                overtimes.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-slate-800">{o.employee_name}</td>
                    <td className="p-3.5 font-mono text-slate-600">{o.date}</td>
                    <td className="p-3.5 font-bold text-slate-700">{o.normal_hours} س</td>
                    <td className="p-3.5 font-bold text-slate-700">{o.weekend_hours} س</td>
                    <td className="p-3.5 font-bold text-slate-700">{o.holiday_hours} س</td>
                    <td className="p-3.5 font-mono text-slate-600">{o.hourly_rate} ر.س/س</td>
                    <td className="p-3.5 font-black text-emerald-700 bg-emerald-50/40">
                      {o.total_overtime_pay.toLocaleString()} ر.س
                    </td>
                    <td className="p-3.5 text-slate-600 max-w-xs truncate">{o.reason}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        o.status === 'approved' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {o.status === 'approved' ? 'معتمد ومضاف للراتب' : 'بانتظار الاعتماد'}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        {o.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(o.id)}
                            className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[10px] font-bold shadow-sm"
                          >
                            اعتماد وصرف
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
            <h3 className="text-lg font-black text-slate-800">تسجيل عمل إضافي (المادة 107)</h3>
            <form onSubmit={handleSubmitOvertime} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف</label>
                <select
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} - الراتب: {e.basic_salary} ر.س</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ العمل الإضافي</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ساعات عادية (150%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.normal_hours}
                    onChange={(e) => setForm({ ...form, normal_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ساعات نهاية أسبوع</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.weekend_hours}
                    onChange={(e) => setForm({ ...form, weekend_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">أعياد وعطل رسمية</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.holiday_hours}
                    onChange={(e) => setForm({ ...form, holiday_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب / مبرر التكليف بالعمل الإضافي</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black shadow-md shadow-brand-600/20"
                >
                  حفظ واحتساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
