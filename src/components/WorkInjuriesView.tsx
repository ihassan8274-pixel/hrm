import { useState, useEffect, FormEvent } from 'react';
import { 
  HeartPulse, Plus, ShieldAlert, CheckCircle2, 
  AlertTriangle, Clock, Activity, FileCheck, X
} from 'lucide-react';
import type { WorkInjury, Employee } from '../types';

export default function WorkInjuriesView() {
  const [injuries, setInjuries] = useState<WorkInjury[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedInjury, setSelectedInjury] = useState<WorkInjury | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    incident_date: new Date().toISOString().split('T')[0],
    incident_location: 'موقع المشروع / المقر',
    severity: 'moderate',
    injury_nature: '',
    hospital_name: 'مستشفى الدكتور سليمان الحبيب',
    sick_leave_days: '7',
    gosi_reported: false,
    gosi_report_date: '',
    preventive_actions: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [iRes, eRes] = await Promise.all([
        fetch('/api/work-injuries'),
        fetch('/api/employees')
      ]);
      const [iData, eData] = await Promise.all([iRes.json(), eRes.json()]);
      setInjuries(iData);
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
      const res = await fetch('/api/work-injuries', {
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

  const handleReportGosi = async (id: number) => {
    try {
      const res = await fetch(`/api/work-injuries/${id}/report-gosi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gosi_claim_number: `GOSI-INJ-${Math.floor(100000 + Math.random() * 900000)}`
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'minor':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold">بسيطة (إسعافات أولية)</span>;
      case 'moderate':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">متوسطة (علاج ومتابعة)</span>;
      case 'severe':
        return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold">شديدة (تنويم وإجازة مرضية)</span>;
      case 'critical':
        return <span className="px-2.5 py-1 bg-purple-900 text-white rounded-lg text-xs font-semibold">حرجة / عجز دائم</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">{sev}</span>;
    }
  };

  const pendingGosiCount = injuries.filter(i => !i.gosi_reported).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-100">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">إدارة إصابات العمل والسلامة المهنية (GOSI OH&S)</h2>
            <p className="text-sm text-slate-500">متابعة البلاغات الطبية، إشعار التأمينات الاجتماعية خلال مهلة 7 أيام، وتعويضات البدلات اليومية</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          تسجيل حادثة أو إصابة عمل
        </button>
      </div>

      {/* Compliance / Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">إجمالي الحوادث المسجلة</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{injuries.length}</p>
          <span className="text-[11px] text-slate-500">سجل السلامة والصحة المهنية</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">بلاغات معلقة للتأمينات (مهلة 7 أيام)</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-600">{pendingGosiCount}</p>
          <span className="text-[11px] text-rose-600 font-medium">يجب الإبلاغ خلال 7 أيام من تاريخ العلم</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">إجمالي البدلات اليومية للتأمينات</span>
            <FileCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700">
            {injuries.reduce((acc, curr) => acc + (curr.gosi_compensation_amount || 0), 0).toLocaleString()} ر.س
          </p>
          <span className="text-[11px] text-slate-500">بدل 100% من الأجر اليومي أثناء العلاج</span>
        </div>
      </div>

      {/* Injuries Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5">الموظف المصاب</th>
                <th className="px-4 py-3.5">تاريخ وموقع الحادث</th>
                <th className="px-4 py-3.5">درجة وطبيعة الإصابة</th>
                <th className="px-4 py-3.5">الإجازة المرضية والمستشفى</th>
                <th className="px-4 py-3.5">بدل التأمينات المستحق</th>
                <th className="px-4 py-3.5">بلاغ التأمينات (GOSI)</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">جاري التحميل...</td>
                </tr>
              ) : injuries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا توجد إصابات عمل مسجلة - بيئة عمل آمنة 100%</td>
                </tr>
              ) : (
                injuries.map(i => (
                  <tr key={i.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800">{i.employee_name}</p>
                      <span className="text-xs text-slate-500">{i.job_title || 'موظف'}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="font-medium text-slate-700">{i.incident_date}</p>
                      <span className="text-slate-400">{i.incident_location}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div>{getSeverityBadge(i.severity)}</div>
                      <p className="text-slate-600 mt-1 line-clamp-1">{i.injury_nature}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="font-bold text-slate-800">{i.sick_leave_days} أيام إجازة</p>
                      <span className="text-slate-500">{i.hospital_name || 'المركز الطبي'}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-bold text-emerald-700">
                      {i.gosi_compensation_amount?.toLocaleString()} ر.س
                    </td>
                    <td className="px-4 py-3.5">
                      {i.gosi_reported ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            مُبلغ للتأمينات
                          </span>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{i.gosi_claim_number}</p>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReportGosi(i.id)}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition"
                        >
                          إشعار التأمينات الآن
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => setSelectedInjury(i)}
                        className="text-xs text-rose-700 font-semibold hover:underline"
                      >
                        تفاصيل البلاغ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Report New Injury */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800">تسجيل بلاغ إصابة عمل وحادث مهني</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المصاب *</label>
                  <select
                    required
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">اختر الموظف...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">درجة الخطورة *</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="minor">بسيطة (إسعافات داخل المنشأة)</option>
                    <option value="moderate">متوسطة (علاج بالمستشفى)</option>
                    <option value="severe">شديدة (تنويم وإجازة مرضية)</option>
                    <option value="critical">حرجة (عجز دائم)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الحادث *</label>
                  <input
                    type="date"
                    required
                    value={formData.incident_date}
                    onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">موقع الحادث بالتحديد</label>
                  <input
                    type="text"
                    value={formData.incident_location}
                    onChange={(e) => setFormData({ ...formData, incident_location: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طبيعة الإصابة والتشخيص المبدئي *</label>
                <textarea
                  required
                  rows={2}
                  value={formData.injury_nature}
                  onChange={(e) => setFormData({ ...formData, injury_nature: e.target.value })}
                  placeholder="وصف تفصيلي للإصابة..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المستشفى أو المركز المعالج</label>
                  <input
                    type="text"
                    value={formData.hospital_name}
                    onChange={(e) => setFormData({ ...formData, hospital_name: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مدة الإجازة المرضية الممنوحة (أيام)</label>
                  <input
                    type="number"
                    value={formData.sick_leave_days}
                    onChange={(e) => setFormData({ ...formData, sick_leave_days: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الإجراءات التصحيحية والوقائية لمنع التكرار</label>
                <textarea
                  rows={2}
                  value={formData.preventive_actions}
                  onChange={(e) => setFormData({ ...formData, preventive_actions: e.target.value })}
                  placeholder="إجراءات السلامة المتخذة..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700"
                >
                  تسجيل الحادثة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Injury Modal */}
      {selectedInjury && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800">بيان تفصيلي لإصابة العمل</h3>
              <button onClick={() => setSelectedInjury(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="bg-slate-50 p-3 rounded-xl space-y-1">
                <p>الموظف: <strong>{selectedInjury.employee_name}</strong></p>
                <p>تاريخ الحادث: <strong>{selectedInjury.incident_date}</strong></p>
                <p>الموقع: {selectedInjury.incident_location}</p>
                <p>المستشفى المعالج: {selectedInjury.hospital_name}</p>
              </div>

              <div>
                <p className="font-bold text-slate-800">طبيعة الإصابة:</p>
                <p className="p-2.5 bg-slate-50 rounded border mt-1">{selectedInjury.injury_nature}</p>
              </div>

              <div>
                <p className="font-bold text-slate-800">الإجراءات الوقائية المقررة:</p>
                <p className="p-2.5 bg-slate-50 rounded border mt-1">{selectedInjury.preventive_actions || 'تم تعزيز تعليمات السلامة في الموقع'}</p>
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <p className="text-emerald-800 font-bold">مستحقات التأمينات المقررة:</p>
                <p className="mt-1">بدل يومي (100% من الأجر) لإجمالي {selectedInjury.sick_leave_days} يوم = <strong>{selectedInjury.gosi_compensation_amount?.toLocaleString()} ر.س</strong></p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={() => setSelectedInjury(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
