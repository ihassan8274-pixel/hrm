import { useState, useEffect, FormEvent } from 'react';
import { 
  Car, AlertTriangle, ShieldCheck, Plus, CheckCircle2, 
  Calendar, Key, DollarSign, Wrench, RefreshCw, X,
  Trash2, AlertCircle, FileText, UserCheck, Shield
} from 'lucide-react';
import type { FleetVehicle, TrafficFineLog } from '../types';

export default function FleetManagementView() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [trafficFines, setTrafficFines] = useState<TrafficFineLog[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'fines'>('vehicles');

  // Vehicle Modal
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    plate_number: '',
    make_model: 'تويوتا كامري GLX',
    year: 2024,
    vin_number: '',
    assigned_employee_id: '',
    assignment_date: new Date().toISOString().split('T')[0],
    istimara_expiry: '2027-05-15',
    insurance_expiry: '2026-11-20',
    periodic_inspection_expiry: '2026-10-30',
    status: 'assigned',
    current_odometer: 32000,
    fuel_card_number: 'PETRO-98421'
  });

  // Fine Modal
  const [showFineModal, setShowFineModal] = useState(false);
  const [fineForm, setFineForm] = useState({
    vehicle_id: '',
    employee_id: '',
    fine_number: '',
    violation_type: 'تجاوز السرعة المحددة (ساهر)',
    amount: 300,
    fine_date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vRes, fRes, empRes] = await Promise.all([
        fetch('/api/fleet/vehicles'),
        fetch('/api/fleet/traffic-fines'),
        fetch('/api/employees')
      ]);

      if (vRes.ok) setVehicles(await vRes.json());
      if (fRes.ok) setTrafficFines(await fRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (err) {
      console.error('Error loading fleet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.plate_number) return;
    try {
      const res = await fetch('/api/fleet/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleForm)
      });
      if (res.ok) {
        setShowVehicleModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteVehicle = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه المركبة من الأسطول؟')) return;
    try {
      const res = await fetch(`/api/fleet/vehicles/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveFine = async (e: FormEvent) => {
    e.preventDefault();
    if (!fineForm.vehicle_id || !fineForm.employee_id) return;
    try {
      const res = await fetch('/api/fleet/traffic-fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fineForm)
      });
      if (res.ok) {
        setShowFineModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeductFine = async (fineId: number) => {
    if (!confirm('هل تريد ترحيل قيمة المخالفة للاستقطاع المباشر من مسير رواتب الموظف للشهر الحالي؟')) return;
    try {
      const res = await fetch(`/api/fleet/traffic-fines/${fineId}/deduct`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const totalFinesAmount = trafficFines.reduce((acc, f) => acc + (f.amount || 0), 0);
  const pendingFines = trafficFines.filter(f => f.status === 'pending');

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Car className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              إدارة أسطول المركبات والعهد والمخالفات المرورية
              <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2.5 py-0.5 rounded-full">
                نظام إدارة العهد والتفويض (أبشر أعمال)
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              متابعة صلاحيات الاستمارة والتأمين والفحص الدوري (MVPI)، تتبع المخالفات وربطها التلقائي بمسير الرواتب.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFineModal(true)}
            className="flex items-center gap-2 bg-rose-50 text-rose-700 hover:bg-rose-100 px-4 py-2.5 rounded-xl font-medium text-sm transition-all border border-rose-200"
          >
            <AlertTriangle className="w-4 h-4" />
            تسجيل مخالفة مرورية
          </button>
          <button
            onClick={() => setShowVehicleModal(true)}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm shadow-amber-200"
          >
            <Plus className="w-4 h-4" />
            إضافة مركبة للأسطول
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">إجمالي أسطول المركبات</span>
            <Car className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-slate-800">{vehicles.length} مركبة</div>
          <div className="text-xs text-slate-400 mt-1">
            {vehicles.filter(v => v.status === 'assigned').length} في عهدة الموظفين
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">تنبيهات الفحص والتأمين</span>
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {vehicles.filter(v => (v.days_to_insurance !== undefined && v.days_to_insurance < 60) || (v.days_to_mvpi !== undefined && v.days_to_mvpi < 60)).length} تنبيهات
          </div>
          <div className="text-xs text-amber-600 mt-1">تنتهي خلال أقل من 60 يوماً</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">مخالفات معلقة للاستقطاع</span>
            <AlertCircle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{pendingFines.length} مخالفة</div>
          <div className="text-xs text-slate-400 mt-1">
            بقيمة {pendingFines.reduce((a, c) => a + c.amount, 0).toLocaleString()} ر.س
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">إجمالي المخالفات المسجلة</span>
            <DollarSign className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalFinesAmount.toLocaleString()} ر.س</div>
          <div className="text-xs text-emerald-600 mt-1">ترحيل تلقائي للمسيرات عبر نظام الجزاءات</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'vehicles' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Car className="w-4 h-4" />
          سجل المركبات والعهد ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('fines')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'fines' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          المخالفات المرورية والاستقطاع ({trafficFines.length})
        </button>
      </div>

      {/* Tab 1: Vehicles */}
      {activeTab === 'vehicles' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">سجل عهد المركبات وتفويض قيادة أبشر</h2>
            <button
              onClick={() => setShowVehicleModal(true)}
              className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              مركبة جديدة
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">لوحة المركبة</th>
                  <th className="p-3.5">النوع والموديل</th>
                  <th className="p-3.5">المستلم (العهدة)</th>
                  <th className="p-3.5">انتهاء الاستمارة</th>
                  <th className="p-3.5">انتهاء التأمين</th>
                  <th className="p-3.5">الفحص الدوري (MVPI)</th>
                  <th className="p-3.5">عداد الكيلومترات</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5 font-mono font-bold text-slate-900 bg-slate-50/80">
                      {v.plate_number}
                    </td>
                    <td className="p-3.5 font-medium text-slate-800">
                      {v.make_model} ({v.year})
                    </td>
                    <td className="p-3.5">
                      {v.assigned_employee_name ? (
                        <div>
                          <div className="font-bold text-slate-800">{v.assigned_employee_name}</div>
                          <div className="text-xs text-slate-500">{v.department_name || 'موظف'}</div>
                        </div>
                      ) : (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">متاحة في المقر</span>
                      )}
                    </td>
                    <td className="p-3.5 text-xs text-slate-600">{v.istimara_expiry}</td>
                    <td className="p-3.5 text-xs">
                      <span className={`px-2 py-0.5 rounded font-medium ${
                        v.days_to_insurance !== undefined && v.days_to_insurance < 30
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {v.insurance_expiry}
                      </span>
                    </td>
                    <td className="p-3.5 text-xs text-slate-600">{v.periodic_inspection_expiry}</td>
                    <td className="p-3.5 font-mono text-slate-700">{v.current_odometer?.toLocaleString()} كم</td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleDeleteVehicle(v.id)}
                        className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                        title="حذف المركبة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Traffic Fines */}
      {activeTab === 'fines' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">سجل المخالفات المرورية وترحيل الاستقطاعات</h2>
            <button
              onClick={() => setShowFineModal(true)}
              className="flex items-center gap-1.5 text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              تسجيل مخالفة
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">رقم المخالفة</th>
                  <th className="p-3.5">لوحة المركبة</th>
                  <th className="p-3.5">السائق المفوّض</th>
                  <th className="p-3.5">نوع المخالفة</th>
                  <th className="p-3.5">تاريخ المخالفة</th>
                  <th className="p-3.5">المبلغ</th>
                  <th className="p-3.5">حالة الاستقطاع</th>
                  <th className="p-3.5 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trafficFines.map(fine => (
                  <tr key={fine.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5 font-mono font-medium text-slate-900">{fine.fine_number}</td>
                    <td className="p-3.5 font-mono text-slate-700">{fine.plate_number}</td>
                    <td className="p-3.5 font-bold text-slate-800">{fine.employee_name}</td>
                    <td className="p-3.5 text-slate-600 text-xs">{fine.violation_type}</td>
                    <td className="p-3.5 text-slate-600 text-xs">{fine.fine_date}</td>
                    <td className="p-3.5 font-bold text-rose-600">{fine.amount?.toLocaleString()} ر.س</td>
                    <td className="p-3.5">
                      {fine.deducted_from_payroll === 1 ? (
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                          تم الاستقطاع من المسير
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                          معلقة للاستقطاع
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      {fine.deducted_from_payroll !== 1 && (
                        <button
                          onClick={() => handleDeductFine(fine.id)}
                          className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-lg font-medium transition-all shadow-xs"
                        >
                          ترحيل للاستقطاع الآن
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Car className="w-5 h-5 text-amber-600" />
                إضافة مركبة جديدة لأسطول الشركة
              </h3>
              <button onClick={() => setShowVehicleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">رقم اللوحة *</label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.plate_number}
                    onChange={e => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-mono"
                    placeholder="أ ب ج 1234"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">النوع والموديل *</label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.make_model}
                    onChange={e => setVehicleForm({ ...vehicleForm, make_model: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">سنة الصنع</label>
                  <input
                    type="number"
                    value={vehicleForm.year}
                    onChange={e => setVehicleForm({ ...vehicleForm, year: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف المستلم (العهدة)</label>
                  <select
                    value={vehicleForm.assigned_employee_id}
                    onChange={e => setVehicleForm({ ...vehicleForm, assigned_employee_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">بدون عهدة (متاحة بالمقر)</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">انتهاء الاستمارة</label>
                  <input
                    type="date"
                    value={vehicleForm.istimara_expiry}
                    onChange={e => setVehicleForm({ ...vehicleForm, istimara_expiry: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">انتهاء التأمين</label>
                  <input
                    type="date"
                    value={vehicleForm.insurance_expiry}
                    onChange={e => setVehicleForm({ ...vehicleForm, insurance_expiry: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">الفحص الدوري</label>
                  <input
                    type="date"
                    value={vehicleForm.periodic_inspection_expiry}
                    onChange={e => setVehicleForm({ ...vehicleForm, periodic_inspection_expiry: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl"
                >
                  حفظ وتسجيل في الأسطول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Fine Modal */}
      {showFineModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                تسجيل مخالفة مرورية على عهدة مركبة
              </h3>
              <button onClick={() => setShowFineModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFine} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">المركبة المعنية *</label>
                <select
                  required
                  value={fineForm.vehicle_id}
                  onChange={e => {
                    const vId = e.target.value;
                    const veh = vehicles.find(v => v.id === Number(vId));
                    setFineForm({
                      ...fineForm,
                      vehicle_id: vId,
                      employee_id: veh?.assigned_employee_id ? String(veh.assigned_employee_id) : fineForm.employee_id
                    });
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">اختر المركبة...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number} - {v.make_model} ({v.assigned_employee_name || 'بدون عهدة'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف المفوض بالقيادة (المستقطع منه) *</label>
                <select
                  required
                  value={fineForm.employee_id}
                  onChange={e => setFineForm({ ...fineForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">نوع المخالفة المرورية</label>
                  <select
                    value={fineForm.violation_type}
                    onChange={e => setFineForm({ ...fineForm, violation_type: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="تجاوز السرعة المحددة (ساهر)">تجاوز السرعة المحددة (ساهر)</option>
                    <option value="قطع الإشارة الضوئية">قطع الإشارة الضوئية</option>
                    <option value="استخدام الهاتف المحمول أثناء القيادة">استخدام الهاتف أثناء القيادة</option>
                    <option value="عدم ربط حزام الأمان">عدم ربط حزام الأمان</option>
                    <option value="وقوف خاطئ / إعاقة حركة السير">وقوف خاطئ / إعاقة سير</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">المبلغ (ر.س) *</label>
                  <input
                    type="number"
                    required
                    value={fineForm.amount}
                    onChange={e => setFineForm({ ...fineForm, amount: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFineModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl"
                >
                  تسجيل المخالفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
