import { useState, useEffect, FormEvent } from 'react';
import { 
  CheckSquare, Plus, Laptop, CreditCard, Box, UserCheck, 
  CheckCircle2, Clock, X, AlertCircle, Printer, FileText
} from 'lucide-react';
import type { EmployeeClearance, Employee } from '../types';

export default function ExitClearanceView() {
  const [clearances, setClearances] = useState<EmployeeClearance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeDeptModal, setActiveDeptModal] = useState<{
    clearance: EmployeeClearance;
    dept: 'it' | 'finance' | 'operations' | 'hr';
  } | null>(null);
  const [printSlip, setPrintSlip] = useState<EmployeeClearance | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    request_date: new Date().toISOString().split('T')[0],
    last_working_day: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    reason: 'contract_end',
    final_settlement_amount: '0'
  });

  const [deptForm, setDeptForm] = useState({
    status: 'cleared',
    notes: '',
    cleared_by: '',
    loans_settled: true,
    custody_settled: true,
    assets_returned: true,
    medical_cancelled: true,
    gosi_deregistered: true,
    service_cert_issued: true
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cRes, eRes] = await Promise.all([
        fetch('/api/clearances'),
        fetch('/api/employees')
      ]);
      const [cData, eData] = await Promise.all([cRes.json(), eRes.json()]);
      setClearances(cData);
      setEmployees(eData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/clearances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeptClearanceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeDeptModal) return;

    try {
      const res = await fetch(`/api/clearances/${activeDeptModal.clearance.id}/department`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: activeDeptModal.dept,
          status: deptForm.status,
          notes: deptForm.notes,
          cleared_by: deptForm.cleared_by,
          extra_data: {
            loans_settled: deptForm.loans_settled,
            custody_settled: deptForm.custody_settled,
            assets_returned: deptForm.assets_returned,
            medical_cancelled: deptForm.medical_cancelled,
            gosi_deregistered: deptForm.gosi_deregistered,
            service_cert_issued: deptForm.service_cert_issued
          }
        })
      });
      if (res.ok) {
        setActiveDeptModal(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'resignation': return 'استقالة بموجب المادة (85)';
      case 'contract_end': return 'انتهاء مدة العقد المحددة';
      case 'art77_termination': return 'إنهاء لسبب مشروع (المادة 77)';
      case 'art80_termination': return 'فسخ بموجب المادة (80)';
      case 'retirement': return 'بلوغ سن التقاعد';
      default: return reason;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">نظام إخلاء الطرف وإبراء الذمة الإلكتروني</h2>
            <p className="text-sm text-slate-500">مسار اعتماد متعدد المحطات (تقنية المعلومات، المالية، العهد، الموارد البشرية) قبل صرف المستحقات</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          بدء إجراءات إخلاء طرف جديد
        </button>
      </div>

      {/* Clearances Grid / Cards */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="bg-white p-8 rounded-2xl text-center text-slate-400">جاري التحميل...</div>
        ) : clearances.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl text-center text-slate-400">لا توجد طلبات إخلاء طرف جارية</div>
        ) : (
          clearances.map(c => {
            const completedCount = [c.it_status, c.finance_status, c.operations_status, c.hr_status].filter(s => s === 'cleared').length;
            const progressPct = Math.round((completedCount / 4) * 100);

            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-800">{c.employee_name}</h3>
                      <span className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-md font-mono">{c.clearance_slip_number}</span>
                      {c.overall_status === 'completed' ? (
                        <span className="text-xs px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          مكتمل ومبرأ الذمة
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          قيد المتابعة ({completedCount}/4 محطات)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{c.job_title} • {c.department_name} • السبب: <strong>{getReasonLabel(c.reason)}</strong> • آخر يوم عمل: <strong>{c.last_working_day}</strong></p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPrintSlip(c)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Printer className="w-4 h-4" />
                      طباعة وثيقة الإخلاء
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>نسبة اكتمال إبراء الذمة</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* 4 Department Stations */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 1. IT Station */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Laptop className="w-4 h-4 text-indigo-600" />
                          1. تقنية المعلومات (IT)
                        </span>
                        {c.it_status === 'cleared' ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">تم الإخلاء</span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">معلق</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">حجب البريد، الصلاحيات، استلام اللابتوب والملحقات</p>
                      {c.it_notes && <p className="text-[11px] text-slate-700 mt-2 bg-white p-1.5 rounded border">{c.it_notes}</p>}
                    </div>
                    <button
                      onClick={() => {
                        setDeptForm({ ...deptForm, status: c.it_status, notes: c.it_notes || '', cleared_by: c.it_cleared_by || 'فريق IT' });
                        setActiveDeptModal({ clearance: c, dept: 'it' });
                      }}
                      className="mt-3 w-full py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 text-xs font-semibold rounded-lg transition"
                    >
                      {c.it_status === 'cleared' ? 'تعديل اعتماد IT' : 'اعتماد إخلاء IT'}
                    </button>
                  </div>

                  {/* 2. Finance Station */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-indigo-600" />
                          2. الإدارة المالية
                        </span>
                        {c.finance_status === 'cleared' ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">تم الإخلاء</span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">معلق</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">سداد السلف، تصفية العهد النقدية، البطاقات الائتمانية</p>
                      {c.finance_notes && <p className="text-[11px] text-slate-700 mt-2 bg-white p-1.5 rounded border">{c.finance_notes}</p>}
                    </div>
                    <button
                      onClick={() => {
                        setDeptForm({ ...deptForm, status: c.finance_status, notes: c.finance_notes || '', loans_settled: c.finance_loans_settled === 1, custody_settled: c.finance_custody_settled === 1 });
                        setActiveDeptModal({ clearance: c, dept: 'finance' });
                      }}
                      className="mt-3 w-full py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 text-xs font-semibold rounded-lg transition"
                    >
                      {c.finance_status === 'cleared' ? 'تعديل اعتماد المالية' : 'اعتماد المالية'}
                    </button>
                  </div>

                  {/* 3. Operations & Assets Station */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Box className="w-4 h-4 text-indigo-600" />
                          3. العمليات والعهد
                        </span>
                        {c.operations_status === 'cleared' ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">تم الإخلاء</span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">معلق</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">سيارة الشركة، مفاتيح المكاتب والمستودعات، بطاقات الدخول</p>
                      {c.operations_notes && <p className="text-[11px] text-slate-700 mt-2 bg-white p-1.5 rounded border">{c.operations_notes}</p>}
                    </div>
                    <button
                      onClick={() => {
                        setDeptForm({ ...deptForm, status: c.operations_status, notes: c.operations_notes || '', assets_returned: c.operations_assets_returned === 1 });
                        setActiveDeptModal({ clearance: c, dept: 'operations' });
                      }}
                      className="mt-3 w-full py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 text-xs font-semibold rounded-lg transition"
                    >
                      {c.operations_status === 'cleared' ? 'تعديل اعتماد العهد' : 'اعتماد العهد والأصول'}
                    </button>
                  </div>

                  {/* 4. HR Station */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-indigo-600" />
                          4. الموارد البشرية (HR)
                        </span>
                        {c.hr_status === 'cleared' ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">تم الإخلاء</span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">معلق</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">إلغاء التأمين، الاستبعاد من التأمينات (GOSI)، شهادة الخدمة</p>
                    </div>
                    <button
                      onClick={() => {
                        setDeptForm({
                          ...deptForm,
                          status: c.hr_status,
                          medical_cancelled: c.hr_medical_cancelled === 1,
                          gosi_deregistered: c.hr_gosi_deregistered === 1,
                          service_cert_issued: c.hr_service_cert_issued === 1
                        });
                        setActiveDeptModal({ clearance: c, dept: 'hr' });
                      }}
                      className="mt-3 w-full py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 text-xs font-semibold rounded-lg transition"
                    >
                      {c.hr_status === 'cleared' ? 'تعديل اعتماد HR' : 'اعتماد الموارد البشرية'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal - Initiate New Clearance */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">بدء إجراءات إخلاء طرف لموظف</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                <select
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.position || 'موظف'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الطلب</label>
                  <input
                    type="date"
                    required
                    value={formData.request_date}
                    onChange={(e) => setFormData({ ...formData, request_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">آخر يوم عمل فعلي *</label>
                  <input
                    type="date"
                    required
                    value={formData.last_working_day}
                    onChange={(e) => setFormData({ ...formData, last_working_day: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب انتهاء الخدمة *</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="contract_end">انتهاء مدة العقد المحددة وعدم التجديد</option>
                  <option value="resignation">استقالة العامل (المادة 85)</option>
                  <option value="art77_termination">إنهاء لسبب مشروع (المادة 77)</option>
                  <option value="art80_termination">فسخ العقد لارتكاب مخالفة جسيمة (المادة 80)</option>
                  <option value="retirement">بلوغ السن النظامي للتقاعد</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
                >
                  إطلاق مسار الإخلاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Department Station Signoff Modal */}
      {activeDeptModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800">
                اعتماد إخلاء طرف - {activeDeptModal.dept === 'it' ? 'تقنية المعلومات' : activeDeptModal.dept === 'finance' ? 'الإدارة المالية' : activeDeptModal.dept === 'operations' ? 'العهد والأصول' : 'الموارد البشرية'}
              </h3>
              <button onClick={() => setActiveDeptModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeptClearanceSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700">
                الموظف: <strong>{activeDeptModal.clearance.employee_name}</strong> | الرقم: {activeDeptModal.clearance.clearance_slip_number}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حالة الإخلاء</label>
                <select
                  value={deptForm.status}
                  onChange={(e) => setDeptForm({ ...deptForm, status: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="cleared">تم الإخلاء وإبراء الذمة بالكامل ✓</option>
                  <option value="pending">معلق (بانتظار استكمال متطلبات)</option>
                </select>
              </div>

              {activeDeptModal.dept === 'finance' && (
                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={deptForm.loans_settled} onChange={(e) => setDeptForm({ ...deptForm, loans_settled: e.target.checked })} />
                    <span>تم التحقق من سداد كافة السلف والمديونيات</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={deptForm.custody_settled} onChange={(e) => setDeptForm({ ...deptForm, custody_settled: e.target.checked })} />
                    <span>تم تصفية العهد النقدية وفواتير المصروفات</span>
                  </label>
                </div>
              )}

              {activeDeptModal.dept === 'hr' && (
                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={deptForm.medical_cancelled} onChange={(e) => setDeptForm({ ...deptForm, medical_cancelled: e.target.checked })} />
                    <span>إلغاء وثيقة التأمين الطبي وحذف التغطية</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={deptForm.gosi_deregistered} onChange={(e) => setDeptForm({ ...deptForm, gosi_deregistered: e.target.checked })} />
                    <span>استبعاد الموظف من سجلات التأمينات الاجتماعية (GOSI)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={deptForm.service_cert_issued} onChange={(e) => setDeptForm({ ...deptForm, service_cert_issued: e.target.checked })} />
                    <span>إصدار شهادة الخدمة والخبرة المعتمدة</span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الاعتماد والتسليم</label>
                <textarea
                  rows={2}
                  value={deptForm.notes}
                  onChange={(e) => setDeptForm({ ...deptForm, notes: e.target.value })}
                  placeholder="بيان ما تم تسليمه وإقراره..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setActiveDeptModal(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
                >
                  حفظ الاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Final Clearance Slip */}
      {printSlip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl space-y-6 print:p-0">
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <h3 className="font-bold text-slate-800">وثيقة إخلاء طرف نهائية رسمية</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1">
                  <Printer className="w-4 h-4" />
                  طباعة
                </button>
                <button onClick={() => setPrintSlip(null)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="border-2 border-slate-800 p-6 rounded-xl space-y-5 text-xs text-slate-800 leading-relaxed">
              <div className="text-center border-b-2 border-slate-800 pb-3">
                <h2 className="text-lg font-bold">شركة الأنظمة المتكاملة للحلول الرقمية</h2>
                <h3 className="text-md font-bold text-indigo-900 mt-0.5">شهادة إخلاء طرف وإبراء ذمة نهائية</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-1">رقم الوثيقة: {printSlip.clearance_slip_number} | التاريخ: {printSlip.request_date}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded border">
                <p>تشهد الشركة بأن الموظف/ <strong>{printSlip.employee_name}</strong> (هوية/إقامة: {printSlip.national_id_iqama || '---'})، والذي كان يشغل وظيفة ({printSlip.job_title})، قد انتهت خدماته بالشركة اعتباراً من تاريخ ({printSlip.last_working_day})، وقد قام بإخلاء طرفه وتسليم كافة ما بعهدته للجهات المعنية بالشركة كما يلي:</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="border p-2.5 rounded bg-slate-50/50">
                  <p className="font-bold">1. إدارة تقنية المعلومات:</p>
                  <p className="text-emerald-700 font-bold">✓ {printSlip.it_status === 'cleared' ? 'تم استلام الأجهزة وحجب الصلاحيات' : 'معلق'}</p>
                </div>
                <div className="border p-2.5 rounded bg-slate-50/50">
                  <p className="font-bold">2. الإدارة المالية:</p>
                  <p className="text-emerald-700 font-bold">✓ {printSlip.finance_status === 'cleared' ? 'تمت تصفية السلف والعهد النقدية' : 'معلق'}</p>
                </div>
                <div className="border p-2.5 rounded bg-slate-50/50">
                  <p className="font-bold">3. إدارة العهد والخدمات:</p>
                  <p className="text-emerald-700 font-bold">✓ {printSlip.operations_status === 'cleared' ? 'تم تسليم السيارات والمفاتيح والبطاقات' : 'معلق'}</p>
                </div>
                <div className="border p-2.5 rounded bg-slate-50/50">
                  <p className="font-bold">4. إدارة الموارد البشرية:</p>
                  <p className="text-emerald-700 font-bold">✓ {printSlip.hr_status === 'cleared' ? 'تم إلغاء التأمين والاستبعاد من GOSI' : 'معلق'}</p>
                </div>
              </div>

              <p className="pt-2 text-center text-slate-700 font-medium">وبناءً عليه، أُعطي هذه الوثيقة لإبراء ذمته وصرف مستحقاته المالية ومكافأة نهاية الخدمة المقررة نظاماً.</p>

              <div className="pt-6 grid grid-cols-2 text-center border-t">
                <div>
                  <p className="font-bold">إدارة الموارد البشرية</p>
                  <p className="mt-8 text-indigo-900 font-bold">معتمد وموثق رقمياً</p>
                </div>
                <div>
                  <p className="font-bold">إقرار واستلام الموظف</p>
                  <p className="mt-8 text-slate-400">التوقيع: ....................</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
