import { useState, useEffect } from 'react';
import { Laptop, Phone, Car, HardDrive, Plus, Search, User, Calendar, Trash2, Edit2, Shield, X, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Asset, Employee } from '../types';

export default function AssetsView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    type: 'laptop',
    serial_number: ''
  });

  const [assignData, setAssignData] = useState({
    employee_id: 0
  });

  const fetchData = async () => {
    const [aRes, eRes] = await Promise.all([
      fetch('/api/assets'),
      fetch('/api/employees')
    ]);
    const [aData, eData] = await Promise.all([aRes.json(), eRes.json()]);
    setAssets(aData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    setIsModalOpen(false);
    setFormData({ name: '', type: 'laptop', serial_number: '' });
    fetchData();
  };

  const handleAssign = async () => {
    if (!selectedAsset) return;
    await fetch(`/api/assets/${selectedAsset.id}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignData)
    });
    setIsAssignModalOpen(false);
    setSelectedAsset(null);
    setAssignData({ employee_id: 0 });
    fetchData();
  };

  const filteredAssets = assets.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'laptop': return <Laptop className="w-6 h-6" />;
      case 'phone': return <Phone className="w-6 h-6" />;
      case 'car': return <Car className="w-6 h-6" />;
      default: return <HardDrive className="w-6 h-6" />;
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة الأصول والعهدة</h1>
          <p className="text-slate-500 text-sm">تسجيل الأجهزة والمعدات المسلمة للموظفين</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة أصل جديد</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center px-4">
        <Search className="w-5 h-5 text-slate-400 ml-4" />
        <input 
          type="text" 
          placeholder="البحث عن جهاز باسمه أو الرقم التسلسلي..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-medium text-slate-700 text-right"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAssets.map((asset) => (
          <div key={asset.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className={`absolute left-0 top-0 w-1 h-full ${asset.status === 'assigned' ? 'bg-brand-500' : 'bg-emerald-500'}`} />
            
            <div className="flex justify-between items-start mb-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${asset.status === 'assigned' ? 'bg-brand-50 text-brand-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {getAssetIcon(asset.type)}
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${asset.status === 'assigned' ? 'bg-brand-50 text-brand-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {asset.status === 'assigned' ? 'بعهدة موظف' : 'متاح'}
              </span>
            </div>

            <h3 className="text-lg font-bold text-slate-800 mb-1">{asset.name}</h3>
            <p className="text-xs text-slate-400 font-mono mb-6">S/N: {asset.serial_number}</p>

            <div className="border-t border-slate-50 pt-4 flex items-center gap-3">
              {asset.status === 'assigned' ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {asset.assigned_to_name?.[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">العهدة مع</p>
                    <p className="text-sm font-bold text-slate-800">{asset.assigned_to_name}</p>
                  </div>
                </>
              ) : (
                <button 
                  onClick={() => { setSelectedAsset(asset); setIsAssignModalOpen(true); }}
                  className="flex-1 bg-slate-50 text-slate-600 py-2 rounded-xl text-xs font-bold hover:bg-brand-600 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <User className="w-3 h-3" />
                  تسليم لعهدة موظف
                </button>
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
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative"
            >
              <h3 className="text-xl font-bold mb-8">إضافة أصل جديد للنظام</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">اسم الجهاز</label>
                  <input 
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                    placeholder="مثال: MacBook Pro 14"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">النوع</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                  >
                    <option value="laptop">لابتوب / كمبيوتر</option>
                    <option value="phone">هاتف محمول</option>
                    <option value="car">سيارة شركة</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">الرقم التسلسلي (S/N)</label>
                  <input 
                    type="text"
                    value={formData.serial_number}
                    onChange={e => setFormData({ ...formData, serial_number: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-mono"
                  />
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold">إلغاء</button>
                   <button onClick={handleSubmit} className="flex-[2] bg-slate-900 text-white py-3 rounded-xl font-bold shadow-xl">حفظ</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isAssignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative"
            >
              <h3 className="text-xl font-bold mb-8">تسليم عهدة</h3>
              <p className="text-slate-400 text-sm mb-6 font-bold">سيتم تسجيل "{selectedAsset?.name}" بعهدة الموظف:</p>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">اختر الموظف</label>
                  <select 
                    value={assignData.employee_id}
                    onChange={e => setAssignData({ ...assignData, employee_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold"
                  >
                    <option value="0">اختر...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <button 
                  onClick={handleAssign}
                  className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold shadow-xl shadow-brand-100"
                >تأكيد العملية</button>
                <button onClick={() => setIsAssignModalOpen(false)} className="w-full text-slate-400 font-bold text-xs uppercase">إلغاء</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
