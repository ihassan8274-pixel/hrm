import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, User, ArrowRight, DollarSign, Calendar, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Promotion {
  id: number;
  employee_id: number;
  employee_name: string;
  old_position: string;
  new_position: string;
  old_salary: number;
  new_salary: number;
  promotion_date: string;
  created_at: string;
}

export default function PromotionsView() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ 
    employee_id: '', 
    old_position: '', 
    new_position: '', 
    old_salary: 0, 
    new_salary: 0, 
    promotion_date: new Date().toISOString().split('T')[0],
    appraisal_id: '',
    training_enrollment_id: '',
  });

  const fetchData = async () => {
    const [pRes, eRes, aRes, tRes] = await Promise.all([
      fetch('/api/promotions'),
      fetch('/api/employees'),
      fetch('/api/appraisals'),
      fetch('/api/training/enrollments?status=completed'),
    ]);
    const [p, e, a, t] = await Promise.all([
      pRes.json().catch(() => []),
      eRes.json().catch(() => []),
      aRes.json().catch(() => []),
      tRes.json().catch(() => []),
    ]);
    setPromotions(Array.isArray(p) ? p : []);
    setEmployees(Array.isArray(e) ? e : []);
    setAppraisals(Array.isArray(a) ? a : []);
    setEnrollments(Array.isArray(t) ? t : []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEmployeeChange = (id: string) => {
    const emp = employees.find(e => e.id === Number(id));
    if (emp) {
      setForm({
        ...form,
        employee_id: id,
        old_position: emp.position,
        old_salary: emp.salary,
        new_position: emp.position,
        new_salary: emp.salary,
        appraisal_id: '',
        training_enrollment_id: '',
      });
    }
  };

  const employeeAppraisals = appraisals.filter(a => Number(a.employee_id) === Number(form.employee_id));
  const employeeCertificates = enrollments.filter(e => Number(e.employee_id) === Number(form.employee_id) && e.certificate_number);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        employee_id: Number(form.employee_id),
        appraisal_id: form.appraisal_id ? Number(form.appraisal_id) : undefined,
        training_enrollment_id: form.training_enrollment_id ? Number(form.training_enrollment_id) : undefined,
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'تعذّر تسجيل الترقية');
      return;
    }
    setIsAdding(false);
    fetchData();
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-800">المسار الوظيفي والترقيات</h2>
          <p className="text-slate-500 text-sm mt-1">إدارة الترقيات وتغيير المسميات الوظيفية والرواتب</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة ترقية/تغيير</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-500 text-xs font-black uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4">الموظف</th>
              <th className="px-6 py-4">المسمى الوظيفي</th>
              <th className="px-6 py-4">الراتب (قبل/بعد)</th>
              <th className="px-6 py-4">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {promotions.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-800">{p.employee_name}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{p.old_position}</span>
                    <ArrowRight className="w-3 h-3 text-brand-400" />
                    <span className="text-sm font-bold text-brand-600">{p.new_position}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{(p.old_salary || 0).toLocaleString()}</span>
                    <ArrowRight className="w-3 h-3 text-brand-400" />
                    <span className="text-sm font-black text-emerald-600">{(p.new_salary || 0).toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-slate-500">{new Date(p.promotion_date).toLocaleDateString('ar-EG')}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-black text-slate-800 mb-6 font-sans">تسجيل ترقية/تغيير وظيفي</h3>
            <form onSubmit={handleSubmit} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">الموظف</label>
                <select 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                  value={form.employee_id}
                  onChange={e => handleEmployeeChange(e.target.value)}
                >
                  <option value="">اختر الموظف</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">المسمى الحالي</label>
                  <input readOnly className="w-full px-4 py-3 bg-slate-100 border border-slate-100 rounded-xl font-bold text-slate-400" value={form.old_position} />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">المسمى الجديد</label>
                  <input 
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                    value={form.new_position}
                    onChange={e => setForm({...form, new_position: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">الراتب الحالي</label>
                  <input readOnly className="w-full px-4 py-3 bg-slate-100 border border-slate-100 rounded-xl font-bold text-slate-400" value={form.old_salary} />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">الراتب الجديد</label>
                  <input 
                    type="number"
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                    value={form.new_salary}
                    onChange={e => setForm({...form, new_salary: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">تاريخ التنفيذ</label>
                <input 
                  type="date"
                  required
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                  value={form.promotion_date}
                  onChange={e => setForm({...form, promotion_date: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">تقييم الأداء المعتمد</label>
                  <select
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700 text-sm"
                    value={form.appraisal_id}
                    onChange={e => setForm({...form, appraisal_id: e.target.value})}
                  >
                    <option value="">أحدث تقييم مسجل</option>
                    {employeeAppraisals.map(a => <option key={a.id} value={a.id}>{a.rating} — {a.period || a.appraisal_date || a.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">شهادة التدريب ذات الصلة</label>
                  <select
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700 text-sm"
                    value={form.training_enrollment_id}
                    onChange={e => setForm({...form, training_enrollment_id: e.target.value})}
                  >
                    <option value="">أحدث شهادة مكتملة</option>
                    {employeeCertificates.map(t => <option key={t.id} value={t.id}>{t.course_title || 'دورة'} — {t.certificate_number}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-3">
                لا تُعدّل الترقية الراتب أو المسمى إلا بعد التحقق من تقييم أداء (≥ 3) وشهادة تدريب مكتملة؛ يُرفض الطلب مع سبب واضح إذا غاب أي منهما.
              </p>
              {error && <div className="bg-rose-50 text-rose-700 rounded-xl p-3 text-xs font-bold">{error}</div>}

              <div className="flex gap-3 pt-6">
                <button type="submit" className="flex-1 bg-brand-600 text-white py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100">حفظ التغييرات</button>
                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
