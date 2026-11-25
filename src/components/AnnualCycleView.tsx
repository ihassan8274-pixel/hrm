import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BadgeDollarSign, CalendarClock, CheckCircle2, ClipboardList, Download, Printer, RefreshCw, Star, X, XCircle } from 'lucide-react';
import { downloadProtectedFile } from '../lib/api';
import { useLetterhead } from '../lib/print/use-letterhead';
import { DocumentFooter, Letterhead } from '../lib/print/letterhead';

type Criterion = { key: string; label: string };
type ApprovalStep = { key: string; label: string; roles: string[] };
type Overview = {
  year: number;
  employees: number;
  reviews: number;
  approved: number;
  pending: number;
  reminders: number;
  criteria: Criterion[];
  approval_steps: ApprovalStep[];
};

const FALLBACK_CRITERIA: Criterion[] = [
  { key: 'attendance', label: 'الالتزام والحضور' },
  { key: 'quality', label: 'جودة الأداء' },
  { key: 'productivity', label: 'الإنتاجية' },
  { key: 'teamwork', label: 'العمل الجماعي والقيادة' },
  { key: 'safety', label: 'السلامة وإجراءات الغذاء' },
];
const FALLBACK_STEPS: ApprovalStep[] = [
  { key: 'supervisor', label: 'المشرف', roles: [] },
  { key: 'manager', label: 'المدير', roles: [] },
  { key: 'finance', label: 'المالية', roles: [] },
  { key: 'hr', label: 'الموارد البشرية', roles: [] },
];

const STATUS: Record<string, string> = {
  pending: 'بانتظار المشرف',
  supervisor: 'بانتظار المدير',
  manager: 'بانتظار المالية',
  finance: 'بانتظار الموارد البشرية',
  hr: 'اكتملت الاعتمادات',
  approved: 'معتمد ونافذ',
  rejected: 'مرفوض',
};
const CATEGORY: Record<string, string> = {
  saudi: 'سعودي',
  company_sponsored: 'كفالة شركة',
  leased: 'مستأجر',
};
const money = (n: unknown) => Number(n || 0).toLocaleString('en-US');
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const nowYear = () => new Date().getFullYear();
const nowMonth = () => new Date().getMonth() + 1;
const YEARS = Array.from({ length: 5 }, (_, i) => nowYear() - 1 + i);
const monthOf = (value: unknown) => Number(String(value || '').slice(5, 7)) || 0;
const yearOf = (value: unknown) => Number(String(value || '').slice(0, 4)) || 0;
const anniversaryMonth = (e: any) => {
  const hire = String(e?.hire_date || '');
  return /^\d{4}-\d{2}-\d{2}/.test(hire) ? Number(hire.slice(5, 7)) : Number(e?.hire_month || 0);
};
const ratingOf = (total: number) =>
  total <= 12 ? 'يحتاج خطة تحسين' : total <= 17 ? 'مقبول' : total <= 21 ? 'جيد' : 'ممتاز';

type EligibleRow = {
  id: number;
  name: string;
  category: string;
  hire: string;
  anniversary: string;
  salary: number;
  reminder: string;
  review: string;
  decision: string;
};
type PrintDoc =
  | { kind: 'eligible'; rows: EligibleRow[]; month: number; year: number }
  | { kind: 'evaluation'; employee: string; reviewer: string; date: string; rows: { label: string; score: number; note: string }[]; total: number; rating: string; summary: string }
  | { kind: 'increase'; employee: string; year: number; review: string; previous: number; amount: number; percentage: number; next: number; date: string; reason: string; steps: string[] }
  | { kind: 'approved'; rows: any[]; month: number; year: number; totalAmount: number };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `طلب غير ناجح (${res.status})`);
  return body as T;
}

export default function AnnualCycleView() {
  const [tab, setTab] = useState<'reminders' | 'evaluation' | 'decision' | 'approvals'>('reminders');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewer, setReviewer] = useState('');
  const [reviewDate, setReviewDate] = useState(today());
  const [summary, setSummary] = useState('');

  const [decisionEmployeeId, setDecisionEmployeeId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [reason, setReason] = useState('');
  const [approvalNote, setApprovalNote] = useState<Record<number, string>>({});

  const company = useLetterhead();
  const [printDoc, setPrintDoc] = useState<PrintDoc | null>(null);
  const [eligibleMonth, setEligibleMonth] = useState(nowMonth());
  const [eligibleYear, setEligibleYear] = useState(nowYear());
  const [approvedMonth, setApprovedMonth] = useState(nowMonth());
  const [approvedYear, setApprovedYear] = useState(nowYear());

  // فتح نافذة الطباعة بعد رسم الورقة، حتى لا تُطبع الواجهة قبل ظهورها.
  useEffect(() => {
    if (!printDoc) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [printDoc]);

  const criteria = overview?.criteria?.length ? overview.criteria : FALLBACK_CRITERIA;
  const steps = overview?.approval_steps?.length ? overview.approval_steps : FALLBACK_STEPS;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [ov, emps, rem, rev, dec] = await Promise.all([
        api<Overview>('/api/annual/overview'),
        api<any[]>('/api/employees'),
        api<any[]>('/api/annual/reminders'),
        api<any[]>('/api/annual/reviews'),
        api<any[]>('/api/annual/increases'),
      ]);
      setOverview(ov);
      setEmployees(emps || []);
      setReminders(rem || []);
      setReviews(rev || []);
      setDecisions(dec || []);
      setEmployeeId((prev) => prev || Number(emps?.[0]?.id || '') || '');
      setDecisionEmployeeId((prev) => prev || Number(emps?.[0]?.id || '') || '');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exportAudit = async () => {
    const year = Number(overview?.year || nowYear());
    const error = await downloadProtectedFile(
      `/api/annual/audit?year=${year}`,
      `annual-increase-audit-${year}.csv`
    );
    if (error) setMessage(error.message);
  };

  const selectedReview = useMemo(
    () => reviews.find((r) => Number(r.employee_id) === Number(decisionEmployeeId)),
    [reviews, decisionEmployeeId],
  );
  const suggested = useMemo(() => {
    const rating = String(selectedReview?.rating || '');
    const pct = rating === 'ممتاز' ? 5 : rating === 'جيد' ? 3 : rating === 'مقبول' ? 2 : 0;
    return Math.round(Number(selectedReview?.basic_salary || 0) * pct / 100);
  }, [selectedReview]);

  const buildEligibleRows = (month: number, year: number): EligibleRow[] =>
    employees
      .filter((e) => anniversaryMonth(e) === month)
      .map((e) => {
        const id = Number(e.id);
        const rem = reminders.find((r) => Number(r.employee_id) === id);
        const rev = reviews.find((r) => Number(r.employee_id) === id);
        const dec = decisions.find((d) => Number(d.employee_id) === id);
        return {
          id,
          name: String(e.name || '—'),
          category: CATEGORY[e.sponsorship_type] || e.sponsorship_type || '—',
          hire: e.hire_date || (e.hire_month ? `شهر ${e.hire_month}` : '—'),
          anniversary: rem?.anniversary_date ? String(rem.anniversary_date).slice(0, 10) : `${year}-${String(month).padStart(2, '0')}`,
          salary: Number(e.basic_salary || 0),
          reminder: rem ? (rem.status === 'pending' ? 'معلّق' : String(rem.status)) : 'لم يُنشأ',
          review: rev ? `${rev.total_score}/25 — ${rev.rating}` : '—',
          decision: dec ? (STATUS[dec.status] || dec.status) : '—',
        };
      });

  const approvedRowsFor = (month: number, year: number) =>
    decisions.filter((d) => d.status === 'approved' && monthOf(d.effective_date) === month && yearOf(d.effective_date) === year);

  const printEligible = () =>
    setPrintDoc({ kind: 'eligible', rows: buildEligibleRows(eligibleMonth, eligibleYear), month: eligibleMonth, year: eligibleYear });

  const printEvaluation = () => {
    if (!employeeId) return setMessage('اختر الموظف أولاً');
    const rows = criteria.map((c) => ({ label: c.label, score: Number(scores[c.key] || 0), note: notes[c.key] || '' }));
    const total = rows.reduce((sum, r) => sum + r.score, 0);
    setPrintDoc({
      kind: 'evaluation',
      employee: String(employees.find((e) => Number(e.id) === Number(employeeId))?.name || '—'),
      reviewer, date: reviewDate, rows, total, rating: ratingOf(total), summary,
    });
  };

  const printIncrease = () => {
    if (!decisionEmployeeId) return setMessage('اختر الموظف أولاً');
    const emp = employees.find((e) => Number(e.id) === Number(decisionEmployeeId));
    const dec = decisions.find((d) => Number(d.employee_id) === Number(decisionEmployeeId));
    const previous = Number(dec?.previous_salary ?? emp?.basic_salary ?? selectedReview?.basic_salary ?? 0);
    const inc = Number(dec?.amount ?? amount ?? 0);
    setPrintDoc({
      kind: 'increase',
      employee: String(emp?.name || '—'),
      year: Number(overview?.year || nowYear()),
      review: selectedReview ? `${selectedReview.total_score}/25 — ${selectedReview.rating}` : '—',
      previous,
      amount: inc,
      percentage: Number(dec?.percentage ?? (previous ? (inc / previous) * 100 : 0)),
      next: Number(dec?.new_salary ?? previous + inc),
      date: String(dec?.effective_date || effectiveDate).slice(0, 10),
      reason: String(dec?.reason || reason || ''),
      steps: steps.map((s) => s.label),
    });
  };

  const printApproved = () => {
    const rows = approvedRowsFor(approvedMonth, approvedYear);
    setPrintDoc({
      kind: 'approved', rows, month: approvedMonth, year: approvedYear,
      totalAmount: rows.reduce((sum, d) => sum + Number(d.amount || 0), 0),
    });
  };

  const startEvaluation = (id: number) => {
    const review = reviews.find((r) => Number(r.employee_id) === id);
    setEmployeeId(id);
    setScores(Object.fromEntries(criteria.map((c) => [c.key, Number(review?.[`score_${c.key}`] || 0)])));
    setNotes(Object.fromEntries(criteria.map((c) => [c.key, String(review?.[`note_${c.key}`] || '')])));
    setReviewer(String(review?.reviewer_name || ''));
    setReviewDate(String(review?.review_date || today()).slice(0, 10));
    setSummary(String(review?.summary || ''));
    setTab('evaluation');
  };

  const startDecision = (id: number) => {
    const decision = decisions.find((d) => Number(d.employee_id) === id);
    setDecisionEmployeeId(id);
    setAmount(decision ? String(decision.amount) : String(suggested || ''));
    setEffectiveDate(String(decision?.effective_date || today()).slice(0, 10));
    setReason(String(decision?.reason || ''));
    setTab('decision');
  };

  const saveReview = async () => {
    if (!employeeId) return setMessage('اختر الموظف أولاً');
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        employee_id: Number(employeeId),
        cycle_year: overview?.year,
        reviewer_name: reviewer,
        review_date: reviewDate,
        summary,
      };
      for (const c of criteria) {
        payload[`score_${c.key}`] = Number(scores[c.key] || 0);
        payload[`note_${c.key}`] = notes[c.key] || '';
      }
      const result = await api<any>('/api/annual/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setMessage(`تم حفظ التقييم: ${result.total}/25 — ${result.rating}`);
      await load();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveDecision = async () => {
    if (!decisionEmployeeId) return setMessage('اختر الموظف أولاً');
    setBusy(true);
    try {
      await api('/api/annual/increases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: Number(decisionEmployeeId),
          cycle_year: overview?.year,
          amount,
          effective_date: effectiveDate,
          reason,
        }),
      });
      setMessage('تم إنشاء قرار الزيادة بانتظار سلسلة الاعتماد');
      await load();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const decide = async (id: number, action: 'approve' | 'reject') => {
    setBusy(true);
    try {
      const result = await api<any>(`/api/annual/increases/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: approvalNote[id] || '' }),
      });
      setMessage(action === 'reject' ? 'تم رفض القرار' : result.status === 'approved' ? 'تم اعتماد الزيادة وتحديث الراتب' : `تمت الموافقة — الخطوة التالية: ${result.next_step || '—'}`);
      await load();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const card = (label: string, value: unknown, icon: ReactNode, tone: string) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tone}`}>{icon}</div>
      <span className="text-xs text-slate-400 font-bold block">{label}</span>
      <h4 className="text-2xl font-black text-slate-800">{String(value ?? 0)}</h4>
    </div>
  );

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      <div className="bg-gradient-to-l from-slate-900 via-emerald-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-emerald-800/40">
        <div>
          <h1 className="text-2xl font-black">دورة الزيادة السنوية</h1>
          <p className="text-emerald-200/80 text-xs mt-1">تنبيه قبل الذكرى بشهر ← تقييم من 5 معايير ← قرار زيادة ← اعتماد متسلسل. لا يتغير الراتب قبل الاعتماد النهائي.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void exportAudit()} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 rounded-xl text-xs font-black flex items-center gap-2">
            <Download className="w-4 h-4" /> تصدير تدقيق CSV
          </button>
          <button onClick={() => void load()} disabled={busy} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {card('موظفون نشطون', overview?.employees, <BadgeDollarSign className="w-5 h-5" />, 'bg-emerald-50 text-emerald-700')}
        {card('تنبيهات معلّقة', overview?.reminders, <CalendarClock className="w-5 h-5" />, 'bg-amber-50 text-amber-700')}
        {card('تقييمات محفوظة', overview?.reviews, <ClipboardList className="w-5 h-5" />, 'bg-sky-50 text-sky-700')}
        {card('قرارات قيد الاعتماد', overview?.pending, <RefreshCw className="w-5 h-5" />, 'bg-violet-50 text-violet-700')}
        {card('زيادات معتمدة', overview?.approved, <CheckCircle2 className="w-5 h-5" />, 'bg-emerald-50 text-emerald-700')}
      </div>

      {message && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-emerald-600 font-bold">×</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2 p-3 border-b border-slate-100">
          {([
            ['reminders', 'التنبيهات', CalendarClock],
            ['evaluation', 'التقييم السنوي', Star],
            ['decision', 'قرار الزيادة', BadgeDollarSign],
            ['approvals', 'سلسلة الاعتماد', CheckCircle2],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 ${tab === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'reminders' && (
            <div className="space-y-4">
              <div className="no-print flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600">
                <span>كشف المستحقين عن شهر</span>
                <select value={eligibleMonth} onChange={(e) => setEligibleMonth(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={eligibleYear} onChange={(e) => setEligibleYear(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={printEligible} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700">
                  <Printer className="w-3.5 h-3.5" /> طباعة كل السجلات المستحقة
                </button>
                <span className="text-slate-400 font-normal">يُحسب الاستحقاق حسب شهر الذكرى (شهر التعيين).</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="text-right text-xs text-slate-400 border-b border-slate-100">
                  <th className="py-2 px-2">الموظف</th><th>الفئة</th><th>الراتب</th><th>شهر/تاريخ التعيين</th><th>تاريخ التنبيه</th><th>الذكرى</th><th>الحالة</th><th></th>
                </tr></thead>
                <tbody>
                  {reminders.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400">لا توجد تنبيهات حالياً</td></tr>}
                  {reminders.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-2 px-2 font-bold">{r.employee_name}</td>
                      <td>{CATEGORY[r.sponsorship_type] || r.sponsorship_type}</td>
                      <td>{money(r.basic_salary)}</td>
                      <td>{r.hire_date || (r.hire_month ? `شهر ${r.hire_month}` : '—')}</td>
                      <td>{String(r.notify_date || '').slice(0, 10)}</td>
                      <td>{String(r.anniversary_date || '').slice(0, 10)}</td>
                      <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.status === 'pending' ? 'معلّق' : r.status}</span></td>
                      <td className="whitespace-nowrap">
                        <button onClick={() => startEvaluation(Number(r.employee_id))} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-bold ml-1">تقييم</button>
                        <button onClick={() => startDecision(Number(r.employee_id))} className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">قرار</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {tab === 'evaluation' && (
            <div className="space-y-5 max-w-4xl">
              <div className="grid sm:grid-cols-3 gap-4">
                <label className="text-xs font-bold text-slate-500 block">الموظف
                  <select value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value) || '')} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="">اختر موظفاً</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-500 block">المقيّم
                  <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-500 block">تاريخ التقييم
                  <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead><tr className="text-right text-xs text-slate-400 border-b"><th className="py-2">المعيار</th><th>الدرجة (0–5)</th><th>ملاحظات</th></tr></thead>
                  <tbody>
                    {criteria.map((c) => (
                      <tr key={c.key} className="border-b border-slate-50">
                        <td className="py-2 font-bold">{c.label}</td>
                        <td>
                          <select value={scores[c.key] ?? 0} onChange={(e) => setScores((s) => ({ ...s, [c.key]: Number(e.target.value) }))} className="border border-slate-200 rounded-lg px-2 py-1.5">
                            {[0, 1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td><input value={notes[c.key] || ''} onChange={(e) => setNotes((n) => ({ ...n, [c.key]: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-1.5" placeholder="ملاحظة اختيارية" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="text-xs font-bold text-slate-500 block">الخلاصة
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
              </label>
              <div className="flex items-center gap-3">
                <button onClick={() => void saveReview()} disabled={busy} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black disabled:opacity-50">حفظ التقييم</button>
                <button onClick={printEvaluation} className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-xs font-black">
                  <Printer className="w-4 h-4" /> طباعة ورقة تقييم الموظف
                </button>
                <span className="text-sm font-black text-slate-700">الدرجة: {criteria.reduce((a, c) => a + Number(scores[c.key] || 0), 0)}/{criteria.length * 5}</span>
              </div>
            </div>
          )}

          {tab === 'decision' && (
            <div className="space-y-5 max-w-3xl">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-xs font-bold text-slate-500 block">الموظف
                  <select value={decisionEmployeeId} onChange={(e) => setDecisionEmployeeId(Number(e.target.value) || '')} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="">اختر موظفاً</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm">
                  <div>التقييم: <b>{selectedReview ? `${selectedReview.total_score}/25 — ${selectedReview.rating}` : 'لا يوجد تقييم محفوظ'}</b></div>
                  <div className="text-slate-500 mt-1">الزيادة المقترحة حسب التقييم: <b>{money(suggested)} ر.س</b></div>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <label className="text-xs font-bold text-slate-500 block">مبلغ الزيادة
                  <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-500 block">تاريخ النفاذ
                  <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-500 block">السبب
                  <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => void saveDecision()} disabled={busy} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black disabled:opacity-50">إنشاء القرار وإرساله للاعتماد</button>
                <button onClick={printIncrease} className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-xs font-black">
                  <Printer className="w-4 h-4" /> طباعة نموذج الزيادة
                </button>
              </div>
              <p className="text-xs text-slate-400">سلسلة الاعتماد: {steps.map((s) => s.label).join(' ← ')}</p>
            </div>
          )}

          {tab === 'approvals' && (
            <div className="space-y-4">
              <div className="no-print flex flex-wrap items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600">
                <span>كشف الزيادات المعتمدة والنافذة عن شهر</span>
                <select value={approvedMonth} onChange={(e) => setApprovedMonth(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={approvedYear} onChange={(e) => setApprovedYear(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={printApproved} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700">
                  <Printer className="w-3.5 h-3.5" /> طباعة كامل الزيادات المعتمدة
                </button>
                <span className="text-slate-400 font-normal">حسب تاريخ النفاذ — المعتمدة نهائياً فقط.</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead><tr className="text-right text-xs text-slate-400 border-b"><th className="py-2 px-2">الموظف</th><th>الراتب السابق</th><th>الزيادة</th><th>الجديد</th><th>التقييم</th><th>الخطوة الحالية</th><th>الاعتمادات</th><th>إجراء</th></tr></thead>
                <tbody>
                  {decisions.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400">لا توجد قرارات لهذا العام</td></tr>}
                  {decisions.map((d) => {
                    const finished = ['approved', 'rejected'].includes(d.status);
                    return (
                      <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="py-2 px-2 font-bold">{d.employee_name}</td>
                        <td>{money(d.previous_salary)}</td>
                        <td className="text-emerald-700 font-bold">+{money(d.amount)}</td>
                        <td>{money(d.new_salary)}</td>
                        <td>{d.total_score ? `${d.total_score}/25 — ${d.rating}` : '—'}</td>
                        <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : d.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{STATUS[d.status] || d.status}</span></td>
                        <td>{Number(d.approvals_done || 0)}/{steps.length}</td>
                        <td>
                          {finished ? <span className="text-xs text-slate-400">منتهٍ</span> : (
                            <div className="flex items-center gap-1">
                              <input value={approvalNote[d.id] || ''} onChange={(e) => setApprovalNote((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="ملاحظة" className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs" />
                              <button onClick={() => void decide(Number(d.id), 'approve')} disabled={busy} className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">اعتماد</button>
                              <button onClick={() => void decide(Number(d.id), 'reject')} disabled={busy} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> رفض</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {printDoc && (
        <div className="print-document bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="no-print flex justify-end gap-2 p-3">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={() => setPrintDoc(null)} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold">
              <X className="w-4 h-4" /> إغلاق
            </button>
          </div>

          {printDoc.kind === 'eligible' && (
            <div className="print-page bg-white text-slate-900">
              <Letterhead company={company} title="كشف الموظفين المؤهلين للزيادة السنوية" />
              <div className="mt-6 flex justify-between border-b border-slate-300 pb-2 text-sm">
                <span className="font-bold">شهر الذكرى: {MONTHS[printDoc.month - 1]} {printDoc.year}</span>
                <span>عدد السجلات: {printDoc.rows.length}</span>
              </div>
              <table className="w-full text-xs mt-4 border border-slate-400">
                <thead><tr className="bg-slate-100">
                  <th className="p-1.5 border border-slate-300">م</th>
                  <th className="p-1.5 border border-slate-300">اسم الموظف</th>
                  <th className="p-1.5 border border-slate-300">الفئة</th>
                  <th className="p-1.5 border border-slate-300">التعيين</th>
                  <th className="p-1.5 border border-slate-300">الراتب</th>
                  <th className="p-1.5 border border-slate-300">التنبيه</th>
                  <th className="p-1.5 border border-slate-300">التقييم</th>
                  <th className="p-1.5 border border-slate-300">القرار</th>
                </tr></thead>
                <tbody>
                  {printDoc.rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">لا توجد سجلات مستحقة في هذا الشهر</td></tr>}
                  {printDoc.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="p-1.5 border border-slate-300 text-center">{i + 1}</td>
                      <td className="p-1.5 border border-slate-300 font-bold">{r.name}</td>
                      <td className="p-1.5 border border-slate-300">{r.category}</td>
                      <td className="p-1.5 border border-slate-300">{r.hire}</td>
                      <td className="p-1.5 border border-slate-300">{money(r.salary)}</td>
                      <td className="p-1.5 border border-slate-300">{r.reminder}</td>
                      <td className="p-1.5 border border-slate-300">{r.review}</td>
                      <td className="p-1.5 border border-slate-300">{r.decision}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs">
                <div><p className="font-bold mb-8">إعداد الموارد البشرية</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
                <div><p className="font-bold mb-8">اعتماد الإدارة</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
              </div>
              <DocumentFooter company={company} reference={`ANN-ELIGIBLE-${printDoc.year}${String(printDoc.month).padStart(2, '0')}`} />
            </div>
          )}

          {printDoc.kind === 'evaluation' && (
            <div className="print-page bg-white text-slate-900">
              <Letterhead company={company} title="نموذج التقييم السنوي للموظف" />
              <div className="mt-6 grid grid-cols-3 gap-3 border-b border-slate-300 pb-3 text-sm">
                <div><span className="text-slate-500 text-xs block">الموظف</span><b>{printDoc.employee}</b></div>
                <div><span className="text-slate-500 text-xs block">المقيّم</span><b>{printDoc.reviewer || '—'}</b></div>
                <div><span className="text-slate-500 text-xs block">التاريخ</span><b>{printDoc.date}</b></div>
              </div>
              <table className="w-full text-xs mt-4 border border-slate-400">
                <thead><tr className="bg-slate-100">
                  <th className="p-2 border border-slate-300">المعيار</th>
                  <th className="p-2 border border-slate-300">الدرجة (من 5)</th>
                  <th className="p-2 border border-slate-300">ملاحظات</th>
                </tr></thead>
                <tbody>
                  {printDoc.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="p-2 border border-slate-300 font-bold">{row.label}</td>
                      <td className="p-2 border border-slate-300 text-center">{row.score}</td>
                      <td className="p-2 border border-slate-300">{row.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex justify-between border-t border-slate-300 pt-3 text-sm">
                <span>المجموع: <b>{printDoc.total} / {printDoc.rows.length * 5}</b></span>
                <span>التقدير: <b>{printDoc.rating}</b></span>
              </div>
              {printDoc.summary && (
                <div className="mt-3 text-sm"><b>خلاصة المقيّم:</b> <span>{printDoc.summary}</span></div>
              )}
              <div className="grid grid-cols-2 gap-8 pt-12 text-center text-xs">
                <div><p className="font-bold mb-8">توقيع المقيّم</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
                <div><p className="font-bold mb-8">توقيع الموظف</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
              </div>
              <DocumentFooter company={company} reference={`ANN-REVIEW-${printDoc.date.replaceAll('-', '')}`} />
            </div>
          )}

          {printDoc.kind === 'increase' && (
            <div className="print-page bg-white text-slate-900">
              <Letterhead company={company} title="نموذج قرار الزيادة السنوية" />
              <div className="mt-6 grid grid-cols-3 gap-3 border-b border-slate-300 pb-3 text-sm">
                <div><span className="text-slate-500 text-xs block">الموظف</span><b>{printDoc.employee}</b></div>
                <div><span className="text-slate-500 text-xs block">سنة الدورة</span><b>{printDoc.year}</b></div>
                <div><span className="text-slate-500 text-xs block">التقييم</span><b>{printDoc.review}</b></div>
              </div>
              <table className="w-full text-sm mt-4 border border-slate-400">
                <tbody>
                  <tr><td className="p-2 border border-slate-300 bg-slate-50 w-56">الراتب الأساسي قبل الزيادة</td><td className="p-2 border border-slate-300 font-bold">{money(printDoc.previous)} ر.س</td></tr>
                  <tr><td className="p-2 border border-slate-300 bg-slate-50">مبلغ الزيادة</td><td className="p-2 border border-slate-300 font-bold text-emerald-700">+{money(printDoc.amount)} ر.س ({printDoc.percentage.toFixed(2)}%)</td></tr>
                  <tr><td className="p-2 border border-slate-300 bg-slate-50">الراتب بعد الزيادة</td><td className="p-2 border border-slate-300 font-bold">{money(printDoc.next)} ر.س</td></tr>
                  <tr><td className="p-2 border border-slate-300 bg-slate-50">تاريخ النفاذ</td><td className="p-2 border border-slate-300">{printDoc.date}</td></tr>
                  <tr><td className="p-2 border border-slate-300 bg-slate-50">السبب / المبرر</td><td className="p-2 border border-slate-300">{printDoc.reason || '—'}</td></tr>
                </tbody>
              </table>
              <div className="mt-4 text-xs text-slate-600">سلسلة الاعتماد: {printDoc.steps.join(' ← ')}</div>
              <div className="grid grid-cols-2 gap-8 pt-12 text-center text-xs">
                <div><p className="font-bold mb-8">توقيع الموظف</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
                <div><p className="font-bold mb-8">اعتماد الموارد البشرية</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
              </div>
              <DocumentFooter company={company} reference={`ANN-INC-${printDoc.year}-${printDoc.employee}`} />
            </div>
          )}

          {printDoc.kind === 'approved' && (
            <div className="print-page bg-white text-slate-900">
              <Letterhead company={company} title="كشف الزيادات السنوية المقررة والمعتمدة" />
              <div className="mt-6 flex justify-between border-b border-slate-300 pb-2 text-sm">
                <span className="font-bold">عن شهر {MONTHS[printDoc.month - 1]} {printDoc.year}</span>
                <span>عدد القرارات: {printDoc.rows.length}</span>
              </div>
              <table className="w-full text-xs mt-4 border border-slate-400">
                <thead><tr className="bg-slate-100">
                  <th className="p-1.5 border border-slate-300">م</th>
                  <th className="p-1.5 border border-slate-300">الموظف</th>
                  <th className="p-1.5 border border-slate-300">الراتب السابق</th>
                  <th className="p-1.5 border border-slate-300">الزيادة</th>
                  <th className="p-1.5 border border-slate-300">الجديد</th>
                  <th className="p-1.5 border border-slate-300">النسبة</th>
                  <th className="p-1.5 border border-slate-300">التقييم</th>
                  <th className="p-1.5 border border-slate-300">تاريخ النفاذ</th>
                </tr></thead>
                <tbody>
                  {printDoc.rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">لا توجد زيادات معتمدة في هذا الشهر</td></tr>}
                  {printDoc.rows.map((d, i) => (
                    <tr key={d.id}>
                      <td className="p-1.5 border border-slate-300 text-center">{i + 1}</td>
                      <td className="p-1.5 border border-slate-300 font-bold">{d.employee_name}</td>
                      <td className="p-1.5 border border-slate-300">{money(d.previous_salary)}</td>
                      <td className="p-1.5 border border-slate-300">{money(d.amount)}</td>
                      <td className="p-1.5 border border-slate-300">{money(d.new_salary)}</td>
                      <td className="p-1.5 border border-slate-300">{Number(d.percentage || 0).toFixed(2)}%</td>
                      <td className="p-1.5 border border-slate-300">{d.total_score ? `${d.total_score}/25 — ${d.rating}` : '—'}</td>
                      <td className="p-1.5 border border-slate-300">{String(d.effective_date || '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex justify-between border-t border-slate-400 pt-2 text-sm font-bold">
                <span>الإجمالي</span>
                <span>{money(printDoc.totalAmount)} ر.س</span>
              </div>
              <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs">
                <div><p className="font-bold mb-8">إعداد الموارد البشرية</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
                <div><p className="font-bold mb-8">اعتماد المالية</p><p className="border-t border-slate-500 pt-1">الاسم / التاريخ</p></div>
              </div>
              <DocumentFooter company={company} reference={`INC-APPROVED-${printDoc.year}${String(printDoc.month).padStart(2, '0')}`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** بوابة الموظف: تعرض بياناته وحده؛ أي employee_id يُتجاهل خادمياً. */
export function AnnualSelfPanel() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<any>('/api/annual/me')
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="bg-rose-50 text-rose-700 rounded-xl p-5 text-sm">{error}</div>;
  if (!data) return <div className="text-slate-400 text-sm p-6">جارٍ تحميل بيانات الزيادة السنوية...</div>;

  const { employee, review, decision } = data;
  const status = decision?.status
    ? (STATUS[decision.status] || decision.status)
    : review
      ? 'تم التقييم — بانتظار قرار الزيادة'
      : 'بانتظار التقييم السنوي';

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
          <span className="text-[11px] text-emerald-700 font-bold block">تاريخ الذكرى القادمة</span>
          <b className="text-lg text-emerald-900">{data.anniversary || 'غير معروف'}</b>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <span className="text-[11px] text-amber-700 font-bold block">يجب البدء قبل</span>
          <b className="text-lg text-amber-900">{data.reminder_date || '—'}</b>
        </div>
        <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100">
          <span className="text-[11px] text-sky-700 font-bold block">الراتب الحالي</span>
          <b className="text-lg text-sky-900">{money(employee?.basic_salary)} ر.س</b>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="font-black text-slate-800">ملف الزيادة السنوية — {data.year}</h3>
            <p className="text-xs text-slate-400 mt-1">{employee?.name} · {CATEGORY[employee?.sponsorship_type] || '—'}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-violet-100 text-violet-700">{status}</span>
        </div>

        {review ? (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div><span className="text-slate-400 text-xs block">الدرجة</span><b>{review.total_score}/25</b></div>
            <div><span className="text-slate-400 text-xs block">التقدير</span><b>{review.rating}</b></div>
            <div><span className="text-slate-400 text-xs block">تاريخ التقييم</span><b>{String(review.review_date || '').slice(0, 10)}</b></div>
            {review.summary && <div className="sm:col-span-3"><span className="text-slate-400 text-xs block">خلاصة المقيّم</span><span>{review.summary}</span></div>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">لم يُحفظ تقييمك السنوي لهذا العام بعد.</p>
        )}

        {decision && (
          <div className="mt-5 bg-slate-50 rounded-xl p-4 text-sm">
            <div className="flex flex-wrap gap-6">
              <div><span className="text-slate-400 text-xs block">الراتب قبل</span><b>{money(decision.previous_salary)}</b></div>
              <div><span className="text-slate-400 text-xs block">الزيادة</span><b className="text-emerald-700">+{money(decision.amount)}</b></div>
              <div><span className="text-slate-400 text-xs block">الراتب بعد الاعتماد</span><b>{money(decision.new_salary)}</b></div>
              <div><span className="text-slate-400 text-xs block">تاريخ النفاذ</span><b>{String(decision.effective_date || '').slice(0, 10)}</b></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(data.approval_steps || []).map((s: ApprovalStep, i: number) => {
                const done = Number(decision.current_step || 0) > i;
                return <span key={s.key} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{done ? '✓ ' : ''}{s.label}</span>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
