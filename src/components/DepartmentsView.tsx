import { useState, useEffect } from 'react';
import { Building2, Plus, Search, User, Trash2, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Department, Employee } from '../types';

export default function DepartmentsView() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    manager_id: 0
  });

  const fetchData = async () => {
    const [dRes, eRes] = await Promise.all([
      fetch('/api/departments'),
      fetch('/api/employees')
    ]);
    const [dData, eData] = await Promise.all([dRes.json(), eRes.json()]);
    setDepartments(dData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    const url = editingId ? `/api/departments/${editingId}` : '/api/departments';
    const method = editingId ? 'PUT' : 'POST';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ name: '', manager_id: 0 });
    fetchData();
  };

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id);
    setFormData({ name: dept.name, manager_id: dept.manager_id || 0 });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الإدارة؟')) return;
    await fetch(`/api/departments/${id}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الهيكل التنظيمي (الإدارات)</h1>
          <p className="text-slate-500 text-sm">إدارة أقسام المؤسسة وتعيين المدراء</p>
        </div>
        <button 
          onClick={() => { setEditingId(null); setFormData({name:'', manager_id:0}); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة إدارة جديدة</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => {
          const manager = employees.find(e => e.id === dept.manager_id);
          const deptEmployees = employees.filter(e => e.department_id === dept.id);
          
          return (
            <div key={dept.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative group">
              <div className="absolute left-4 top-4 hidden group-hover:flex gap-2">
                 <button onClick={() => handleEdit(dept)} className="p-2 bg-slate-50 text-slate-400 hover:text-brand-600 rounded-full transition-colors">
                   <Edit2 className="w-4 h-4" />
                 </button>
                 <button onClick={() => handleDelete(dept.id)} className="p-2 bg-slate-50 text-slate-400 hover:text-red-600 rounded-full transition-colors">
                   <Trash2 className="w-4 h-4" />
                 </button>
              </div>

              <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 mb-4">
                 <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">{dept.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
                 <User className="w-3 h-3" />
                 <span>المدير: {manager?.name || 'غير محدد'}</span>
              </div>

              <div className="flex justify-between items-end border-t border-slate-50 pt-4">
                 <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">عدد الموظفين</p>
                    <p className="text-xl font-bold text-slate-800">{deptEmployees.length}</p>
                 </div>
                 <div className="flex -space-x-2">
                    {deptEmployees.slice(0, 3).map((e, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {e.name[0]}
                      </div>
                    ))}
                    {deptEmployees.length > 3 && (
                      <div className="w-8 h-8 rounded-full bg-brand-600 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                        +{deptEmployees.length - 3}
                      </div>
                    )}
                 </div>
              </div>
            </div>
          );
        })}
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
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute left-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-bold mb-8">
                {editingId ? 'تعديل إدارة' : 'إضافة إدارة جديدة'}
              </h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">اسم الإدارة</label>
                  <input 
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                    placeholder="مثل: إدارة الموارد البشرية"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">مدير الإدارة</label>
                  <select 
                    value={formData.manager_id}
                    onChange={e => setFormData({ ...formData, manager_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                  >
                    <option value="0">اختر موظفاً (اختياري)</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <button 
                  onClick={handleSubmit}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
                >
                  حفظ البيانات
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
