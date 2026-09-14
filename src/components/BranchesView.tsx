import { useState, useEffect, FormEvent } from 'react';
import { Plus, Trash2, MapPin, Building2 } from 'lucide-react';
import type { Branch } from '../types';

export default function BranchesView() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', location: '', latitude: '', longitude: '', geofence_radius_m: 200 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBranch, setEditBranch] = useState({ name: '', location: '', latitude: '', longitude: '', geofence_radius_m: 200 });

  const fetchBranches = () => {
    fetch('/api/branches')
      .then(res => res.json())
      .then(data => setBranches(data))
      .catch(err => console.error("Fetch branches error:", err));
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleAddBranch = async (e: FormEvent) => {
    e.preventDefault();
    await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newBranch, latitude: newBranch.latitude ? Number(newBranch.latitude) : null, longitude: newBranch.longitude ? Number(newBranch.longitude) : null, geofence_radius_m: Number(newBranch.geofence_radius_m) })
    });
    setNewBranch({ name: '', location: '', latitude: '', longitude: '', geofence_radius_m: 200 });
    setIsAdding(false);
    fetchBranches();
  };

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setEditBranch({ name: b.name, location: b.location || '', latitude: b.latitude ?? '', longitude: b.longitude ?? '', geofence_radius_m: b.geofence_radius_m || 200 });
  };

  const saveEdit = async (id: number) => {
    await fetch(`/api/branches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editBranch, latitude: editBranch.latitude ? Number(editBranch.latitude) : null, longitude: editBranch.longitude ? Number(editBranch.longitude) : null, geofence_radius_m: Number(editBranch.geofence_radius_m) })
    });
    setEditingId(null);
    fetchBranches();
  };

  const handleDelete = async (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا الفرع؟')) {
      await fetch(`/api/branches/${id}`, { method: 'DELETE' });
      fetchBranches();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة الفروع</h1>
          <p className="text-slate-500 text-sm">أضف وتحكم في فروع المؤسسة المختلفة</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>فرع جديد</span>
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleAddBranch} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">اسم الفرع</label>
              <input 
                required
                type="text" 
                value={newBranch.name}
                onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="مثال: فرع القاهرة الرئيسي"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">الموقع</label>
              <input 
                required
                type="text" 
                value={newBranch.location}
                onChange={e => setNewBranch({ ...newBranch, location: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="مثال: مدينة نصر، شارع عباس العقاد"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">خط العرض (Latitude)</label>
              <input type="number" step="any" value={newBranch.latitude} onChange={e => setNewBranch({ ...newBranch, latitude: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none" placeholder="مثال: 24.7136" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">خط الطول (Longitude)</label>
              <input type="number" step="any" value={newBranch.longitude} onChange={e => setNewBranch({ ...newBranch, longitude: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none" placeholder="مثال: 46.6753" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">شعاع النطاق (متر)</label>
              <input type="number" value={newBranch.geofence_radius_m} onChange={e => setNewBranch({ ...newBranch, geofence_radius_m: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none" />
            </div>
            <div className="flex gap-2 md:col-span-3">
              <button type="submit" className="flex-1 bg-slate-900 text-white py-2 rounded-xl font-bold">حفظ</button>
              <button type="button" onClick={() => setIsAdding(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map(branch => (
          <div key={branch.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm group hover:border-blue-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-slate-100 p-3 rounded-xl text-slate-600">
                <Building2 className="w-6 h-6" />
              </div>
              <button 
                onClick={() => handleDelete(branch.id)}
                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <h3 className="text-lg font-bold text-slate-800">{branch.name}</h3>
            <div className="flex items-center gap-2 text-slate-500 text-sm mt-2">
              <MapPin className="w-4 h-4" />
              <span>{branch.location}</span>
            </div>
            <div className="mt-3 text-xs text-slate-400 font-mono">
              {branch.latitude != null ? `📍 ${branch.latitude}, ${branch.longitude} · نطاق ${branch.geofence_radius_m}م` : '⚠️ لا توجد إحداثيات (لن يعمل التحقق الجغرافي)'}
            </div>
            <button onClick={() => startEdit(branch)} className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700">✏️ تعديل الإحداثيات</button>
            {editingId === branch.id && (
              <div className="mt-3 space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={editBranch.latitude} onChange={e => setEditBranch({ ...editBranch, latitude: e.target.value })} placeholder="خط العرض" />
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={editBranch.longitude} onChange={e => setEditBranch({ ...editBranch, longitude: e.target.value })} placeholder="خط الطول" />
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={editBranch.geofence_radius_m} onChange={e => setEditBranch({ ...editBranch, geofence_radius_m: Number(e.target.value) })} placeholder="شعاع النطاق (متر)" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(branch.id)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold">حفظ</button>
                  <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-200 text-slate-600 py-2 rounded-lg text-sm font-bold">إلغاء</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {branches.length === 0 && !isAdding && (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">لا توجد فروع مسجلة حالياً</p>
          </div>
        )}
      </div>
    </div>
  );
}
