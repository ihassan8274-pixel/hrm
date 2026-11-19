import { useState, useEffect } from 'react';
import { TrendingUp, Plus, Search, Star, MessageCircle, Calendar, Filter, User, Target, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Appraisal, Employee } from '../types';

export default function PerformanceView() {
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    employee_id: 0,
    rating: 5,
    comments: '',
    period: 'سنوي (Annual)',
    appraisal_date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    const [aRes, eRes] = await Promise.all([
      fetch('/api/appraisals'),
      fetch('/api/employees')
    ]);
    const [aData, eData] = await Promise.all([aRes.json(), eRes.json()]);
    setAppraisals(aData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    await fetch('/api/appraisals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    setIsModalOpen(false);
    setFormData({ ...formData, employee_id: 0, comments: '' });
    fetchData();
  };

  const getRatingStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className={`w-3 h-3 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
        ))}
      </div>
    );
  };

  const filteredAppraisals = appraisals.filter(a => a.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">تقييم الأداء</h1>
          <p className="text-slate-500 text-sm">متابعة الأهداف ومستوى الكفاءة السنوي</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-brand-100 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>إجراء تقييم جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
               <Target className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-400 mb-1">متوسط التقييم</h4>
            <p className="text-2xl font-black text-slate-800">4.7 <span className="text-xs font-medium">/ 5</span></p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
               <TrendingUp className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-400 mb-1">نمو الأداء</h4>
            <p className="text-2xl font-black text-slate-800">+12%</p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center md:col-span-2">
            <div className="w-full flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6" />
               </div>
               <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800">موظف الشهر المثالي</h4>
                  <p className="text-xs text-slate-400">بناءً على نتائج التقييمات الأخيرة</p>
                  <p className="text-sm font-bold text-brand-600 mt-1">ياسين محمد - إدارة الموارد البشرية</p>
               </div>
            </div>
         </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center px-4">
        <Search className="w-5 h-5 text-slate-400 ml-4" />
        <input 
          type="text" 
          placeholder="البحث عن موظف..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-medium text-slate-700 text-right"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredAppraisals.map((app) => (
          <div key={app.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex gap-6">
            <div className="flex flex-col items-center gap-2">
               <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 font-bold text-xl">
                  {app.employee_name?.[0]}
               </div>
               <div className="bg-brand-50 text-brand-600 text-[10px] font-bold px-2 py-1 rounded-lg">
                  {app.period}
               </div>
            </div>
            
            <div className="flex-1 space-y-3">
               <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800">{app.employee_name}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase mt-1">
                       <Calendar className="w-3 h-3" />
                       {new Date(app.appraisal_date).toLocaleDateString()}
                    </div>
                  </div>
                  {getRatingStars(app.rating)}
               </div>

               <div className="bg-slate-50 p-4 rounded-2xl text-slate-600 text-sm italic relative">
                  <MessageCircle className="w-4 h-4 text-slate-200 absolute -right-2 -top-2" />
                  <p className="line-clamp-3">"{app.comments || 'لا توجد ملاحظات مفصلة...'}"</p>
               </div>
               
               <div className="flex gap-2">
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 font-bold px-2 py-1 rounded-lg">تطوير مستمر</span>
                  <span className="text-[10px] bg-brand-50 text-brand-600 font-bold px-2 py-1 rounded-lg">قائد فريق</span>
               </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
            >
              <h3 className="text-xl font-bold mb-8">تسجيل تقييم أداء</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">الموظف المراد تقييمه</label>
                  <select 
                    value={formData.employee_id}
                    onChange={e => setFormData({ ...formData, employee_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                  >
                    <option value="0">اختر موظفاً...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">الدرجة (1-5)</label>
                    <div className="flex gap-2">
                       {[1, 2, 3, 4, 5].map(v => (
                         <button 
                          key={v}
                          onClick={() => setFormData({...formData, rating: v})}
                          className={`flex-1 py-3 rounded-xl font-bold transition-all ${formData.rating === v ? 'bg-amber-400 text-white shadow-lg shadow-amber-100' : 'bg-slate-50 text-slate-400'}`}
                         >{v}</button>
                       ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">دورية التقييم</label>
                    <select 
                      value={formData.period}
                      onChange={e => setFormData({ ...formData, period: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                    >
                      <option value="ربع سنوي (Q1)">ربع سنوي (Q1)</option>
                      <option value="ربع سنوي (Q2)">ربع سنوي (Q2)</option>
                      <option value="نصف سنوي">نصف سنوي</option>
                      <option value="سنوي (Annual)">سنوي (Annual)</option>
                      <option value="بعد الاختبار">بعد فترة الاختبار</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">التوصيات والملاحظات العلمية</label>
                  <textarea 
                    value={formData.comments}
                    onChange={e => setFormData({ ...formData, comments: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right min-h-[120px]"
                    placeholder="اكتب نقاط القوة والضعف ومقترحات التحسين..."
                  />
                </div>

                <div className="flex gap-4">
                   <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 py-4 rounded-2xl font-bold text-slate-600">إلغاء</button>
                   <button onClick={handleSubmit} className="flex-[2] bg-brand-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-brand-100">حفظ التقييم واعتماده</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
