import { useState, useEffect } from 'react';
import { Plane, Plus, Search, CheckCircle, XCircle, Clock, Calendar, MessageSquare, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Leave, Employee } from '../types';

export default function LeavesView() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    employee_id: 0,
    type: 'annual',
    start_date: '',
    end_date: '',
    is_paid: 1,
    reason: ''
  });

  const fetchData = async () => {
    const [lRes, eRes] = await Promise.all([
      fetch('/api/leaves'),
      fetch('/api/employees')
    ]);
    const [lData, eData] = await Promise.all([lRes.json(), eRes.json()]);
    setLeaves(lData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    // Calculate days
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    await fetch('/api/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, days })
    });
    
    setIsModalOpen(false);
    setFormData({ employee_id: 0, type: 'annual', start_date: '', end_date: '', is_paid: 1, reason: '' });
    fetchData();
  };

  const handleStatusUpdate = async (id: number, status: 'approved' | 'rejected') => {
    await fetch(`/api/leaves/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchData();
  };

  const filteredLeaves = leaves.filter(l => l.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()));

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'rejected': return 'bg-red-50 text-red-600 border-red-100';
      default: return 'bg-amber-50 text-amber-600 border-amber-100';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة الإجازات</h1>
          <p className="text-slate-500 text-sm">تتبع طلبات الغياب، الإجازات المرضية، والسنوية</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Plus className="w-5 h-5" />
          <span>تقديم طلب إجازة</span>
        </button>
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

      <div className="grid grid-cols-1 gap-4">
        {filteredLeaves.map((leave) => (
          <div key={leave.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-6 group">
            <div className="flex gap-4 items-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Plane className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">{leave.employee_name}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 font-bold mt-1">
                  <span className="bg-slate-100 px-2 py-1 rounded-lg">{leave.type === 'annual' ? 'سنوية' : leave.type === 'sick' ? 'مرضية' : 'اضطرارية'}</span>
                  <span>{leave.days} أيام</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(leave.start_date).toLocaleDateString('ar-EG')}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 max-w-sm px-6 border-x border-slate-50 hidden lg:block">
               <div className="flex items-start gap-2 text-slate-500 italic text-sm">
                  <MessageSquare className="w-4 h-4 mt-1 shrink-0" />
                  <p className="line-clamp-2">{leave.reason || 'لا يوجد سبب مفصل'}</p>
               </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-4 min-w-[200px]">
              <span className={`px-4 py-2 rounded-xl text-xs font-bold border ${getStatusStyle(leave.status)}`}>
                {leave.status === 'approved' ? 'تمت الموافقة' : leave.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
              </span>

              {leave.status === 'pending' && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleStatusUpdate(leave.id, 'approved')}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleStatusUpdate(leave.id, 'rejected')}
                    className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              )}
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
              <h3 className="text-xl font-bold mb-8">تقديم طلب إجازة</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">الموظف</label>
                  <select 
                    value={formData.employee_id}
                    onChange={e => setFormData({ ...formData, employee_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-bold"
                  >
                    <option value="0">اختر موظفاً...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">نوع الإجازة</label>
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-bold"
                    >
                      <option value="annual">سنوية</option>
                      <option value="sick">مرضية</option>
                      <option value="unpaid">بدون راتب</option>
                      <option value="emergency">اضطرارية</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">حالة الراتب</label>
                    <select 
                      value={formData.is_paid}
                      onChange={e => setFormData({ ...formData, is_paid: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-bold"
                    >
                      <option value="1">مدفوعة</option>
                      <option value="0">غير مدفوعة</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">من تاريخ</label>
                    <input 
                      type="date"
                      value={formData.start_date}
                      onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">إلى تاريخ</label>
                    <input 
                      type="date"
                      value={formData.end_date}
                      onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">السبب</label>
                  <textarea 
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right min-h-[100px]"
                    placeholder="اكتب سبب طلب الإجازة هنا..."
                  />
                </div>

                <div className="flex gap-4">
                   <button 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >إلغاء</button>
                   <button 
                    onClick={handleSubmit}
                    className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                  >حفظ الطلب</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
