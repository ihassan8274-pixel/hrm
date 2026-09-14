import { useState, useEffect, FormEvent } from 'react';
import { Plus, Trash2, Tag, Edit2 } from 'lucide-react';
import type { AllowanceType } from '../types';

export default function AllowanceTypesView() {
  const [types, setTypes] = useState<AllowanceType[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const fetchTypes = () => {
    fetch('/api/allowance-types')
      .then(res => res.json())
      .then(data => setTypes(data))
      .catch(err => console.error("Fetch allowance types error:", err));
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const url = editingId ? `/api/allowance-types/${editingId}` : '/api/allowance-types';
    const method = editingId ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    setNewName('');
    setIsAdding(false);
    setEditingId(null);
    fetchTypes();
  };

  const handleDelete = async (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا النوع؟ سيؤثر هذا على جميع الموظفين المرتبطين به.')) {
      await fetch(`/api/allowance-types/${id}`, { method: 'DELETE' });
      fetchTypes();
    }
  };

  const handleEdit = (type: AllowanceType) => {
    setEditingId(type.id);
    setNewName(type.name);
    setIsAdding(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">تكويد البدلات</h1>
          <p className="text-slate-500 text-sm">حدد أنواع البدلات المتاحة في المؤسسة</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setNewName('');
            setIsAdding(true);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>نوع جديد</span>
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-2">اسم البدل</label>
              <input 
                required
                type="text" 
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                placeholder="مثال: بدل سكن، بدل تمثيل، بدل مخاطر"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="submit" className="px-8 bg-slate-900 text-white py-2 rounded-xl font-bold">
                {editingId ? 'تحديث' : 'حفظ'}
              </button>
              <button type="button" onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-8 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map(type => (
          <div key={type.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-indigo-100 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Tag className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800">{type.name}</span>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => handleEdit(type)}
                className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all rounded-lg"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleDelete(type.id)}
                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {types.length === 0 && !isAdding && (
          <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">لم يتم تعريف أنواع بدلات بعد</p>
          </div>
        )}
      </div>
    </div>
  );
}
