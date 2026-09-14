import React, { useState, useEffect } from 'react';
import { 
  Laptop, 
  Smartphone, 
  CreditCard, 
  Key, 
  Car, 
  Wrench, 
  QrCode, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Plus, 
  UserCheck, 
  Printer, 
  X, 
  Search, 
  Filter,
  ArrowRightLeft,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { SmartAssetRecord } from '../types';

interface SmartAssetsViewProps {
  onBack?: () => void;
}

export const SmartAssetsView: React.FC<SmartAssetsViewProps> = () => {
  const [assets, setAssets] = useState<SmartAssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAssetForQR, setSelectedAssetForQR] = useState<SmartAssetRecord | null>(null);
  const [selectedAssetForAssign, setSelectedAssetForAssign] = useState<SmartAssetRecord | null>(null);

  const [newAsset, setNewAsset] = useState({
    name: '',
    category: 'laptop' as const,
    brand_model: '',
    serial_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_value: 4500,
    current_assigned_to: 1,
    condition: 'new' as const
  });

  const [assignForm, setAssignForm] = useState({
    employee_id: 1,
    condition: 'good' as const,
    status: 'assigned' as const
  });

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/smart-assets');
      if (res.ok) setAssets(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/smart-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAsset)
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewAsset({
          name: '',
          category: 'laptop',
          brand_model: '',
          serial_number: '',
          purchase_date: new Date().toISOString().split('T')[0],
          purchase_value: 4500,
          current_assigned_to: 1,
          condition: 'new'
        });
        fetchAssets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetForAssign) return;

    try {
      const res = await fetch(`/api/smart-assets/${selectedAssetForAssign.id}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_assigned_to: assignForm.status === 'in_stock' ? null : assignForm.employee_id,
          status: assignForm.status,
          condition: assignForm.condition
        })
      });
      if (res.ok) {
        setSelectedAssetForAssign(null);
        fetchAssets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredAssets = assets.filter(a => {
    const matchSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        a.asset_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        a.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (a.assigned_employee_name && a.assigned_employee_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchCat = selectedCategory === 'all' || a.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'laptop': return <Laptop className="w-4 h-4 text-indigo-600" />;
      case 'smartphone':
      case 'tablet': return <Smartphone className="w-4 h-4 text-blue-600" />;
      case 'fuel_card': return <CreditCard className="w-4 h-4 text-amber-600" />;
      case 'access_key': return <Key className="w-4 h-4 text-purple-600" />;
      case 'vehicle': return <Car className="w-4 h-4 text-emerald-600" />;
      default: return <Wrench className="w-4 h-4 text-slate-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> مسلم كعهدة نشطة</span>;
      case 'in_stock':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Clock className="w-3 h-3" /> متاح بالمستودع</span>;
      case 'maintenance':
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle className="w-3 h-3" /> قيد الصيانة والإصلاح</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700 border border-slate-200">مستهلك / تالف</span>;
    }
  };

  const totalValue = assets.reduce((acc, a) => acc + (a.purchase_value || 0), 0);
  const totalAssigned = assets.filter(a => a.status === 'assigned').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
            <Laptop className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">إدارة الأصول والعهد الذكية وتوثيق التسليم (Smart Assets & QR)</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              تتبع الأجهزة والسيارات وبطاقات الوقود ومطابقة إخلاء الطرف وإبراء الذمة إلكترونياً
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>تسجيل أصل أو عهدة جديدة</span>
        </button>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block">إجمالي عدد الأصول والعهد المسجلة</span>
          <p className="text-2xl font-black text-slate-900 mt-1 font-mono">{assets.length} أصل</p>
          <span className="text-xs text-slate-400 mt-1 block">حواسب، هواتف، سيارات، وبطاقات وقود</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block">العهد المسلمة للموظفين حالياً</span>
          <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">{totalAssigned} عهدة نشطة</p>
          <span className="text-xs text-emerald-600 mt-1 block font-medium">✓ موثقة بمحاضر استلام رقمية</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block">القيمة الرأسمالية الدفترية للأصول</span>
          <p className="text-2xl font-black text-slate-900 mt-1 font-mono">{totalValue.toLocaleString()} ر.س</p>
          <span className="text-xs text-slate-400 mt-1 block">تخضع للإهلاك والتدقيق المالي السنوي</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برمز الأصل، الرقم التسلسلي، اسم الجهاز، أو اسم الموظف المستلم..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold bg-white"
          >
            <option value="all">كافة الفئات</option>
            <option value="laptop">حواسب محمولة (Laptops)</option>
            <option value="smartphone">هواتف ذكية (Smartphones)</option>
            <option value="fuel_card">بطاقات وقود (Fuel Cards)</option>
            <option value="vehicle">مركبات وسيارات</option>
            <option value="access_key">بطاقات وبصمات دخول</option>
          </select>
        </div>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.map((asset) => (
          <div key={asset.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    {getCategoryIcon(asset.category)}
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {asset.asset_code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{asset.name}</h3>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-slate-400">الموديل والمواصفات:</span>
                  <span className="font-semibold text-slate-800">{asset.brand_model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">الرقم التسلسلي (S/N):</span>
                  <span className="font-mono text-slate-800">{asset.serial_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">قيمة الشراء:</span>
                  <span className="font-mono font-bold text-slate-800">{asset.purchase_value?.toLocaleString()} ر.س</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500">حالة الأصل:</span>
                  {getStatusBadge(asset.status)}
                </div>

                {asset.assigned_employee_name ? (
                  <div className="text-xs bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-lg text-emerald-900">
                    <span className="font-bold block text-xs mb-0.5">في عهدة الموظف:</span>
                    <span className="font-semibold">{asset.assigned_employee_name}</span> ({asset.assigned_department || 'عام'})
                    <span className="block text-slate-400 text-xs mt-0.5">تاريخ التسليم: {asset.assigned_date}</span>
                  </div>
                ) : (
                  <div className="text-xs bg-slate-100 p-2 rounded-lg text-slate-500 text-center font-medium">
                    العهدة متوفرة في المستودع وجاهزة للصرف
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => setSelectedAssetForQR(asset)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="عرض QR التسليم والمطابقة"
              >
                <QrCode className="w-3.5 h-3.5 text-slate-700" />
                <span>رمز QR</span>
              </button>

              <button
                onClick={() => {
                  setSelectedAssetForAssign(asset);
                  setAssignForm({
                    employee_id: asset.current_assigned_to || 1,
                    condition: asset.condition as any || 'good',
                    status: asset.status as any || 'assigned'
                  });
                }}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>{asset.status === 'assigned' ? 'نقل / استرجاع العهدة' : 'تسليم لموظف'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: ADD ASSET */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2 text-blue-700">
                <Laptop className="w-5 h-5" />
                تسجيل عهدة / أصل جديد بالمنشأة
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الأصل أو الوصف:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: حاسب محمول مالي، هاتف إداري"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">فئة الأصل:</label>
                  <select
                    value={newAsset.category}
                    onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="laptop">حاسب محمول (Laptop)</option>
                    <option value="smartphone">هاتف ذكي (Smartphone)</option>
                    <option value="fuel_card">بطاقة وقود (Fuel Card)</option>
                    <option value="vehicle">مركبة رسمية</option>
                    <option value="access_key">مفتاح / بطاقة وصول</option>
                    <option value="specialized_tool">أداة فنية / معدة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الموديل والماركة:</label>
                  <input
                    type="text"
                    required
                    placeholder="MacBook, Dell, iPhone..."
                    value={newAsset.brand_model}
                    onChange={(e) => setNewAsset({ ...newAsset, brand_model: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم التسلسلي (Serial Number):</label>
                  <input
                    type="text"
                    required
                    placeholder="S/N: C02G9981..."
                    value={newAsset.serial_number}
                    onChange={(e) => setNewAsset({ ...newAsset, serial_number: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">قيمة الشراء (ر.س):</label>
                  <input
                    type="number"
                    value={newAsset.purchase_value}
                    onChange={(e) => setNewAsset({ ...newAsset, purchase_value: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  حفظ وتوليد رمز QR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN / RECLAIM */}
      {selectedAssetForAssign && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                إجراءات تسليم واسترجاع العهدة ({selectedAssetForAssign.asset_code})
              </h3>
              <button onClick={() => setSelectedAssetForAssign(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">حالة العهدة الجديدة:</label>
                <select
                  value={assignForm.status}
                  onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="assigned">مسلمة لموظف (عهدة نشطة)</option>
                  <option value="in_stock">مسترجعة للمستودع (إخلاء طرف)</option>
                  <option value="maintenance">تحت الصيانة والإصلاح</option>
                  <option value="scrapped">تالفة / إتلاف نظامي</option>
                </select>
              </div>

              {assignForm.status === 'assigned' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الموظف المستلم:</label>
                  <select
                    value={assignForm.employee_id}
                    onChange={(e) => setAssignForm({ ...assignForm, employee_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value={1}>1 - عبد الله بن فهد السبيعي (مدير الموارد البشرية)</option>
                    <option value={2}>2 - سارة بنت خالد العتيبي (أخصائية مالية)</option>
                    <option value={3}>3 - أحمد محمود عبد الرحمن (مهندس برمجيات)</option>
                    <option value={4}>4 - فهد بن عبد العزيز المنصور (مدير مبيعات)</option>
                    <option value={5}>5 - مريم بنت ناصر الشمري (أخصائية موارد بشرية)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">حالة الأصل الفنية:</label>
                <select
                  value={assignForm.condition}
                  onChange={(e) => setAssignForm({ ...assignForm, condition: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="new">جديد وممتاز (New)</option>
                  <option value="good">جيد وصالح للاستخدام (Good)</option>
                  <option value="fair">مقبول (Fair)</option>
                  <option value="needs_maintenance">يحتاج صيانة وفحص</option>
                </select>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  تحديث المحضر وإبراء الذمة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QR CODE & HANDOVER CERTIFICATE */}
      {selectedAssetForQR && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center border border-slate-200">
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-xs font-bold text-slate-500">بطاقة العهدة الذكية</span>
              <button onClick={() => setSelectedAssetForQR(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl inline-block border border-slate-200">
              {/* QR representation */}
              <div className="w-40 h-40 bg-white p-3 rounded-xl border border-slate-300 flex flex-col items-center justify-center mx-auto shadow-inner">
                <QrCode className="w-32 h-32 text-slate-900" />
              </div>
              <span className="font-mono text-xs font-bold text-slate-700 mt-2 block">
                {selectedAssetForQR.handover_qr_code}
              </span>
            </div>

            <div className="text-right space-y-1 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div><span className="text-slate-400">اسم العهدة:</span> <span className="font-bold text-slate-800">{selectedAssetForQR.name}</span></div>
              <div><span className="text-slate-400">الرقم التسلسلي:</span> <span className="font-mono text-slate-800">{selectedAssetForQR.serial_number}</span></div>
              <div><span className="text-slate-400">المستلم الحالي:</span> <span className="font-bold text-emerald-700">{selectedAssetForQR.assigned_employee_name || 'بالمستودع'}</span></div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> طباعة ملصق الباركود / QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
