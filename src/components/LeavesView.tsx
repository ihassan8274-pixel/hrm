import { useState, useEffect } from 'react';
import { Plane, Plus, Search, CheckCircle, XCircle, Clock, Calendar, MessageSquare, User } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Modal, FormField } from './ui';
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
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100"
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
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
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
                    className="p-2 bg-emerald-50 text-brand-600 rounded-xl hover:bg-brand-600 hover:text-white transition-all shadow-sm"
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
          <Modal title="تقديم طلب إجازة" onClose={() => setIsModalOpen(false)}>
            <div className="space-y-6">
              <FormField
                label="الموظف"
                required
                options={[
                  { value: 0, label: "اختر موظفاً..." },
                  ...employees.map((e) => ({ value: e.id, label: e.name })),
                ]}
                value={formData.employee_id}
                onChange={(value) => setFormData({ ...formData, employee_id: Number(value) })}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  half
                  label="نوع الإجازة"
                  options={[
                    { value: "annual", label: "سنوية" },
                    { value: "sick", label: "مرضية" },
                    { value: "unpaid", label: "بدون راتب" },
                    { value: "emergency", label: "اضطرارية" },
                  ]}
                  value={formData.type}
                  onChange={(value) => setFormData({ ...formData, type: value })}
                />
                <FormField
                  half
                  label="حالة الراتب"
                  options={[
                    { value: 1, label: "مدفوعة" },
                    { value: 0, label: "غير مدفوعة" },
                  ]}
                  value={formData.is_paid}
                  onChange={(value) => setFormData({ ...formData, is_paid: Number(value) })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  half
                  label="من تاريخ"
                  type="date"
                  value={formData.start_date}
                  onChange={(value) => setFormData({ ...formData, start_date: value })}
                />
                <FormField
                  half
                  label="إلى تاريخ"
                  type="date"
                  value={formData.end_date}
                  onChange={(value) => setFormData({ ...formData, end_date: value })}
                />
              </div>

              <FormField
                label="السبب"
                type="textarea"
                value={formData.reason}
                onChange={(value) => setFormData({ ...formData, reason: value })}
                placeholder="اكتب سبب طلب الإجازة هنا..."
                className="min-h-[100px]"
              />

              <div className="flex gap-4">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >إلغاء</button>
                <button
                  onClick={handleSubmit}
                  className="flex-[2] bg-brand-600 text-white py-4 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-xl shadow-brand-100"
                >حفظ الطلب</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
