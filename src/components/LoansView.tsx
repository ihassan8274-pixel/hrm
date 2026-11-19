import { useState, useEffect, type JSX } from 'react';
import { Landmark, Plus, Search, User, Clock, CheckCircle2, XCircle, ChevronDown, Printer, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';
import type { Loan } from '../types';

interface Employee {
  id: number;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الاعتماد',
  active: 'ساري',
  rejected: 'مرفوض',
  completed: 'مسدد',
};

const ACTION_LABEL: Record<string, string> = {
  approved: 'اعتماد',
  rejected: 'رفض',
  submitted: 'رفع الطلب',
};

export default function LoansView() {
  const company = useLetterhead();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<{ loan: Loan; action: 'active' | 'rejected' } | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [printLoan, setPrintLoan] = useState<Loan | null>(null);

  const [newLoan, setNewLoan] = useState({
    employee_id: 0,
    total_amount: 0,
    monthly_installment: 0
  });

  const fetchData = async () => {
    try {
      const [lRes, eRes] = await Promise.all([
        fetch('/api/loans'),
        fetch('/api/employees')
      ]);
      if (!lRes.ok) throw new Error((await lRes.json().catch(() => ({}))).error || 'تعذّر تحميل السلف');
      const [lData, eData] = await Promise.all([lRes.json(), eRes.json()]);
      setLoans(Array.isArray(lData) ? lData : []);
      setEmployees(Array.isArray(eData) ? eData : []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!printLoan) return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [printLoan]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoan)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر رفع طلب السلفة');
      setIsModalOpen(false);
      setNewLoan({ employee_id: 0, total_amount: 0, monthly_installment: 0 });
      await fetchData();
    } catch (e: any) {
      setError(e?.message || 'تعذّر رفع الطلب');
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/loans/${decision.loan.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision.action, comments: decisionComment || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر تسجيل القرار');
      setDecision(null);
      setDecisionComment('');
      await fetchData();
    } catch (e: any) {
      setError(e?.message || 'تعذّر تسجيل القرار');
    } finally {
      setBusy(false);
    }
  };

  const filteredLoans = loans.filter(l => (l.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  const activeDebt = loans.filter(l => l.status === 'active').reduce((acc, l) => acc + (l.remaining_amount || 0), 0);
  const pendingCount = loans.filter(l => l.status === 'pending').length;

  const statusBadge = (status: string) => (
    <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
      status === 'pending' ? 'bg-amber-50 text-amber-700'
        : status === 'rejected' ? 'bg-red-50 text-red-600'
        : 'bg-emerald-50 text-emerald-600'
    }`}>
      {STATUS_LABEL[status] || status}
    </span>
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة القروض والسلف</h1>
          <p className="text-slate-500 text-sm">رفع طلبات السلف واعتمادها وطباعة سندات الصرف ومتابعة مسار الاعتماد</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
        >
          <Plus className="w-5 h-5" />
          <span>طلب سلفة جديد</span>
        </button>
      </div>

      {error && (
        <div className="no-print bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-bold">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm col-span-2 flex items-center px-4">
          <Search className="w-5 h-5 text-slate-400 ml-4" />
          <input
            type="text"
            placeholder="البحث عن موظف..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none outline-none font-medium text-slate-700 text-right"
          />
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-center items-center">
          <p className="text-[10px] font-bold text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" /> بانتظار الاعتماد</p>
          <p className="text-xl font-bold font-mono text-amber-700">{pendingCount}</p>
        </div>
        <div className="bg-brand-600 p-4 rounded-2xl text-white shadow-lg shadow-brand-100 flex flex-col justify-center items-center">
           <p className="text-[10px] uppercase font-bold opacity-80">الذمم القائمة (السارية)</p>
           <p className="text-xl font-bold font-mono">
             {activeDebt.toLocaleString()} <span className="text-xs">ر.س</span>
           </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden no-print">
        <table className="w-full text-right">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-4 text-xs font-bold text-slate-500">الموظف</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-500 text-center">المبلغ الكلي</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-500 text-center">المتبقي</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-500 text-center">القسط الشهري</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-500 text-center">تاريخ الطلب</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-500 text-center">الحالة / المسار</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-500 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredLoans.map(loan => (
              <FragmentRow
                key={loan.id}
                loan={loan}
                expanded={expandedId === loan.id}
                onToggle={() => setExpandedId(expandedId === loan.id ? null : loan.id)}
                onDecide={(action) => { setDecision({ loan, action }); setDecisionComment(''); }}
                onPrint={() => setPrintLoan(loan)}
                statusBadge={statusBadge}
              />
            ))}
            {filteredLoans.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-20 text-center text-slate-300">
                   <Landmark className="w-12 h-12 mx-auto mb-4 opacity-10" />
                   <p>لا توجد سلف حالياً</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* سند صرف السلفة — يُطبع وحده عبر عزل print-document في CSS الطباعة */}
      {printLoan && (
        <div className="print-document bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="no-print flex justify-end gap-2 mb-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={() => setPrintLoan(null)} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold">
              <X className="w-4 h-4" /> إغلاق
            </button>
          </div>
          <Letterhead company={company} title="سند صرف سلفة موظف" />
          <div className="flex justify-between text-sm border-b border-slate-200 pb-3">
            <span className="font-bold">رقم السند: LOAN-{String(printLoan.id).padStart(5, '0')}</span>
            <span>التاريخ: {new Date(printLoan.created_at).toLocaleDateString('ar-EG')}</span>
          </div>
          <table className="w-full text-sm border border-slate-300">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="p-2 font-bold bg-slate-50 w-40">اسم الموظف</td>
                <td className="p-2">{printLoan.employee_name}</td>
                <td className="p-2 font-bold bg-slate-50 w-40">رقم الموظف</td>
                <td className="p-2 font-mono">{printLoan.employee_id}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-2 font-bold bg-slate-50">قيمة السلفة</td>
                <td className="p-2 font-mono font-bold">{(printLoan.total_amount || 0).toLocaleString()} ر.س</td>
                <td className="p-2 font-bold bg-slate-50">القسط الشهري</td>
                <td className="p-2 font-mono">{(printLoan.monthly_installment || 0).toLocaleString()} ر.س</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-2 font-bold bg-slate-50">المتبقي</td>
                <td className="p-2 font-mono">{(printLoan.remaining_amount || 0).toLocaleString()} ر.س</td>
                <td className="p-2 font-bold bg-slate-50">الحالة</td>
                <td className="p-2 font-bold">{STATUS_LABEL[printLoan.status] || printLoan.status}</td>
              </tr>
              <tr>
                <td className="p-2 font-bold bg-slate-50">طريقة السداد</td>
                <td className="p-2" colSpan={3}>خصم شهري من الراتب بدءاً من مسير الشهر التالي للاعتماد</td>
              </tr>
            </tbody>
          </table>

          {(printLoan.workflow_history?.length || 0) > 0 && (
            <div>
              <p className="font-bold text-sm mb-2">مسار الاعتماد ({printLoan.workflow_title || 'مسار السلف'})</p>
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
                  {printLoan.workflow_history!.map((h, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="p-2">{h.level}</td>
                      <td className="p-2">{h.actor_name}</td>
                      <td className="p-2 font-bold">{ACTION_LABEL[h.action] || h.action}</td>
                      <td className="p-2 font-mono" dir="ltr">{h.action_date}</td>
                      <td className="p-2">{h.comments || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6 pt-8 text-center text-sm">
            <div>
              <p className="font-bold mb-8">توقيع الموظف المستلم</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
            </div>
            <div>
              <p className="font-bold mb-8">المحاسب / المدير المالي</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
            </div>
            <div>
              <p className="font-bold mb-8">اعتماد الموارد البشرية</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
            </div>
          </div>
          <DocumentFooter company={company} reference={`LOAN-${String(printLoan.id).padStart(5, '0')}`} />
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
            >
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute left-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Plus className="text-brand-600" />
                طلب سلفة جديد لموظف
              </h3>
              <p className="text-xs text-slate-500 mb-8">يُرفع الطلب بحالة «قيد الاعتماد» ويمر في مسار اعتماد السلف قبل أن يصبح سارياً.</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">الموظف</label>
                  <select
                    value={newLoan.employee_id}
                    onChange={e => setNewLoan({ ...newLoan, employee_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right"
                  >
                    <option value="0">اختر موظفاً...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">إجمالي السلفة (ر.س)</label>
                    <input
                      type="number"
                      value={newLoan.total_amount}
                      onChange={e => setNewLoan({ ...newLoan, total_amount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">القسط الشهري (ر.س)</label>
                    <input
                      type="number"
                      value={newLoan.monthly_installment}
                      onChange={e => setNewLoan({ ...newLoan, monthly_installment: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-mono"
                    />
                  </div>
                </div>

                <div className="bg-brand-50 p-4 rounded-2xl flex justify-between items-center">
                   <div className="text-right">
                      <p className="text-xs font-bold text-brand-900">مدة السداد المتوقعة</p>
                      <p className="text-[10px] text-brand-600">يُخصم القسط تلقائياً من الرواتب بعد الاعتماد</p>
                   </div>
                   <div className="text-xl font-bold text-brand-700">
                     {newLoan.monthly_installment > 0 ? Math.ceil(newLoan.total_amount / newLoan.monthly_installment) : 0} <span className="text-[10px]">شهر</span>
                   </div>
                </div>

                <button
                  onClick={handleCreate}
                  disabled={busy || !newLoan.employee_id || newLoan.total_amount <= 0 || newLoan.monthly_installment <= 0}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200 mt-4 disabled:opacity-40"
                >
                  {busy ? 'جارٍ الرفع...' : 'رفع الطلب للاعتماد'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {decision && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${decision.action === 'active' ? 'text-emerald-700' : 'text-red-600'}`}>
                {decision.action === 'active' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {decision.action === 'active' ? 'اعتماد السلفة' : 'رفض السلفة'}
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                {decision.loan.employee_name} — {(decision.loan.total_amount || 0).toLocaleString()} ر.س
                {decision.action === 'active' ? ' (ستصبح سارية ويُخصم القسط من المسير)' : ''}
              </p>
              <textarea
                value={decisionComment}
                onChange={e => setDecisionComment(e.target.value)}
                placeholder="ملاحظات القرار (اختياري) — تُسجَّل في مسار الاعتماد وتظهر في السند المطبوع"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-right text-sm h-24 mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDecision}
                  disabled={busy}
                  className={`flex-1 text-white py-3 rounded-2xl font-bold disabled:opacity-40 ${decision.action === 'active' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  {busy ? 'جارٍ الحفظ...' : 'تأكيد القرار'}
                </button>
                <button onClick={() => setDecision(null)} className="px-6 py-3 rounded-2xl font-bold bg-slate-100 text-slate-600">إلغاء</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FragmentRow({ loan, expanded, onToggle, onDecide, onPrint, statusBadge }: {
  loan: Loan;
  expanded: boolean;
  onToggle: () => void;
  onDecide: (action: 'active' | 'rejected') => void;
  onPrint: () => void;
  statusBadge: (status: string) => JSX.Element;
}) {
  const history = loan.workflow_history || [];
  return (
    <>
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <User className="w-4 h-4 text-slate-400" />
            </div>
            <span className="font-bold text-slate-800">{loan.employee_name}</span>
          </div>
        </td>
        <td className="px-4 py-4 text-center font-mono text-sm">{(loan.total_amount || 0).toLocaleString()}</td>
        <td className="px-4 py-4 text-center font-mono text-sm text-red-500 font-bold">{(loan.remaining_amount || 0).toLocaleString()}</td>
        <td className="px-4 py-4 text-center font-mono text-sm text-brand-600">{(loan.monthly_installment || 0).toLocaleString()}</td>
        <td className="px-4 py-4 text-center text-xs text-slate-400">
          {new Date(loan.created_at).toLocaleDateString('ar-EG')}
        </td>
        <td className="px-4 py-4 text-center">
          <div className="flex flex-col items-center gap-1">
            {statusBadge(loan.status)}
            {loan.workflow_max_levels ? (
              <button onClick={onToggle} className="text-[10px] text-slate-400 hover:text-brand-600 flex items-center gap-1">
                المستوى {loan.workflow_level} من {loan.workflow_max_levels}
                <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <span className="text-[10px] text-slate-300">بلا مسار اعتماد</span>
            )}
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="flex items-center justify-center gap-2">
            {loan.status === 'pending' && (
              <>
                <button
                  onClick={() => onDecide('active')}
                  title="اعتماد السلفة"
                  className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDecide('rejected')}
                  title="رفض السلفة"
                  className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onPrint}
              title="طباعة سند السلفة"
              className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-8 py-4">
            <p className="text-xs font-bold text-slate-500 mb-2">{loan.workflow_title || 'مسار الاعتماد'}</p>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">لا قرارات مسجلة بعد — الطلب بانتظار أول اعتماد.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className={`w-2 h-2 rounded-full ${h.action === 'rejected' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <span className="font-bold text-slate-700">المستوى {h.level}: {h.actor_name}</span>
                    <span className={h.action === 'rejected' ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                      {ACTION_LABEL[h.action] || h.action}
                    </span>
                    <span className="text-slate-400 font-mono" dir="ltr">{h.action_date}</span>
                    {h.comments && <span className="text-slate-500">— {h.comments}</span>}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}