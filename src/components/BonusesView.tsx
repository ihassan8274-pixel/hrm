import { useState, useEffect } from 'react';
import { Sparkles, MinusCircle, Search, User, Trash2, Plus, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import type { BonusPenalty, Employee } from '../types';
import { Btn, Modal, FormField, ConfirmDialog, EmptyState } from './ui';

export default function BonusesView() {
  const [items, setItems] = useState<BonusPenalty[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BonusPenalty | null>(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    employee_id: 0,
    type: 'bonus' as 'bonus' | 'penalty',
    amount: 0,
    reason: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const fetchData = async () => {
    const [iRes, eRes] = await Promise.all([
      fetch(`/api/bonuses-penalties?month=${month}&year=${year}`),
      fetch('/api/employees')
    ]);
    const [iData, eData] = await Promise.all([iRes.json(), eRes.json()]);
    setItems(iData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const handleSubmit = async () => {
    await fetch('/api/bonuses-penalties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, month, year })
    });
    setIsModalOpen(false);
    setFormData({ ...formData, employee_id: 0, amount: 0, reason: '' });
    fetchData();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/bonuses-penalties/${id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    fetchData();
  };

  const filteredItems = items.filter(i => i.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()));
  const bonuses = filteredItems.filter(i => i.type === 'bonus');
  const penalties = filteredItems.filter(i => i.type === 'penalty');

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">المكافآت والجزاءات</h1>
          <p className="text-slate-500 text-sm">إدارة المتغيرات الشهرية المؤثرة على الراتب</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent border-none outline-none font-bold" aria-label="الشهر">
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
            </select>
            <span className="text-slate-300">/</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent border-none outline-none font-bold" aria-label="السنة">
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          <Btn
            onClick={() => setIsModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-200"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة متغير جديد</span>
          </Btn>
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

      {filteredItems.length === 0 ? (
        <EmptyState
          title={`لا توجد مكافآت ولا جزاءات في ${month}/${year}`}
          description="المكافآت والجزاءات متغيرات شهرية تُضاف إلى مسير الرواتب أو تُخصم منه. أضف أول متغير لهذا الشهر."
          action={
            <Btn onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800">
              <Plus className="w-5 h-5" />
              <span>إضافة متغير جديد</span>
            </Btn>
          }
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bonuses List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-emerald-600">
             <Sparkles className="w-5 h-5" />
             المكافآت والزيادت
          </h3>
          <div className="space-y-3">
            {bonuses.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border-r-4 border-emerald-500 border border-slate-100 shadow-sm flex justify-between items-center group">
                 <div className="flex gap-4 items-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
                       {item.employee_name?.[0]}
                    </div>
                    <div>
                       <p className="text-sm font-bold text-slate-800">{item.employee_name}</p>
                       <p className="text-xs text-slate-400">{item.reason}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-left py-1 px-3 bg-emerald-50 text-emerald-700 rounded-lg font-mono font-bold">
                       +{item.amount.toLocaleString()}
                    </div>
                    <button onClick={() => setDeleteTarget(item)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="حذف">
                       <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            ))}
          </div>
        </div>

        {/* Penalties List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-red-600">
             <MinusCircle className="w-5 h-5" />
             الجزاءات والخصومات
          </h3>
          <div className="space-y-3">
            {penalties.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border-r-4 border-red-500 border border-slate-100 shadow-sm flex justify-between items-center group">
                 <div className="flex gap-4 items-center">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 font-bold">
                       {item.employee_name?.[0]}
                    </div>
                    <div>
                       <p className="text-sm font-bold text-slate-800">{item.employee_name}</p>
                       <p className="text-xs text-slate-400">{item.reason}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-left py-1 px-3 bg-red-50 text-red-700 rounded-lg font-mono font-bold">
                       -{item.amount.toLocaleString()}
                    </div>
                    <button onClick={() => setDeleteTarget(item)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="حذف">
                       <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <Modal
            title={
              <span className="flex items-center gap-2">
                <DollarSign className="text-brand-600" />
                إضافة متغير مالي للشهر الحالي
              </span>
            }
            onClose={() => setIsModalOpen(false)}
          >
            <div className="space-y-6">
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                 <button 
                  onClick={() => setFormData({...formData, type: 'bonus'})}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${formData.type === 'bonus' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}
                 >مكافأة</button>
                 <button 
                  onClick={() => setFormData({...formData, type: 'penalty'})}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${formData.type === 'penalty' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}
                 >جزاء</button>
              </div>

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
                  label="المبلغ"
                  type="number"
                  value={formData.amount}
                  onChange={(value) => setFormData({ ...formData, amount: Number(value) })}
                  className="font-mono"
                />
                <FormField
                  half
                  label="السبب"
                  value={formData.reason}
                  onChange={(value) => setFormData({ ...formData, reason: value })}
                />
              </div>

              <div className="bg-amber-50 p-4 rounded-2xl flex gap-3 text-amber-700 text-xs font-medium border border-amber-100">
                 <AlertCircle className="w-4 h-4 shrink-0" />
                 <p>سيتم صرف هذا المبلغ أو خصمه تلقائياً عند توليد مسير رواتب شهر {month}/{year}</p>
              </div>

              <Btn
                onClick={handleSubmit}
                className="w-full bg-slate-900 hover:bg-slate-800 active:scale-95 shadow-xl shadow-slate-200"
              >
                اعتماد الإجراء
              </Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.type === 'penalty' ? 'حذف الجزاء' : 'حذف المكافأة'}
        message={`سيُحذف «${deleteTarget?.type === 'penalty' ? 'الجزاء' : 'المكافأة'}» الخاص بـ ${deleteTarget?.employee_name ?? ""} بمبلغ ${deleteTarget?.amount.toLocaleString() ?? 0}.`}
        confirmLabel="حذف"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
