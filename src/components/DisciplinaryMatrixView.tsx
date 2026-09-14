import { useState, useEffect, FormEvent } from 'react';
import { 
  Scale, Plus, AlertTriangle, FileText, CheckCircle2, 
  DollarSign, UserCheck, X, ShieldAlert, ArrowRight
} from 'lucide-react';
import type { DisciplinaryViolation, Employee } from '../types';

export default function DisciplinaryMatrixView() {
  const [violations, setViolations] = useState<DisciplinaryViolation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState<DisciplinaryViolation | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    incident_date: new Date().toISOString().split('T')[0],
    category: 'delay_departure',
    description: '',
    investigation_date: new Date().toISOString().split('T')[0],
    investigator_name: 'لجنة التحقيق والموارد البشرية',
    employee_statement: '',
    committee_decision: '',
    penalty_level: 'written_warning_1',
    deduction_days: '0',
    status: 'approved'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vRes, eRes] = await Promise.all([
        fetch('/api/disciplinary/violations'),
        fetch('/api/employees')
      ]);
      const [vData, eData] = await Promise.all([vRes.json(), eRes.json()]);
      setViolations(vData);
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

  const handlePenaltyChange = (penalty: string) => {
    let days = '0';
    if (penalty === 'salary_deduction_1day') days = '1';
    else if (penalty === 'salary_deduction_3days') days = '3';
    else if (penalty === 'suspension_5days') days = '5';
    setFormData({
      ...formData,
      penalty_level: penalty,
      deduction_days: days
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/disciplinary/violations', {
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

  const handleApplyToPayroll = async (id: number) => {
    try {
      const res = await fetch(`/api/disciplinary/violations/${id}/apply-payroll`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getPenaltyBadge = (level: string) => {
    switch (level) {
      case 'verbal_notice':
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">تنبيه شفوي</span>;
      case 'written_warning_1':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">إنذار كتابي أول</span>;
      case 'written_warning_2':
        return <span className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-xs font-semibold">إنذار كتابي نهائي</span>;
      case 'salary_deduction_1day':
        return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold">خصم أجر يوم واحد</span>;
      case 'salary_deduction_3days':
        return <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-300 rounded-lg text-xs font-semibold">خصم أجر 3 أيام</span>;
      case 'termination_art80':
        return <span className="px-2.5 py-1 bg-purple-900 text-white rounded-lg text-xs font-semibold">فسخ بموجب المادة (80)</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">{level}</span>;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'attendance_absence': return 'غياب بدون إذن مشروع';
      case 'delay_departure': return 'تأخر أو انصراف مبكر';
      case 'insubordination': return 'عدم تنفيذ التعليمات والأوامر';
      case 'negligence': return 'إهمال أو تقصير في العمل';
      case 'safety_breach': return 'مخالفة قواعد السلامة والصحة';
      case 'art80_gross_misconduct': return 'مخالفة جسيمة (المادة 80)';
      default: return 'سلوك عام';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">لائحة المخالفات والتحقيق والجزاءات العمالية</h2>
            <p className="text-sm text-slate-500">التطبيق النظامي للائحة تنظيم العمل المعتمدة من وزارة الموارد البشرية مع مسار ترحيل الخصم للرواتب</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          تسجيل محضر تحقيق وقرار جزاء
        </button>
      </div>

      {/* Rules Notice */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm text-amber-950 mb-1">الضوابط النظامية لتوقيع الجزاءات (المادتان 68 و 70 من نظام العمل):</p>
          <p>1. لا يجوز توقيع جزاء تأديبي على العامل إلا بعد إبلاغه كتابة بما نُسب إليه والتحقيق معه وسماع أقواله وإثبات ذلك في محضر رسمي.</p>
          <p>2. لا يجوز أن يزيد الخصم من أجر العامل على أجر 5 أيام في المرة الواحدة، ولا يُخصم أكثر من أجر 5 أيام من أجر الشهر الواحد.</p>
        </div>
      </div>

      {/* Violations Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5">الموظف</th>
                <th className="px-4 py-3.5">تاريخ ونوع المخالفة</th>
                <th className="px-4 py-3.5">تفاصيل الواقعة والتحقيق</th>
                <th className="px-4 py-3.5">الجزاء النظامي المقرر</th>
                <th className="px-4 py-3.5">الخصم المالي</th>
                <th className="px-4 py-3.5">مسير الرواتب</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">جاري التحميل...</td>
                </tr>
              ) : violations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">سجل المخالفات نظيف - لا توجد جزاءات مسجلة</td>
                </tr>
              ) : (
                violations.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800">{v.employee_name}</p>
                      <span className="text-xs text-slate-500">{v.department_name || 'عام'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-700 text-xs">{getCategoryLabel(v.category)}</p>
                      <span className="text-[11px] text-slate-400">{v.incident_date}</span>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs text-xs text-slate-600">
                      <p className="line-clamp-2">{v.description}</p>
                      {v.investigator_name && (
                        <span className="text-[10px] text-slate-400 mt-1 block font-medium">المحقق: {v.investigator_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {getPenaltyBadge(v.penalty_level)}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {v.deduction_amount > 0 ? (
                        <div>
                          <p className="font-bold text-rose-700">{v.deduction_amount.toLocaleString()} ر.س</p>
                          <span className="text-[10px] text-slate-500">خصم {v.deduction_days} يوم</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium">بدون خصم مالي</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {v.deduction_amount > 0 ? (
                        v.payroll_applied === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            مرحل للمسير
                          </span>
                        ) : (
                          <button
                            onClick={() => handleApplyToPayroll(v.id)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold transition"
                          >
                            ترحيل للخصم الآن
                          </button>
                        )
                      ) : (
                        <span className="text-slate-400 text-xs">---</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => setSelectedViolation(v)}
                        className="text-xs text-amber-700 hover:underline font-semibold"
                      >
                        عرض المحضر
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - New Violation & Hearing Record */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">تسجيل محضر تحقيق وقرار جزاء إداري</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المخالف *</label>
                  <select
                    required
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">اختر الموظف...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} (أساسي: {e.basic_salary} ر.س)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف المخالفة *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="delay_departure">تأخر عن العمل أو انصراف مبكر</option>
                    <option value="attendance_absence">غياب بدون إذن أو عذر مشروع</option>
                    <option value="insubordination">عدم الالتزام بتعليمات العمل والأوامر</option>
                    <option value="negligence">إهمال أو تقصير أدى لضرر</option>
                    <option value="safety_breach">مخالفة تعليمات السلامة والصحة المهنية</option>
                    <option value="art80_gross_misconduct">مخالفة جسيمة تستوجب المادة (80)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ ارتكاب المخالفة *</label>
                  <input
                    type="date"
                    required
                    value={formData.incident_date}
                    onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ جلسة التحقيق</label>
                  <input
                    type="date"
                    value={formData.investigation_date}
                    onChange={(e) => setFormData({ ...formData, investigation_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وصف الواقعة والمخالفة المنسوبة للموظف *</label>
                <textarea
                  required
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="بيان تفصيلي بالمخالفة وتوقيتها..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">إفادة الموظف وأقواله في التحقيق</label>
                <textarea
                  rows={2}
                  value={formData.employee_statement}
                  onChange={(e) => setFormData({ ...formData, employee_statement: e.target.value })}
                  placeholder="سماع إفادة العامل وأسبابه وأوجه دفاعه..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الجزاء التأديبي المعتمد *</label>
                  <select
                    value={formData.penalty_level}
                    onChange={(e) => handlePenaltyChange(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="verbal_notice">تنبيه شفوي (مخالفة أولى بسيطة)</option>
                    <option value="written_warning_1">إنذار كتابي أول</option>
                    <option value="written_warning_2">إنذار كتابي ثانٍ ونهائي</option>
                    <option value="salary_deduction_1day">خصم أجر يوم واحد من الراتب</option>
                    <option value="salary_deduction_3days">خصم أجر 3 أيام من الراتب</option>
                    <option value="suspension_5days">إيقاف عن العمل 5 أيام مع الحرمان من الأجر</option>
                    <option value="termination_art80">فسخ العقد بدون مكافأة (المادة 80)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">أيام الخصم من الراتب (إن وجد)</label>
                  <input
                    type="number"
                    value={formData.deduction_days}
                    onChange={(e) => setFormData({ ...formData, deduction_days: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition"
                >
                  اعتماد وتوقيع القرار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details View Modal */}
      {selectedViolation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800">محضر تحقيق وقرار جزاء إداري رسمي</h3>
              <button onClick={() => setSelectedViolation(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">الموظف:</span>
                <span className="font-bold text-slate-900">{selectedViolation.employee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ الواقعة:</span>
                <span>{selectedViolation.incident_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ التحقيق:</span>
                <span>{selectedViolation.investigation_date || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">لجنة التحقيق:</span>
                <span>{selectedViolation.investigator_name || 'الموارد البشرية'}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-slate-800">وصف المخالفة:</p>
              <p className="bg-slate-50 p-3 rounded-lg border text-slate-600">{selectedViolation.description}</p>

              <p className="font-bold text-slate-800">أقوال وإفادة الموظف:</p>
              <p className="bg-slate-50 p-3 rounded-lg border text-slate-600">{selectedViolation.employee_statement || 'تم تدوين الإفادة بمحضر التحقيق المكتوب'}</p>

              <p className="font-bold text-slate-800">القرار التأديبي الصادر:</p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                {getPenaltyBadge(selectedViolation.penalty_level)}
                {selectedViolation.deduction_amount > 0 && (
                  <p className="mt-1 text-rose-700 font-bold">مبلغ الخصم: {selectedViolation.deduction_amount.toLocaleString()} ر.س (خصم {selectedViolation.deduction_days} يوم)</p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={() => setSelectedViolation(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200"
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
