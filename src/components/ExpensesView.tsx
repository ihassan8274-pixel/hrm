import React, { useState, useEffect } from 'react';
import { Receipt, Plus, CheckCircle2, XCircle, Clock, DollarSign, User, Calendar, FileText, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from './ui';

interface Expense {
  id: number;
  employee_id: number;
  employee_name: string;
  amount: number;
  category: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  claim_date?: string;
  date: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  payment_status?: 'unpaid' | 'paid';
  paid_at?: string;
}

export default function ExpensesView() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Expense | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected' | 'pending'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [employees, setEmployees] = useState<{id: number, name: string}[]>([]);
  const [form, setForm] = useState({ employee_id: '', amount: '', category: 'travel', description: '', date: new Date().toISOString().split('T')[0] });

  const fetchExpenses = async () => {
    const res = await fetch('/api/expenses');
    const rows: Expense[] = await res.json();
    // The API column is claim_date; the table used to render an empty date.
    setExpenses(rows.map(e => ({ ...e, date: e.date || e.claim_date || '' })));
  };

  const fetchEmployees = async () => {
    const res = await fetch('/api/employees');
    setEmployees(await res.json());
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewBusy(true);
    const res = await fetch(`/api/expenses/${reviewTarget.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: reviewStatus, note: reviewNote }),
    });
    const data = await res.json().catch(() => ({}));
    setReviewBusy(false);
    if (!res.ok) {
      window.alert(data.error || 'تعذّر اعتماد المطالبة');
      return;
    }
    setReviewTarget(null);
    setReviewNote('');
    fetchExpenses();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.error || 'تعذّر حذف المطالبة');
      return;
    }
    setDeleteTarget(null);
    fetchExpenses();
  };

  useEffect(() => {
    fetchExpenses();
    fetchEmployees();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setIsAdding(false);
    fetchExpenses();
  };

  const categories = [
    { id: 'travel', name: 'سفر وانتقالات', color: 'bg-brand-100 text-brand-600' },
    { id: 'food', name: 'ضيافة وطعام', color: 'bg-orange-100 text-orange-600' },
    { id: 'office', name: 'أدوات مكتبية', color: 'bg-purple-100 text-purple-600' },
    { id: 'marketing', name: 'تسويق', color: 'bg-pink-100 text-pink-600' },
    { id: 'other', name: 'أخرى', color: 'bg-slate-100 text-slate-600' },
  ];

  const getCategoryColor = (catId: string) => categories.find(c => c.id === catId)?.color || 'bg-slate-100 text-slate-600';
  const getCategoryName = (catId: string) => categories.find(c => c.id === catId)?.name || 'غير معروف';

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-800">المطالبات المالية</h2>
          <p className="text-slate-500 text-sm mt-1">إدارة مصروفات الموظفين وطلبات الاسترداد — المطالبات المعتمدة تُسدَّد خارج المسير ولا تُضاف للراتب الخاضع للضريبة</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100"
        >
          <Plus className="w-5 h-5" />
          <span>طلب استرداد جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي المطالبات</p>
          <div className="text-2xl font-black text-slate-800">
            {(expenses.reduce((acc, curr) => acc + curr.amount, 0) || 0).toLocaleString()}
            <span className="text-xs text-slate-400 mr-1">ر.س</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-2">تمت الموافقة</p>
          <div className="text-2xl font-black text-emerald-600">
            {(expenses.filter(e => e.status === 'approved').reduce((acc, curr) => acc + curr.amount, 0) || 0).toLocaleString()} <span className="text-xs text-slate-400 mr-1">ر.س</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-2">قيد الانتظار</p>
          <div className="text-2xl font-black text-amber-600">
            {(expenses.filter(e => e.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0) || 0).toLocaleString()} <span className="text-xs text-slate-400 mr-1">ر.س</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-2">طلبات مرفوضة</p>
          <div className="text-2xl font-black text-red-600">
            {expenses.filter(e => e.status === 'rejected').length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-500 text-xs font-black uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4">الموظف</th>
              <th className="px-6 py-4">الفئة</th>
              <th className="px-6 py-4">المبلغ</th>
              <th className="px-6 py-4">التاريخ</th>
              <th className="px-6 py-4">الحالة</th>
              <th className="px-6 py-4">ملاحظات</th>
              <th className="px-6 py-4">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {expenses.map(exp => (
              <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-700">{exp.employee_name}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getCategoryColor(exp.category)}`}>
                    {getCategoryName(exp.category)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="font-black text-slate-800">{(exp.amount || 0).toLocaleString()} <span className="text-[10px] text-slate-400">ر.س</span></div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-slate-500">{exp.date}</div>
                </td>
                <td className="px-6 py-4">
                   <div className="flex items-center gap-1.5 font-bold text-xs">
                     {exp.status === 'pending' && <><Clock className="w-3.5 h-3.5 text-amber-500" /><span className="text-amber-600">قيد الانتظار</span></>}
                     {exp.status === 'approved' && <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-600">مقبول</span></>}
                     {exp.status === 'rejected' && <><XCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-600">مرفوض</span></>}
                      {exp.payment_status === 'paid' && <span className="ms-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">مُسدَّدة</span>}
                   </div>
                </td>
                <td className="px-6 py-4">
                   <p className="text-[11px] text-slate-400 truncate max-w-[150px]">{exp.description}</p>
                </td>
                <td className="px-6 py-4">
                   <div className="flex items-center gap-3">
                     <button
                        onClick={() => {
                          setReviewTarget(exp);
                          setReviewStatus(exp.status === 'pending' ? 'approved' : exp.status);
                          setReviewNote(exp.review_note || '');
                        }}
                        className="text-[10px] font-black text-brand-600 hover:underline"
                      >
                        مراجعة
                      </button>
                     <button
                       onClick={() => setDeleteTarget(exp)}
                       title="حذف المطالبة"
                       aria-label="حذف المطالبة"
                       className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-black text-slate-800 mb-6">تقديم طلب استرداد</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">الموظف</label>
                <select 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                  value={form.employee_id}
                  onChange={e => setForm({...form, employee_id: e.target.value})}
                >
                  <option value="">اختر الموظف</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">المبلغ (ر.س)</label>
                  <input 
                    type="number"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                    value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">التاريخ</label>
                  <input 
                    type="date"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                    value={form.date}
                    onChange={e => setForm({...form, date: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">الفئة</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700"
                  value={form.category}
                  onChange={e => setForm({...form, category: e.target.value})}
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">التفاصيل والوصف</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-bold text-slate-700 h-24"
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-brand-600 text-white py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all">حفظ الطلب</button>
                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-black text-slate-800 mb-1">مراجعة المطالبة المالية</h3>
            <p className="text-xs text-slate-500 mb-6">
              {reviewTarget.employee_name} — {Number(reviewTarget.amount || 0).toLocaleString()} ر.س — {reviewTarget.date}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">القرار</label>
                <select
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-700"
                  value={reviewStatus}
                  onChange={e => setReviewStatus(e.target.value as typeof reviewStatus)}
                >
                  <option value="approved">اعتماد المطالبة</option>
                  <option value="rejected">رفض المطالبة</option>
                  <option value="pending">إعادة للانتظار</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">ملاحظة الاعتماد</label>
                <textarea
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl h-24 font-bold text-slate-700"
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="سبب القرار أو ملاحظة للمدقق"
                />
              </div>
              {reviewTarget.reviewed_by && (
                <p className="text-[11px] text-slate-400">
                  آخر مراجعة: {reviewTarget.reviewed_by} — {reviewTarget.reviewed_at || '—'}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={reviewBusy}
                  onClick={handleReview}
                  className="flex-1 bg-brand-600 text-white py-3 rounded-2xl font-bold disabled:opacity-60"
                >
                  حفظ القرار
                </button>
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف المطالبة المالية"
        message={`ستُحذف مطالبة ${deleteTarget?.employee_name ?? ''} بمبلغ ${Number(deleteTarget?.amount || 0).toLocaleString()} ر.س نهائياً.`}
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
