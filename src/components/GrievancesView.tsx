import React, { useState, useEffect } from 'react';
import { 
  Scale, 
  ShieldAlert, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Eye, 
  UserX, 
  Award, 
  Lock, 
  Users, 
  Printer, 
  X, 
  Check, 
  Calendar, 
  Building2,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { EmployeeGrievance, HearingSession, OfficialWarningNotice } from '../types';
import { Letterhead } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

interface GrievancesViewProps {
  onBack?: () => void;
}

export const GrievancesView: React.FC<GrievancesViewProps> = () => {
  const [activeTab, setActiveTab] = useState<'grievances' | 'hearings' | 'warnings'>('grievances');
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();
  const [grievances, setGrievances] = useState<EmployeeGrievance[]>([]);
  const [hearings, setHearings] = useState<HearingSession[]>([]);
  const [warnings, setWarnings] = useState<OfficialWarningNotice[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showNewGrievance, setShowNewGrievance] = useState(false);
  const [showNewHearing, setShowNewHearing] = useState(false);
  const [showNewWarning, setShowNewWarning] = useState(false);
  const [selectedWarningForPrint, setSelectedWarningForPrint] = useState<OfficialWarningNotice | null>(null);

  // Form states
  const [newGrievance, setNewGrievance] = useState({
    employee_id: 1,
    category: 'work_environment' as const,
    subject: '',
    details: '',
    is_confidential: 1,
    against_person: ''
  });

  const [newHearing, setNewHearing] = useState({
    grievance_id: 1,
    session_title: '',
    session_date: new Date().toISOString().split('T')[0],
    location: 'غرفة التحقيقات الإدارية والامتثال',
    committee_chair: 'عبد الله بن فهد السبيعي',
    hr_representative: 'سارة بنت خالد العتيبي',
    legal_counsel: 'المستشار القانوني للمنشأة',
    employee_name: '',
    witnesses: '',
    statements_minutes: '',
    committee_verdict: '',
    recommended_sanction: 'none' as const,
    deduction_days: 0
  });

  const [newWarning, setNewWarning] = useState({
    employee_id: 1,
    warning_type: 'first_warning' as const,
    violation_clause: 'المادة (12) من لائحة تنظيم العمل: التأخر الصباحي غير المبرر',
    violation_date: new Date().toISOString().split('T')[0],
    investigation_ref: 'INV-2026-01',
    penalty_details: 'توجيه إنذار كتابي أول مع حسم يوم من الأجر الأساسي في حال تكرار المخالفة.',
    deduction_amount: 0,
    issued_by: 'عبد الله بن فهد السبيعي - مدير الموارد البشرية'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gRes, hRes, wRes] = await Promise.all([
        fetch('/api/grievances'),
        fetch('/api/hearings'),
        fetch('/api/warnings')
      ]);

      if (gRes.ok) setGrievances(await gRes.json());
      if (hRes.ok) setHearings(await hRes.json());
      if (wRes.ok) setWarnings(await wRes.json());
    } catch (e) {
      console.error("Failed to load grievances data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/grievances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGrievance)
      });
      if (res.ok) {
        setShowNewGrievance(false);
        setNewGrievance({
          employee_id: 1,
          category: 'work_environment',
          subject: '',
          details: '',
          is_confidential: 1,
          against_person: ''
        });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/hearings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHearing)
      });
      if (res.ok) {
        setShowNewHearing(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/warnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWarning)
      });
      if (res.ok) {
        setShowNewWarning(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id: number, status: string, notes?: string, resolution?: string) => {
    try {
      await fetch(`/api/grievances/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, committee_notes: notes, resolution_summary: resolution })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> تمت المعالجة والتسوية</span>;
      case 'under_review':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> قيد المراجعة والتحقق</span>;
      case 'committee_assigned':
      case 'hearing_scheduled':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200"><Scale className="w-3.5 h-3.5" /> لجنة تحقيق مشكلة</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200"><Clock className="w-3.5 h-3.5" /> بانتظار الإحالة</span>;
    }
  };

  const getWarningBadge = (type: string) => {
    switch (type) {
      case 'attention_notice':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">لفت نظر إداري</span>;
      case 'first_warning':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">إنذار كتابي أول</span>;
      case 'second_warning':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">إنذار كتابي ثانٍ</span>;
      case 'final_warning':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">إنذار نهائي قبل الفصل</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">حسم من الراتب</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 text-brand-700 rounded-lg border border-brand-100">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">إدارة التظلمات ولجان التحقيق والإنذارات الرسمية</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                تطبيق المادة (209) من نظام العمل ولائحة الجزاءات وتأديب العمل المعتمدة من وزارة الموارد البشرية
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'grievances' && (
            <button
              onClick={() => setShowNewGrievance(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>تقديم تظلم إداري جديد</span>
            </button>
          )}
          {activeTab === 'hearings' && (
            <button
              onClick={() => setShowNewHearing(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>توثيق محضر جلسة تحقيق</span>
            </button>
          )}
          {activeTab === 'warnings' && (
            <button
              onClick={() => setShowNewWarning(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>إصدار إنذار رسمي أو لفت نظر</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('grievances')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'grievances'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>سجل تظلمات الموظفين</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
            {grievances.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('hearings')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'hearings'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>محاضر لجان التحقيق الإداري</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
            {hearings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('warnings')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'warnings'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>سجل الإنذارات والعقوبات المعتمدة</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
            {warnings.length}
          </span>
        </button>
      </div>

      {/* TAB 1: GRIEVANCES */}
      {activeTab === 'grievances' && (
        <div className="grid grid-cols-1 gap-4">
          {grievances.map((g) => (
            <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded font-semibold">
                    {g.ticket_number}
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">{g.subject}</h3>
                  {g.is_confidential === 1 && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                      <Lock className="w-3 h-3" /> سري ومحمي
                    </span>
                  )}
                </div>
                <div>{getStatusBadge(g.status)}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
                <div>
                  <span className="text-slate-500 block text-xs">الموظف صاحب التظلم:</span>
                  <span className="font-semibold text-slate-800">{g.employee_name || 'موظف في المنشأة'} ({g.department_name || 'عام'})</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">التصنيف النظامي:</span>
                  <span className="font-medium text-slate-800">
                    {g.category === 'appraisal_dispute' ? 'اعتراض على التقييم السنوي' : 
                     g.category === 'work_environment' ? 'بيئة العمل والتجهيزات' :
                     g.category === 'unpaid_dues' ? 'مستحقات أو بدلات مالية' : 'إداري عام'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">تاريخ التقديم:</span>
                  <span className="font-medium text-slate-800">{new Date(g.created_at).toLocaleDateString('ar-SA')}</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-700 leading-relaxed bg-white border border-slate-100 p-3.5 rounded-lg">
                {g.details}
              </p>

              {g.committee_notes && (
                <div className="mt-3 bg-brand-50/70 border border-brand-100 p-3 rounded-lg text-sm text-brand-900">
                  <span className="font-bold block text-xs text-brand-700 mb-1">ملاحظات وقرار لجنة التحقيق والامتثال:</span>
                  {g.committee_notes}
                </div>
              )}

              {g.resolution_summary && (
                <div className="mt-2 bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-sm text-emerald-900">
                  <span className="font-bold block text-xs text-emerald-700 mb-1">نتيجة التسوية والإجراء المتخذ:</span>
                  {g.resolution_summary}
                </div>
              )}

              {g.status !== 'resolved' && (
                <div className="mt-4 flex items-center gap-2 justify-end pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleUpdateStatus(g.id, 'resolved', 'تمت التسوية باتفاق الطرفين ومطابقة اللائحة', 'تسوية نهائية معتمدة')}
                    className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> اعتماد التسوية وإغلاق التظلم
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(g.id, 'committee_assigned', 'تمت إحالة التظلم إلى اللجنة القانونية لتحديد جلسة تحقيق')}
                    className="px-3.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    إحالة للجنة التحقيق
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: HEARINGS */}
      {activeTab === 'hearings' && (
        <div className="space-y-4">
          {hearings.map((h) => (
            <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{h.session_title}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {h.session_date}</span>
                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {h.location}</span>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-200">
                  جلسة مكتملة وموثقة
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-lg text-xs">
                <div>
                  <span className="text-slate-500 block">رئيس لجنة التحقيق:</span>
                  <span className="font-semibold text-slate-800 text-sm">{h.committee_chair}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">ممثل الموارد البشرية والامتثال:</span>
                  <span className="font-semibold text-slate-800 text-sm">{h.hr_representative}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">المستشار القانوني:</span>
                  <span className="font-semibold text-slate-800 text-sm">{h.legal_counsel}</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="border border-slate-200 rounded-lg p-3.5">
                  <span className="text-xs font-bold text-slate-700 block mb-1">وقائع وأقوال المحضر:</span>
                  <p className="text-sm text-slate-600 leading-relaxed">{h.statements_minutes}</p>
                </div>

                <div className="bg-brand-50/60 border border-brand-200 rounded-lg p-3.5">
                  <span className="text-xs font-bold text-brand-900 block mb-1">قرار وحكم اللجنة النظامي:</span>
                  <p className="text-sm text-brand-900 leading-relaxed">{h.committee_verdict}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: WARNINGS */}
      {activeTab === 'warnings' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {warnings.map((w) => (
              <div key={w.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded">
                      {w.notice_number}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900">{w.employee_name} ({w.job_title || 'موظف'})</h4>
                      <p className="text-xs text-slate-500">الهوية/الإقامة: {w.national_id || '1098234510'} | الإدارة: {w.department_name || 'عام'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getWarningBadge(w.warning_type)}
                    <button
                      onClick={() => setSelectedWarningForPrint(w)}
                      className="p-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                      title="طباعة نموذج الإنذار الرسمي"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-xs text-slate-500 block">المادة والفقرة النظامية:</span>
                    <span className="font-medium text-slate-800">{w.violation_clause}</span>
                  </div>
                  <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100">
                    <span className="text-xs text-rose-700 block">الجزاء التأديبي الموقع:</span>
                    <span className="font-medium text-rose-900">{w.penalty_details}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <span>تاريخ ارتكاب المخالفة: {w.violation_date}</span>
                  <span>الموقع والجهة المصدرة: {w.issued_by}</span>
                  <span className="text-emerald-600 font-medium">✓ تم إخطار الموظف واستلام التوقيع</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: NEW GRIEVANCE */}
      {showNewGrievance && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Scale className="w-5 h-5 text-brand-600" />
                تقديم تظلم إداري (المادة 209 من نظام العمل)
              </h3>
              <button onClick={() => setShowNewGrievance(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGrievance} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">موضوع التظلم الرئيسي:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: اعتراض على تقييم الأداء أو احتساب بدلات"
                  value={newGrievance.subject}
                  onChange={(e) => setNewGrievance({ ...newGrievance, subject: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تصنيف التظلم:</label>
                  <select
                    value={newGrievance.category}
                    onChange={(e) => setNewGrievance({ ...newGrievance, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="appraisal_dispute">اعتراض على التقييم السنوي</option>
                    <option value="work_environment">بيئة العمل والتجهيزات</option>
                    <option value="unpaid_dues">مستحقات أو بدلات مالية</option>
                    <option value="harassment_mistreatment">معاملة إدارية أو بيئة العمل</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">المعني بالتظلم (اختياري):</label>
                  <input
                    type="text"
                    placeholder="اسم المدير أو الإدارة"
                    value={newGrievance.against_person}
                    onChange={(e) => setNewGrievance({ ...newGrievance, against_person: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">تفاصيل ووقائع التظلم بالأدلة:</label>
                <textarea
                  required
                  rows={4}
                  placeholder="يرجى ذكر الوقائع والتواريخ والشهود إن وجدوا..."
                  value={newGrievance.details}
                  onChange={(e) => setNewGrievance({ ...newGrievance, details: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newGrievance.is_confidential === 1}
                    onChange={(e) => setNewGrievance({ ...newGrievance, is_confidential: e.target.checked ? 1 : 0 })}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>معاملة التظلم بسرية تامة ومباشرة مع اللجنة القانونية</span>
                </label>

                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  إرسال التظلم رسمياً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW HEARING */}
      {showNewHearing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-lg">توثيق محضر جلسة تحقيق رسمي</h3>
              <button onClick={() => setShowNewHearing(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateHearing} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الجلسة والموضوع:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: جلسة استماع بخصوص مخالفة تأخير أو تظلم تقييم"
                  value={newHearing.session_title}
                  onChange={(e) => setNewHearing({ ...newHearing, session_title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الموظف المعني:</label>
                  <input
                    type="text"
                    required
                    placeholder="الاسم الكامل"
                    value={newHearing.employee_name}
                    onChange={(e) => setNewHearing({ ...newHearing, employee_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ الجلسة:</label>
                  <input
                    type="date"
                    required
                    value={newHearing.session_date}
                    onChange={(e) => setNewHearing({ ...newHearing, session_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">وقائع وأقوال الجلسة:</label>
                <textarea
                  required
                  rows={3}
                  placeholder="تم الاستماع إلى الموظف ومناقشة المستندات..."
                  value={newHearing.statements_minutes}
                  onChange={(e) => setNewHearing({ ...newHearing, statements_minutes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">قرار وتوصية اللجنة:</label>
                <textarea
                  required
                  rows={2}
                  placeholder="توصية اللجنة وتكييفها النظامي..."
                  value={newHearing.committee_verdict}
                  onChange={(e) => setNewHearing({ ...newHearing, committee_verdict: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  حفظ المحضر واعتماده
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW WARNING */}
      {showNewWarning && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-5 h-5" />
                إصدار إشعار جزاء تأديبي / إنذار رسمي
              </h3>
              <button onClick={() => setShowNewWarning(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWarning} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">نوع الإنذار / الجزاء:</label>
                  <select
                    value={newWarning.warning_type}
                    onChange={(e) => setNewWarning({ ...newWarning, warning_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="attention_notice">لفت نظر خطي</option>
                    <option value="first_warning">إنذار كتابي أول</option>
                    <option value="second_warning">إنذار كتابي ثانٍ</option>
                    <option value="final_warning">إنذار نهائي قبل الفصل</option>
                    <option value="salary_deduction">حسم من الراتب</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ المخالفة:</label>
                  <input
                    type="date"
                    required
                    value={newWarning.violation_date}
                    onChange={(e) => setNewWarning({ ...newWarning, violation_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">المادة المخالفة في لائحة تنظيم العمل:</label>
                <input
                  type="text"
                  required
                  value={newWarning.violation_clause}
                  onChange={(e) => setNewWarning({ ...newWarning, violation_clause: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">تفاصيل العقوبة والجزاء المترتب:</label>
                <textarea
                  required
                  rows={3}
                  value={newWarning.penalty_details}
                  onChange={(e) => setNewWarning({ ...newWarning, penalty_details: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  إصدار الإنذار وتوثيقه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINT PREVIEW */}
      {selectedWarningForPrint && (
        <div className="print-modal-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="print-document bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl space-y-6 border border-slate-200">
            <Letterhead company={company} />
            <div className="flex items-center justify-between border-b pb-4">
              <div className="text-right">
                <h2 className="text-xl font-bold text-slate-900">إشعار جزاء تأديبي رسمي</h2>
                <p className="text-xs text-slate-500">طبقا للمادة (66) و(67) من نظام العمل السعودي ولائحة الجزاءات</p>
              </div>
              <button onClick={() => setSelectedWarningForPrint(null)} className="no-print text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">رقم الإشعار:</span>
                <span className="font-bold font-mono text-slate-800 text-sm">{selectedWarningForPrint.notice_number}</span>
              </div>
              <div>
                <span className="text-slate-500 block">تاريخ الإصدار:</span>
                <span className="font-bold text-slate-800 text-sm">{selectedWarningForPrint.issue_date}</span>
              </div>
              <div>
                <span className="text-slate-500 block">اسم الموظف المخالف:</span>
                <span className="font-bold text-slate-800 text-sm">{selectedWarningForPrint.employee_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">الإدارة والوظيفة:</span>
                <span className="font-bold text-slate-800 text-sm">{selectedWarningForPrint.job_title} - {selectedWarningForPrint.department_name}</span>
              </div>
            </div>

            <div className="space-y-4 text-sm text-slate-800">
              <div className="border-r-4 border-rose-500 pr-3 py-1">
                <span className="font-bold block text-xs text-slate-500">المخالفة المرتكبة والسند النظامي:</span>
                <p className="mt-1 font-medium">{selectedWarningForPrint.violation_clause}</p>
              </div>

              <div className="border-r-4 border-brand-500 pr-3 py-1">
                <span className="font-bold block text-xs text-slate-500">الجزاء المقرر:</span>
                <p className="mt-1 font-medium">{selectedWarningForPrint.penalty_details}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-xs text-center">
              <div className="border-t border-dashed border-slate-300 pt-3">
                <span className="text-slate-500 block">توقيع المستلم (الموظف):</span>
                <span className="font-bold mt-2 block">تم التوقيع إلكترونياً</span>
              </div>
              <div className="border-t border-dashed border-slate-300 pt-3">
                <span className="text-slate-500 block">اعتماد مدير الموارد البشرية:</span>
                <span className="font-bold mt-2 block">{selectedWarningForPrint.issued_by}</span>
              </div>
            </div>

            <div className="no-print flex justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-brand-700"
              >
                <Printer className="w-4 h-4" /> طباعة الإشعار
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
