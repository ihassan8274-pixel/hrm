// طلبات الخدمة الذاتية — النماذج الخمسة في بوابة الموظف.
//
// كل نموذج يرفع طلباً واحداً يمرّ في سير الاعتماد، ويظهر للموظف حالته
// في أسفل الصفحة: ما الذي رُفع، وأين وصل، ومن اعتمد.
//
// ملاحظة أمنية: الموظف لا يختار نفسه — الخادم يقرأ الموظف من الجلسة.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Banknote, CalendarDays, MessageSquareWarning, Lightbulb, Workflow,
  Send, CheckCircle2, AlertCircle, Loader2, History, RefreshCw, Printer, X,
} from 'lucide-react';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

type RequestType = 'loan' | 'leave' | 'grievance' | 'suggestion' | 'workflow_improvement';

interface EssRequestsPanelProps {
  /** الموظف المعني — يُرسل للإشراف فقط؛ الموظف نفسه يقرأه من الجلسة. */
  employeeId?: number | null;
  /** الموظف يحدّد الموظف (وضع الإشراف). */
  canPickEmployee?: boolean;
}

interface WorkflowInfo {
  workflow_status: string | null;
  workflow_title: string | null;
  workflow_level?: number;
  workflow_max_levels?: number;
  workflow_history: any[];
}

interface RequestItem extends WorkflowInfo {
  id: number;
  request_type: RequestType;
  created_at: string;
  status: string;
  [key: string]: any;
}

interface RequestsResponse {
  loans: RequestItem[];
  leaves: RequestItem[];
  grievances: RequestItem[];
  suggestions: RequestItem[];
}

const EMPTY: RequestsResponse = { loans: [], leaves: [], grievances: [], suggestions: [] };

const FORMS: Array<{ type: RequestType; label: string; hint: string; icon: React.ElementType; color: string }> = [
  { type: 'loan', label: 'طلب سلفة', hint: 'سلفة شخصية على الراتب', icon: Banknote, color: 'text-emerald-600' },
  { type: 'leave', label: 'طلب إجازة', hint: 'سنوية أو رسمية أو طارئة', icon: CalendarDays, color: 'text-sky-600' },
  { type: 'grievance', label: 'نموذج شكوى', hint: 'تظلم إداري (المادة 209)', icon: MessageSquareWarning, color: 'text-rose-600' },
  { type: 'suggestion', label: 'نموذج مقترحات', hint: 'مقترح لتحسين العمل', icon: Lightbulb, color: 'text-amber-600' },
  { type: 'workflow_improvement', label: 'تطوير سير العمل', hint: 'توصية تطوير إجراء عمل', icon: Workflow, color: 'text-purple-600' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  active: 'ساري',
  submitted: 'مُستلم',
  under_review: 'قيد الفحص',
  accepted: 'مقبول',
  open: 'مفتوح',
  resolved: 'مغلق',
};

const statusLabel = (status: string) => STATUS_LABELS[status] || status;

const statusTone = (status: string) => {
  if (['approved', 'active', 'accepted', 'resolved'].includes(status)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (['rejected'].includes(status)) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const today = () => new Date().toISOString().slice(0, 10);

export const EssRequestsPanel: React.FC<EssRequestsPanelProps> = ({ employeeId }) => {
  const company = useLetterhead();
  const [activeType, setActiveType] = useState<RequestType>('loan');
  const [requests, setRequests] = useState<RequestsResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [printItem, setPrintItem] = useState<RequestItem | null>(null);

  useEffect(() => {
    if (!printItem) return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [printItem]);

  // حقول النماذج
  const nextMonth = new Date();
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanInstallment, setLoanInstallment] = useState('');
  const [loanStartMonth, setLoanStartMonth] = useState(String(nextMonth.getMonth() + 1));
  const [loanStartYear, setLoanStartYear] = useState(String(nextMonth.getFullYear()));
  const [loanMonths, setLoanMonths] = useState('12');
  const [leaveType, setLeaveType] = useState('annual');
  const [leaveStart, setLeaveStart] = useState(today());
  const [leaveEnd, setLeaveEnd] = useState(today());
  const [leaveReason, setLeaveReason] = useState('');
  const [grievanceSubject, setGrievanceSubject] = useState('');
  const [grievanceDetails, setGrievanceDetails] = useState('');
  const [grievanceCategory, setGrievanceCategory] = useState('work_environment');
  const [grievanceConfidential, setGrievanceConfidential] = useState(false);
  const [grievanceAgainst, setGrievanceAgainst] = useState('');
  const [suggestionTitle, setSuggestionTitle] = useState('');
  const [suggestionDetails, setSuggestionDetails] = useState('');
  const [suggestionCategory, setSuggestionCategory] = useState('operations');
  const [suggestionImpact, setSuggestionImpact] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const query = employeeId ? `?employee_id=${employeeId}` : '';
      const res = await fetch(`/api/ess/requests${query}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setRequests({
        loans: data?.loans || [],
        leaves: data?.leaves || [],
        grievances: data?.grievances || [],
        suggestions: data?.suggestions || [],
      });
    } catch {
      setRequests(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const base: Record<string, any> = { type: activeType };
    if (employeeId) base.employee_id = employeeId;

    if (activeType === 'loan') {
      base.total_amount = Number(loanAmount);
      base.monthly_installment = Number(loanInstallment);
      base.deduction_start_month = Number(loanStartMonth);
      base.deduction_start_year = Number(loanStartYear);
      base.deduction_months = Number(loanMonths);
      base.details = `خصم راتبي ${loanInstallment} ر.س من ${loanStartMonth}/${loanStartYear} لمدة ${loanMonths} شهر`;
    } else if (activeType === 'leave') {
      base.leave_type = leaveType;
      base.start_date = leaveStart;
      base.end_date = leaveEnd;
      base.details = leaveReason;
      base.title = `طلب إجازة من ${leaveStart} إلى ${leaveEnd}`;
    } else if (activeType === 'grievance') {
      base.subject = grievanceSubject;
      base.details = grievanceDetails;
      base.category = grievanceCategory;
      base.is_confidential = grievanceConfidential;
      base.against_person = grievanceAgainst;
    } else {
      base.title = suggestionTitle;
      base.details = suggestionDetails;
      base.category = suggestionCategory;
      base.expected_impact = suggestionImpact;
    }

    try {
      const res = await fetch('/api/ess/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(base),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ tone: 'err', text: data?.error || 'تعذّر رفع الطلب' });
        return;
      }
      setFeedback({ tone: 'ok', text: data?.message || 'تم رفع الطلب بنجاح' });
      // تصفير النموذج بعد القبول
      setLoanAmount(''); setLoanInstallment('');
      setLoanStartMonth(String(nextMonth.getMonth() + 1));
      setLoanStartYear(String(nextMonth.getFullYear()));
      setLoanMonths('12');
      setLeaveReason(''); setGrievanceSubject(''); setGrievanceDetails(''); setGrievanceAgainst('');
      setSuggestionTitle(''); setSuggestionDetails(''); setSuggestionImpact('');
      await loadRequests();
    } catch {
      setFeedback({ tone: 'err', text: 'تعذّر الاتصال بالخادم' });
    } finally {
      setSubmitting(false);
    }
  };

  const all: RequestItem[] = [
    ...requests.loans.map((r) => ({ ...r, request_type: 'loan' as RequestType })),
    ...requests.leaves.map((r) => ({ ...r, request_type: 'leave' as RequestType })),
    ...requests.grievances.map((r) => ({ ...r, request_type: 'grievance' as RequestType })),
    ...requests.suggestions.map((r) => ({ ...r, request_type: r.request_type || 'suggestion' })),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const describe = (item: RequestItem) => {
    if (item.request_type === 'loan') {
      return `سلفة ${Number(item.total_amount || 0).toLocaleString('ar-SA')} ر.س — خصم ${Number(item.monthly_installment || 0).toLocaleString('ar-SA')} ر.س` +
        (item.deduction_start_month && item.deduction_start_year ? ` من ${item.deduction_start_month}/${item.deduction_start_year}` : '') +
        (item.deduction_months ? ` لـ ${item.deduction_months} شهر` : '');
    }
    if (item.request_type === 'leave') {
      return `إجازة ${item.type === 'annual' ? 'سنوية' : item.type === 'sick' ? 'مرضية' : item.type === 'emergency' ? 'طارئة' : item.type} — ${item.days || 0} يوم (${item.start_date} → ${item.end_date})`;
    }
    if (item.request_type === 'grievance') {
      return `${item.ticket_number ? item.ticket_number + ' — ' : ''}${item.subject || 'شكوى'}`;
    }
    return `${item.title || 'مقترح'}${item.suggestion_type === 'workflow_improvement' ? ' (تطوير سير عمل)' : ''}`;
  };

  const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white';
  const labelCls = 'block text-xs font-bold text-slate-600 mb-1.5';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* اختيار النموذج */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-600" />
            اختر النموذج
          </h3>
          <div className="space-y-2">
            {FORMS.map((form) => {
              const Icon = form.icon;
              const active = activeType === form.type;
              return (
                <button
                  key={form.type}
                  type="button"
                  onClick={() => { setActiveType(form.type); setFeedback(null); }}
                  className={`w-full text-right p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    active
                      ? 'border-emerald-400 bg-emerald-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${form.color}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-slate-800">{form.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{form.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 rounded-xl p-3">
            كل نموذج يُرفع باسمك ويذهب إلى سير الاعتماد، وتابع حالته في «طلباتي» بالأسفل.
          </p>
        </div>

        {/* النموذج */}
        <form onSubmit={submit} className="lg:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-800">
            {FORMS.find((f) => f.type === activeType)?.label}
          </h3>

          {activeType === 'loan' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>قيمة السلفة (ر.س)</label>
                <input type="number" min="1" required value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className={inputCls} placeholder="5000" />
              </div>
              <div>
                <label className={labelCls}>الخصم من الراتب شهرياً (ر.س)</label>
                <input type="number" min="1" required value={loanInstallment}
                  onChange={(e) => setLoanInstallment(e.target.value)}
                  className={inputCls} placeholder="500" />
              </div>
              <div>
                <label className={labelCls}>شهر بداية الخصم</label>
                <select value={loanStartMonth} onChange={(e) => setLoanStartMonth(e.target.value)} className={inputCls}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>سنة البداية</label>
                <input type="number" min="2000" max="2100" required value={loanStartYear}
                  onChange={(e) => setLoanStartYear(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>عدد أشهر الخصم</label>
                <input type="number" min="1" max="240" required value={loanMonths}
                  onChange={(e) => setLoanMonths(e.target.value)} className={inputCls} placeholder="12" />
              </div>
              <p className="sm:col-span-2 text-[11px] text-slate-500">
                الخصم يبدأ من الشهر المحدد ويتوقف بعد عدد الأشهر المحدد — عبر نظام حماية الأجور (مدد)، ولا تتجاوز السلفة 12 راتباً.
              </p>
            </div>
          )}

          {activeType === 'leave' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>نوع الإجازة</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputCls}>
                  <option value="annual">سنوية</option>
                  <option value="sick">مرضية</option>
                  <option value="emergency">طارئة</option>
                  <option value="unpaid">بدون راتب</option>
                  <option value="maternity">أمومة</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>من تاريخ</label>
                <input type="date" required value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>إلى تاريخ</label>
                <input type="date" required value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-3">
                <label className={labelCls}>السبب</label>
                <textarea rows={3} value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className={inputCls} placeholder="سبب الطلب وما يلزم من مستندات" />
              </div>
            </div>
          )}

          {activeType === 'grievance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>موضوع الشكوى</label>
                  <input type="text" required value={grievanceSubject}
                    onChange={(e) => setGrievanceSubject(e.target.value)}
                    className={inputCls} placeholder="عنوان مختصر للشكوى" />
                </div>
                <div>
                  <label className={labelCls}>تصنيف الشكوى</label>
                  <select value={grievanceCategory} onChange={(e) => setGrievanceCategory(e.target.value)} className={inputCls}>
                    <option value="work_environment">بيئة العمل</option>
                    <option value="harassment">تحرش أو مضايقة</option>
                    <option value="discrimination">تمييز</option>
                    <option value="pay_dispute">خلاف رواتب</option>
                    <option value="working_conditions">ظروف العمل</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>تفاصيل الشكوى</label>
                <textarea rows={4} required value={grievanceDetails}
                  onChange={(e) => setGrievanceDetails(e.target.value)}
                  className={inputCls} placeholder="اشرح ما حدث وما تطلبه" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className={labelCls}>الجهة أو الشخص المعني (اختياري)</label>
                  <input type="text" value={grievanceAgainst}
                    onChange={(e) => setGrievanceAgainst(e.target.value)}
                    className={inputCls} placeholder="الاسم أو الإدارة" />
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 pb-3">
                  <input type="checkbox" checked={grievanceConfidential}
                    onChange={(e) => setGrievanceConfidential(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                  شكاوى سرّية (لا تُعرض على غير لجنة الفحص)
                </label>
              </div>
            </div>
          )}

          {(activeType === 'suggestion' || activeType === 'workflow_improvement') && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>عنوان المقترح</label>
                  <input type="text" required value={suggestionTitle}
                    onChange={(e) => setSuggestionTitle(e.target.value)}
                    className={inputCls}
                  placeholder={activeType === 'workflow_improvement' ? 'أي إجراء نقولح تطويره؟' : 'عنوان مختصر'} />
                </div>
                <div>
                  <label className={labelCls}>التصنيف</label>
                  <select value={suggestionCategory} onChange={(e) => setSuggestionCategory(e.target.value)} className={inputCls}>
                    <option value="operations">إجراءات التشغيل</option>
                    <option value="service">خدمة العملاء</option>
                    <option value="safety">السلامة والجودة</option>
                    <option value="training">التدريب والتطوير</option>
                    <option value="digital">التحول الرقمي</option>
                    <option value="workflow">سير العمل والاعتمادات</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>تفاصيل المقترح</label>
                <textarea rows={4} required value={suggestionDetails}
                  onChange={(e) => setSuggestionDetails(e.target.value)}
                  className={inputCls} placeholder="ما المشكلة؟ وما المقترح؟ وكيف سيُطبَّق؟" />
              </div>
              <div>
                <label className={labelCls}>الأثر المتوقع (اختياري)</label>
                <input type="text" value={suggestionImpact}
                  onChange={(e) => setSuggestionImpact(e.target.value)}
                  className={inputCls} placeholder="الوقت الموفَّر أو التكلفة أو أثر رضا الموظفين" />
              </div>
            </div>
          )}

          {feedback && (
            <div className={`flex items-start gap-2 text-xs font-bold rounded-xl p-3 border ${
              feedback.tone === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {feedback.tone === 'ok'
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{feedback.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-all"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'جارِ الإرسال...' : 'إرسال الطلب'}
          </button>
        </form>
      </div>

      {/* طلباتي */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-600" />
            طلباتي ({all.length})
          </h3>
          <button
            onClick={loadRequests}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && all.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">جارِ تحميل الطلبات...</p>
        ) : all.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-xl">
            لا توجد طلبات مرفوعة بعد — ابدأ باختيار نموذج من الأعلى.
          </p>
        ) : (
          <div className="space-y-2.5">
            {all.map((item) => {
              const form = FORMS.find((f) => f.type === item.request_type);
              const Icon = form?.icon || Send;
              const level = item.workflow_level && item.workflow_max_levels
                ? ` — المستوى ${item.workflow_level} من ${item.workflow_max_levels}`
                : '';
              return (
                <div key={`${item.request_type}-${item.id}`} className="p-4 border border-slate-200 rounded-2xl bg-slate-50/40 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${form?.color || 'text-slate-500'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800">{describe(item)}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {form?.label || 'طلب'} · {item.created_at ? String(item.created_at).slice(0, 10) : '—'}
                          {item.workflow_title ? ` · ${item.workflow_title}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${statusTone(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                      {item.workflow_status && (
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${statusTone(item.workflow_status)}`}>
                          سير العمل: {statusLabel(item.workflow_status)}{level}
                        </span>
                      )}
                      <button
                        onClick={() => setPrintItem(item)}
                        title="طباعة الطلب ومسار اعتماده"
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {Array.isArray(item.workflow_history) && item.workflow_history.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/70 space-y-1">
                      {item.workflow_history.map((h: any, idx: number) => (
                        <p key={idx} className="text-[11px] text-slate-500">
                          <span className="font-bold text-slate-700">{h.actor_name || 'معتمد'}</span>
                          {' — '}
                          {h.action === 'approved' ? 'اعتمد' : h.action === 'rejected' ? 'رفض' : h.action}
                          {h.action_date ? ` · ${h.action_date}` : ''}
                          {h.comments ? ` · ${h.comments}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.hr_response && (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                      ردّ الموارد البشرية: {item.hr_response}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نسخة مطبوعة من الطلب ومسار اعتماده — عزل print-document في CSS الطباعة */}
      {printItem && (
        <div className="print-document bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="no-print flex justify-end gap-2 mb-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={() => setPrintItem(null)} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold">
              <X className="w-4 h-4" /> إغلاق
            </button>
          </div>
          <Letterhead company={company} title={FORMS.find((f) => f.type === printItem.request_type)?.label || 'طلب موظف'} />
          <div className="flex justify-between text-sm border-b border-slate-200 pb-3">
            <span className="font-bold">
              {printItem.ticket_number || `${String(printItem.request_type).toUpperCase()}-${String(printItem.id).padStart(5, '0')}`}
            </span>
            <span>تاريخ الطلب: {printItem.created_at ? String(printItem.created_at).slice(0, 10) : '—'}</span>
          </div>
          <table className="w-full text-sm border border-slate-300">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="p-2 font-bold bg-slate-50 w-40">مقدم الطلب</td>
                <td className="p-2">{printItem.employee_name || '—'}</td>
                <td className="p-2 font-bold bg-slate-50 w-40">الحالة</td>
                <td className="p-2 font-bold">{statusLabel(printItem.status)}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-2 font-bold bg-slate-50">الطلب</td>
                <td className="p-2" colSpan={3}>{describe(printItem)}</td>
              </tr>
              {(printItem.details || printItem.reason) && (
                <tr className="border-b border-slate-300">
                  <td className="p-2 font-bold bg-slate-50">التفاصيل</td>
                  <td className="p-2 whitespace-pre-wrap" colSpan={3}>{printItem.details || printItem.reason}</td>
                </tr>
              )}
              {printItem.expected_impact && (
                <tr className="border-b border-slate-300">
                  <td className="p-2 font-bold bg-slate-50">الأثر المتوقع</td>
                  <td className="p-2" colSpan={3}>{printItem.expected_impact}</td>
                </tr>
              )}
              {printItem.hr_response && (
                <tr>
                  <td className="p-2 font-bold bg-slate-50">رد الموارد البشرية</td>
                  <td className="p-2" colSpan={3}>{printItem.hr_response}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div>
            <p className="font-bold text-sm mb-2">
              مسار الاعتماد{printItem.workflow_title ? ` — ${printItem.workflow_title}` : ''}
              {printItem.workflow_max_levels ? ` (المستوى ${printItem.workflow_level} من ${printItem.workflow_max_levels})` : ''}
            </p>
            {Array.isArray(printItem.workflow_history) && printItem.workflow_history.length > 0 ? (
              <table className="w-full text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 border-b border-slate-300 text-right">المستوى</th>
                    <th className="p-2 border-b border-slate-300 text-right">صاحب القرار</th>
                    <th className="p-2 border-b border-slate-300 text-right">القرار</th>
                    <th className="p-2 border-b border-slate-300 text-right">التاريخ</th>
                    <th className="p-2 border-b border-slate-300 text-right">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {printItem.workflow_history.map((h: any, i: number) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="p-2">{h.level}</td>
                      <td className="p-2">{h.actor_name}</td>
                      <td className="p-2 font-bold">{h.action === 'approved' ? 'اعتماد' : h.action === 'rejected' ? 'رفض' : h.action}</td>
                      <td className="p-2 font-mono" dir="ltr">{h.action_date}</td>
                      <td className="p-2">{h.comments || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">لم تُسجَّل قرارات بعد — الطلب بانتظار الاعتماد.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 pt-8 text-center text-sm">
            <div>
              <p className="font-bold mb-8">توقيع مقدم الطلب</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
            </div>
            <div>
              <p className="font-bold mb-8">اعتماد الموارد البشرية</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
            </div>
          </div>
          <DocumentFooter company={company} reference={`${String(printItem.request_type).toUpperCase()}-${String(printItem.id).padStart(5, '0')}`} />
        </div>
      )}
    </div>
  );
};

export default EssRequestsPanel;
