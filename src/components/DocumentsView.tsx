import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Calendar, User, Trash2, AlertCircle, CheckCircle, ShieldCheck, Download, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EmployeeDocument, Employee } from '../types';

export default function DocumentsView() {
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    employee_id: 0,
    name: '',
    type: 'هوية (National ID)',
    expiry_date: ''
  });

  const fetchData = async () => {
    const [dRes, eRes] = await Promise.all([
      fetch('/api/documents'),
      fetch('/api/employees')
    ]);
    const [dData, eData] = await Promise.all([dRes.json(), eRes.json()]);
    setDocs(dData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    setIsModalOpen(false);
    setFormData({ employee_id: 0, name: '', type: 'هوية (National ID)', expiry_date: '' });
    fetchData();
  };

  const filteredDocs = docs.filter(d => 
    d.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getExpiryStatus = (date: string) => {
    const diff = new Date(date).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'منتهي', color: 'text-red-600 bg-red-50 border-red-100', icon: alert };
    if (days < 30) return { label: 'ينتهي قريباً', color: 'text-amber-600 bg-amber-50 border-amber-100', icon: Clock };
    return { label: 'ساري', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', icon: CheckCircle };
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الأرشيف الإلكتروني</h1>
          <p className="text-slate-500 text-sm">أرشفة وثائق الموظفين (عقود، هويات، شهادات) وتنبيهات الانتهاء</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
        >
          <Plus className="w-5 h-5" />
          <span>رفع وثيقة جديدة</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                 <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">رقمي مؤمن</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800">إجمالي الوثائق</h3>
            <p className="text-3xl font-black text-slate-800 mt-2">{docs.length}</p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-r-4 border-r-amber-400">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                 <AlertCircle className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-800">وثائق تنتهي قريباً</h3>
            <p className="text-3xl font-black text-slate-800 mt-2">
               {docs.filter(d => {
                  const diff = new Date(d.expiry_date).getTime() - new Date().getTime();
                  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                  return days > 0 && days < 30;
               }).length}
            </p>
         </div>
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-r-4 border-r-red-400">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                 <Clock className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-800">وثائق منتهية</h3>
            <p className="text-3xl font-black text-slate-800 mt-2">
               {docs.filter(d => new Date(d.expiry_date) < new Date()).length}
            </p>
         </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center px-4">
        <Search className="w-5 h-5 text-slate-400 ml-4" />
        <input 
          type="text" 
          placeholder="البحث عن وثيقة أو اسم موظف..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-medium text-slate-700 text-right"
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
               <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">اسم الوثيقة</th>
               <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">الموظف</th>
               <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">النوع</th>
               <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">تاريخ الانتهاء</th>
               <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">الحالة</th>
               <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.map(doc => {
              const status = getExpiryStatus(doc.expiry_date);
              return (
                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                       <FileText className="w-8 h-8 text-brand-400 p-1.5 bg-brand-50 rounded-lg" />
                       <span className="font-bold text-slate-800">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-600">{doc.employee_name}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">{doc.type}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono text-sm text-slate-500">
                    {new Date(doc.expiry_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${status.color}`}>
                       {status.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-2">
                       <button className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><Download className="w-4 h-4" /></button>
                       <button className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative"
            >
              <h3 className="text-xl font-bold mb-8">رفع وثيقة جديدة</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">الموظف</label>
                  <select 
                    value={formData.employee_id}
                    onChange={e => setFormData({ ...formData, employee_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                  >
                    <option value="0">اختر موظفاً...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">اسم الوثيقة</label>
                  <input 
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                    placeholder="مثال: صورة الهوية القومية"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">نوع الوثيقة</label>
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                    >
                      <option value="هوية">هوية / جواز سفر</option>
                      <option value="عقد بم">عقد عمل</option>
                      <option value="شهادة">شهادة خبرة / تخرج</option>
                      <option value="أخرى">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">تاريخ الانتهاء</label>
                    <input 
                      type="date"
                      value={formData.expiry_date}
                      onChange={e => setFormData({ ...formData, expiry_date: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold">إلغاء</button>
                   <button onClick={handleSubmit} className="flex-[2] bg-slate-900 text-white py-3 rounded-xl font-bold shadow-xl">رفع وأرشفة</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
