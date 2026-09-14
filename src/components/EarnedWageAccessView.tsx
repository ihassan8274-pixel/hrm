import React, { useState, useEffect } from 'react';
import { 
  Wallet, DollarSign, ArrowUpRight, CheckCircle2, 
  ShieldCheck, AlertCircle, Clock, Calendar, 
  User, RefreshCw, Send, Landmark, HelpCircle, FileText
} from 'lucide-react';
import type { EwaWithdrawal, EwaEligibility } from '../types';

export default function EarnedWageAccessView() {
  const [withdrawals, setWithdrawals] = useState<EwaWithdrawal[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [eligibility, setEligibility] = useState<EwaEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [wRes, eRes] = await Promise.all([
        fetch('/api/ewa/withdrawals'),
        fetch('/api/employees')
      ]);
      const wData = await wRes.json();
      const eData = await eRes.json();

      setWithdrawals(Array.isArray(wData) ? wData : []);
      const emps = Array.isArray(eData) ? eData : (eData.employees || []);
      setEmployees(emps);

      if (emps.length > 0) {
        setSelectedEmpId(emps[0].id);
        fetchEligibility(emps[0].id);
      }
    } catch (err) {
      console.error("Failed to load EWA data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEligibility = async (empId: number) => {
    try {
      const res = await fetch(`/api/ewa/eligibility/${empId}`);
      if (res.ok) {
        const data = await res.json();
        setEligibility(data);
        setWithdrawAmount(Math.min(1000, data.available_limit).toString());
      }
    } catch (err) {
      console.error("Failed to fetch eligibility:", err);
    }
  };

  const handleEmpChange = (empId: number) => {
    setSelectedEmpId(empId);
    fetchEligibility(empId);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !eligibility) return;

    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount < 100) {
      setErrorMessage("الحد الأدنى للسحب هو 100 ر.س");
      return;
    }
    if (amount > eligibility.available_limit) {
      setErrorMessage(`المبلغ المطلوب يتجاوز الرصيد المتاح للسحب (${eligibility.available_limit.toLocaleString()} ر.س)`);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/ewa/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmpId,
          requested_amount: amount,
          disbursement_method: 'instant_iban'
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(`تم تحويل مبلغ ${data.net_disbursed?.toLocaleString() || amount} ر.س إلى الآيبان البنكي بنجاح (رسوم التحويل الفوري: 15 ر.س). سيتم إدراجه تلقائياً كاستقطاع في مسير الراتب القادم.`);
        fetchEligibility(selectedEmpId);
        // Refresh withdrawals list
        const wRes = await fetch('/api/ewa/withdrawals');
        setWithdrawals(await wRes.json());
      } else {
        setErrorMessage(data.error || "فشلت عملية السحب");
      }
    } catch (err) {
      setErrorMessage("حدث خطأ أثناء معالجة عملية السحب");
    } finally {
      setSubmitting(false);
    }
  };

  const totalWithdrawnAll = withdrawals.reduce((acc, c) => acc + (c.requested_amount || 0), 0);

  return (
    <div id="ewa-wellness-view" className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-700 to-cyan-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 bg-emerald-500/20 backdrop-blur rounded-xl border border-emerald-400/30">
              <Wallet className="w-6 h-6 text-emerald-300" />
            </span>
            <h2 className="text-xl font-black">سحب الراتب المستحق عند الطلب (Earned Wage Access - EWA)</h2>
          </div>
          <p className="text-sm text-emerald-100/90 max-w-2xl">
            برنامج العافية المالية المعتمد لتمكين الموظفين من سحب مستحقات أيام العمل المنجزة فورياً قبل موعد المسير، مع الربط الآلي بمسيرات الرواتب وملف حماية الأجور (WPS/SIF).
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl border border-white/20">
          <div className="text-right">
            <span className="text-xs text-emerald-200 block">إجمالي السحوبات الشهرية:</span>
            <span className="text-lg font-black text-white font-mono">{totalWithdrawnAll.toLocaleString()} ر.س</span>
          </div>
          <button 
            onClick={fetchInitialData} 
            className="p-2 bg-white/15 hover:bg-white/25 rounded-lg transition"
            title="تحديث البيانات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Simulator on Left / History on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive EWA Simulator & Request Form (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-600" />
                محاكي وبوابة السحب الفوري
              </h3>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                سقف أمان 50%
              </span>
            </div>

            {/* Employee Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">اختر الموظف المستفيد:</label>
              <select
                id="ewa-employee-select"
                value={selectedEmpId || ''}
                onChange={(e) => handleEmpChange(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} - ({emp.job_title || emp.position})
                  </option>
                ))}
              </select>
            </div>

            {/* Real-time Calculation Cards */}
            {eligibility && (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-500 block">أيام العمل المنجزة:</span>
                    <span className="text-base font-bold text-slate-800 dark:text-white font-mono">
                      {eligibility.days_worked_so_far} / {eligibility.days_in_month} يوم
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-500 block">المستحق المكتسب حتى اليوم:</span>
                    <span className="text-base font-bold text-teal-700 dark:text-teal-400 font-mono">
                      {eligibility.earned_so_far.toLocaleString()} ر.س
                    </span>
                  </div>
                </div>

                {/* Balance Progress Bar */}
                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200">الرصيد المتاح للسحب الآن:</span>
                    <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      {eligibility.available_limit.toLocaleString()} ر.س
                    </span>
                  </div>
                  
                  <div className="w-full bg-emerald-200 dark:bg-emerald-900/60 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${Math.min(100, (eligibility.available_limit / ((eligibility.earned_so_far * 0.5) || 1)) * 100)}%` 
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-emerald-800/70 dark:text-emerald-400/80 pt-0.5">
                    <span>تم سحب: {eligibility.already_withdrawn.toLocaleString()} ر.س</span>
                    <span>الحد الأقصى (50%): {Math.round(eligibility.earned_so_far * 0.5).toLocaleString()} ر.س</span>
                  </div>
                </div>

                {/* Withdrawal Form */}
                <form onSubmit={handleWithdrawSubmit} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">المبلغ المطلوب سحبه (ر.س):</label>
                    <div className="relative">
                      <input
                        id="ewa-withdraw-amount-input"
                        type="number"
                        min="100"
                        max={eligibility.available_limit}
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="أدخل المبلغ..."
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-base font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 pr-12 font-mono"
                      />
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">ر.س</span>
                    </div>
                  </div>

                  {/* Fee & Net Summary */}
                  {Number(withdrawAmount) > 0 && (
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>رسوم التحويل الفوري الثابتة:</span>
                        <span>15.00 ر.س</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span>صافي المبلغ المحول للبنك:</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {Math.max(0, Number(withdrawAmount) - 15).toLocaleString()} ر.س
                        </span>
                      </div>
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-3 bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="p-3 bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    id="submit-ewa-btn"
                    type="submit"
                    disabled={submitting || !eligibility.can_withdraw || Number(withdrawAmount) > eligibility.available_limit || Number(withdrawAmount) < 100}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 rotate-180" />
                    )}
                    <span>تأكيد السحب الفوري والإيداع البنكي</span>
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Compliance Card */}
          <div className="p-4 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl text-xs text-teal-900 dark:text-teal-200 space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>الضوابط والامتثال لنظام العمل:</span>
            </div>
            <p className="leading-relaxed">
              السحب عند الطلب ليس قرضاً ربوياً، بل هو صرف لجزء من الأجر المستحق عن أيام عمل فعلية منجزة. يتم ترحيل المبلغ المسحوب آلياً كبند استقطاع في ملف حماية الأجور (SIF) لشهر الصرف دون أي مساس بحقوق الموظف.
            </p>
          </div>
        </div>

        {/* Right Column: Withdrawals Ledger & History (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  سجل عمليات السحب الفوري المكتملة
                </h3>
                <p className="text-xs text-slate-500">مربوطة تلقائياً بمسيرات الرواتب وملف WPS</p>
              </div>
              <span className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-mono">
                {withdrawals.length} عمليات مسجلة
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                جاري تحميل سجل السحوبات...
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                لا توجد عمليات سحب مسجلة حتى الآن.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">الموظف</th>
                      <th className="p-3">تاريخ الطلب</th>
                      <th className="p-3">المبلغ المسحوب</th>
                      <th className="p-3">الرسوم / الصافي</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="p-3">
                          <div className="font-bold text-slate-800 dark:text-white">{w.employee_name}</div>
                          <span className="text-[10px] text-slate-400">{w.department_name || 'عام'}</span>
                        </td>
                        <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{w.request_date}</td>
                        <td className="p-3 font-bold font-mono text-slate-900 dark:text-white">
                          {w.requested_amount?.toLocaleString()} ر.س
                        </td>
                        <td className="p-3 font-mono text-slate-500">
                          <div>صافي: {w.net_disbursed?.toLocaleString()} ر.س</div>
                          <span className="text-[10px] text-slate-400">رسوم: {w.fee} ر.س</span>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            محول للبنك
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
