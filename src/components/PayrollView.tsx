import { useState, useEffect, lazy, Suspense } from 'react';
import { Calendar, Download, RefreshCw, CheckCircle2, History, Printer, X, User, Search, ShieldCheck, Building, FileText, Lock, Receipt, Trash2, Plus, AlertTriangle } from 'lucide-react';
import type { PayrollRecord, Employee } from '../types';
import { downloadProtectedFile } from '../lib/api';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';
// Lazy: this modal pulls in jsPDF + html2canvas (~594KB), which is only worth
// loading once someone actually opens the export dialog.
const PdfExportModal = lazy(() => import('./PdfExportModal').then(m => ({ default: m.PdfExportModal })));

function todayAsInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function PayrollView() {
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState<PayrollRecord | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<Employee | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfReportType, setPdfReportType] = useState<'payroll' | 'payslip'>('payroll');
  const [locked, setLocked] = useState(false);
  const [valueDate, setValueDate] = useState(todayAsInputValue);
  const [exportingSif, setExportingSif] = useState(false);
  // قرار الاعتماد منفصل عن إقفال الفترة: الإقفال يمنع التعديل، والاعتماد هو
  // الإذن الوحيد الذي يسمح بخروج ملف بنك إلى مدد.
  const [approval, setApproval] = useState<any>(null);
  const [approving, setApproving] = useState(false);

  // أدوات الحركات المرتبطة بالمسير: دفعات خارج الدورة وتصحيح مسير مُقفل.
  const [offCycleLines, setOffCycleLines] = useState<any[]>([]);
  const [offCycleBusy, setOffCycleBusy] = useState(false);
  const [newOffCycle, setNewOffCycle] = useState({ employee_id: 0, type: 'earning', amount: '', reason: '' });
  const [corrections, setCorrections] = useState<any[]>([]);
  const [correction, setCorrection] = useState({ employee_id: 0, field: 'bonuses', new_value: '', reason: '' });
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [toolNotice, setToolNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // جاهزية المسير وإعادة الاحتساب من المصدر مع معاينة الفرق قبل الاعتماد.
  const [preflight, setPreflight] = useState<any>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [recalcEmployee, setRecalcEmployee] = useState(0);
  const [recalcPreview, setRecalcPreview] = useState<any>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  // إيصالات تسليم الراتب: نطاق الطباعة (الكل/نقدي/إدارة/فرع) ودفعة الطباعة.
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptScope, setReceiptScope] = useState<'all' | 'cash' | 'department' | 'branch'>('all');
  const [receiptDept, setReceiptDept] = useState('');
  const [receiptBranch, setReceiptBranch] = useState('');
  const [receiptBatch, setReceiptBatch] = useState<PayrollRecord[] | null>(null);

  useEffect(() => {
    if (!receiptBatch) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [receiptBatch]);

  const fetchPayroll = async () => {
    const [res, approvalRes] = await Promise.all([
      fetch(`/api/payroll?month=${month}&year=${year}`),
      fetch(`/api/payroll/approval-status?month=${month}&year=${year}`),
    ]);
    const [data, approvalData] = await Promise.all([res.json(), approvalRes.json().catch(() => ({}))]);
    setPayroll(Array.isArray(data) ? data : []);
    setApproval(approvalRes.ok ? approvalData : null);
  };

  const handleApprove = async () => {
    if (!payroll.length) return;
    if (!window.confirm(`اعتماد مسير ${month}/${year} لعدد ${payroll.length} موظف؟\nبعد الاعتماد لا يمكن تعديل المسير، ويصبح ملف الحوالات جاهزاً للتصدير.`)) return;
    setApproving(true);
    try {
      const res = await fetch('/api/payroll/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر اعتماد المسير');
      setToolNotice({ kind: 'ok', text: `تم اعتماد ${data.approved} سطراً من أصل ${data.totalApproved}` });
      await fetchPayroll();
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذّر اعتماد المسير' });
    } finally { setApproving(false); }
  };

  const fetchTools = async () => {
    const [linesRes, correctionsRes] = await Promise.all([
      fetch(`/api/additional-salaries?month=${month}&year=${year}`),
      fetch(`/api/payroll/corrections?month=${month}&year=${year}`),
    ]);
    const [lines, records] = await Promise.all([linesRes.json(), correctionsRes.json()]);
    setOffCycleLines(Array.isArray(lines) ? lines : []);
    setCorrections(Array.isArray(records) ? records : []);
  };

  const payrollEmployees = payroll.map(p => ({ id: Number(p.employee_id), name: p.employee_name }));
  const selectedOffCycleEmployee = payroll.find(p => Number(p.employee_id) === Number(newOffCycle.employee_id));
  const selectedCorrectionEmployee = payroll.find(p => Number(p.employee_id) === Number(correction.employee_id));

  const handleAddOffCycle = async () => {
    if (!newOffCycle.employee_id || Number(newOffCycle.amount) <= 0) {
      setToolNotice({ kind: 'err', text: 'اختر الموظف وأدخل مبلغاً أكبر من صفر' });
      return;
    }
    setOffCycleBusy(true);
    try {
      const res = await fetch('/api/additional-salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: Number(newOffCycle.employee_id),
          amount: Number(newOffCycle.amount),
          type: newOffCycle.type,
          component: 'one-off',
          reason: newOffCycle.reason,
          month, year,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر إضافة الدفعة');
      setNewOffCycle({ employee_id: 0, type: 'earning', amount: '', reason: '' });
      setToolNotice({ kind: 'ok', text: 'تمت إضافة الدفعة الإضافية' });
      await fetchTools();
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذّر إضافة الدفعة' });
    } finally { setOffCycleBusy(false); }
  };

  const handleDeleteOffCycle = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الدفعة الإضافية؟')) return;
    setOffCycleBusy(true);
    try {
      const res = await fetch(`/api/additional-salaries/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر حذف الدفعة');
      setToolNotice({ kind: 'ok', text: 'تم حذف الدفعة الإضافية' });
      await fetchTools();
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذّر حذف الدفعة' });
    } finally { setOffCycleBusy(false); }
  };

  const handleCorrection = async () => {
    if (!correction.employee_id || !correction.new_value || correction.reason.trim().length < 3) {
      setToolNotice({ kind: 'err', text: 'اختر الموظف وأدخل القيمة وسبباً من 3 أحرف على الأقل' });
      return;
    }
    setCorrectionBusy(true);
    try {
      const res = await fetch('/api/payroll/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, year,
          employee_id: Number(correction.employee_id),
          field: correction.field,
          new_value: Number(correction.new_value),
          reason: correction.reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر تصحيح المسير');
      setCorrection({ employee_id: 0, field: 'bonuses', new_value: '', reason: '' });
      setToolNotice({
        kind: 'ok',
        text: `تم التصحيح — الصافي ${Number(data.recomputed_net || 0).toLocaleString()} ر.س (نقدي ${Number(data.cash_amount || 0).toLocaleString()} / بنك ${Number(data.bank_amount || 0).toLocaleString()})`,
      });
      await Promise.all([fetchPayroll(), fetchTools()]);
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذّر تصحيح المسير' });
    } finally { setCorrectionBusy(false); }
  };

  const filteredPayroll = payroll.filter(record => 
    record.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.national_id_iqama && record.national_id_iqama.includes(searchTerm))
  );

  const cashOf = (r: PayrollRecord) => r.cash_amount ?? 0;
  const bankOf = (r: PayrollRecord) => r.bank_amount ?? r.net_salary;
  const departments = [...new Set(payroll.map(r => r.department_name).filter(Boolean))] as string[];
  const branches = [...new Set(payroll.map(r => r.branch_name).filter(Boolean))] as string[];
  const scopedReceipts = payroll.filter(r => {
    if (receiptScope === 'cash') return cashOf(r) > 0;
    if (receiptScope === 'department') return receiptDept !== '' && r.department_name === receiptDept;
    if (receiptScope === 'branch') return receiptBranch !== '' && r.branch_name === receiptBranch;
    return true;
  });
  const paymentLabel = (r: PayrollRecord) => {
    const cash = cashOf(r);
    const bank = bankOf(r);
    if (cash > 0 && bank > 0) return 'نقدي + تحويل بنكي';
    if (cash > 0) return 'نقدي';
    return 'تحويل بنكي';
  };

  const fetchSlipDetails = async (record: PayrollRecord) => {
    const res = await fetch('/api/employees');
    const allEmployees: Employee[] = await res.json();
    const emp = allEmployees.find(e => e.id === record.employee_id);
    if (emp) {
      setEmployeeDetails(emp);
      setSelectedSlip(record);
    }
  };

  useEffect(() => {
    fetchPayroll();
    fetchTools();
    fetch(`/api/payroll/lock-status?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => setLocked(!!d.locked))
      .catch(() => {});
  }, [month, year]);

  const toggleLock = async () => {
    const res = await fetch('/api/payroll/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, locked: !locked })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'تعذر تغيير حالة الإقفال');
    setLocked(!!data.locked);
  };

  const runPreflight = async () => {
    setPreflightBusy(true);
    try {
      const res = await fetch(`/api/payroll/preflight?month=${month}&year=${year}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر فحص الجاهزية');
      setPreflight(data);
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذر فحص الجاهزية' });
    } finally { setPreflightBusy(false); }
  };

  const previewRecalc = async () => {
    if (!recalcEmployee) {
      setToolNotice({ kind: 'err', text: 'اختر الموظف أولاً' });
      return;
    }
    setRecalcBusy(true);
    try {
      const res = await fetch('/api/payroll/recalculate/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, employee_id: Number(recalcEmployee) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذرت المعاينة');
      setRecalcPreview(data);
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذرت المعاينة' });
    } finally { setRecalcBusy(false); }
  };

  const applyRecalc = async () => {
    if (!recalcPreview) return;
    if (!window.confirm('سيُعاد احتساب البنود المعروضة في المعاينة فقط. هل تريد المتابعة؟')) return;
    setRecalcBusy(true);
    try {
      const res = await fetch('/api/payroll/recalculate/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, year, employee_id: recalcPreview.employee_id,
          expected_net: recalcPreview?.current?.net_salary,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر تطبيق إعادة الاحتساب');
      setToolNotice({ kind: 'ok', text: `تم تحديث ${data.changed} بنداً من المصدر` });
      setRecalcPreview(null);
      await Promise.all([fetchPayroll(), fetchTools()]);
    } catch (e) {
      setToolNotice({ kind: 'err', text: e instanceof Error ? e.message : 'تعذر تطبيق إعادة الاحتساب' });
    } finally { setRecalcBusy(false); }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year })
      });
      const data = await res.json().catch(() => ({}));
      if (data.report) setPreflight(data.report);
      if (!res.ok) alert(data.error || 'تعذر احتساب المسير');
    } finally {
      await fetchPayroll();
      setIsLoading(false);
    }
  };

  const exportBankFile = () => {
    const csvContent = [
      ['اسم الموظف', 'رقم الهوية / الإقامة', 'الآيبان السعودي (IBAN)', 'اسم البنك', 'المبلغ البنكي', 'المبلغ النقدي', 'الصافي', 'العملة'],
      ...payroll.map(p => [
        `"${p.employee_name}"`,
        p.national_id_iqama || 'غير مسجل',
        p.saudi_iban || p.bank_account || 'غير مسجل',
        p.bank_name || '(غير محدد)',
        (p as any).bank_amount ?? p.net_salary,
        (p as any).cash_amount ?? 0,
        p.net_salary,
        'SAR'
      ])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Saudi_Bank_Payroll_${month}_${year}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportSifFile = async () => {
    setExportingSif(true);
    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        value_date: valueDate,
      });
      const failure = await downloadProtectedFile(
        `/api/saudi/wps-export?${params.toString()}`,
        `SIF_${year}${String(month).padStart(2, '0')}.sif`
      );
      if (failure) alert(failure.message);
    } finally {
      setExportingSif(false);
    }
  };

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800">مسير الرواتب وحماية الأجور (WPS)</h1>
          <p className="text-slate-500 text-sm">احتساب رواتب الموظفين، استقطاعات التأمينات GOSI، والبدلات بنظام المملكة</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-2xl border border-slate-100 shadow-sm w-full md:w-auto">
             <Search className="w-4 h-4 text-slate-400" />
             <input 
              type="text" 
              placeholder="بحث بالاسم أو الهوية/الإقامة..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-700 text-right w-full text-xs"
             />
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 px-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <select 
                value={month} 
                onChange={e => setMonth(Number(e.target.value))}
                className="bg-transparent border-none outline-none font-bold text-slate-700 text-sm"
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i+1} value={i+1}>شهر {i+1}</option>
                ))}
              </select>
              <span className="text-slate-300">/</span>
              <select 
                value={year} 
                onChange={e => setYear(Number(e.target.value))}
                className="bg-transparent border-none outline-none font-bold text-slate-700 text-sm"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={() => {
                setPdfReportType('payroll');
                setShowPdfModal(true);
              }}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl font-black hover:bg-emerald-700 transition-all text-xs shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>تصدير مسير PDF</span>
            </button>

            <button
              onClick={() => setReceiptModalOpen(true)}
              disabled={payroll.length === 0}
              className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl font-black hover:bg-amber-600 transition-all text-xs shadow-sm disabled:opacity-50"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>إيصالات التسليم</span>
            </button>

            <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-xl border border-slate-100">
              <label htmlFor="payroll-value-date" className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                تاريخ القيمة
              </label>
              <input
                id="payroll-value-date"
                type="date"
                value={valueDate}
                onChange={e => setValueDate(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs"
              />
            </div>

            <button
              onClick={exportSifFile}
              disabled={exportingSif || !valueDate}
              className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl font-black hover:bg-emerald-100 transition-all text-xs border border-emerald-200 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingSif ? 'جارٍ التوليد...' : 'ملف الحوالات (SIF)'}</span>
            </button>

            <button 
              onClick={exportBankFile}
              className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>كشف Excel</span>
            </button>

            <button
              onClick={handleApprove}
              disabled={approving || payroll.length === 0 || (approval?.pending === 0 && approval?.legacy === 0)}
              title="اعتماد المسير شرط لتصدير ملف الحوالات (WPS)"
              className="flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-xl font-black hover:bg-brand-700 transition-all text-xs shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${approving ? 'animate-spin' : ''}`} />
              <span>{approving ? 'جارٍ الاعتماد...' : approval?.pending ? `اعتماد المسير (${approval.pending})` : 'اعتماد المسير'}</span>
            </button>

            <button 
              onClick={toggleLock}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black transition-all text-xs border ${locked ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{locked ? 'المسير مُقفل — فتح' : 'إقفال واعتماد المسير'}</span>
            </button>

            <button 
              onClick={handleGenerate}
              disabled={isLoading}
              className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-xl font-black hover:bg-black transition-all disabled:opacity-50 text-xs shadow-md shadow-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>مزامنة الحضور واحتساب المسير</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">الموظف / الهوية</th>
                    <th className="px-6 py-4 text-center">الأساسي</th>
                    <th className="px-6 py-4 text-center">البدلات (سكن/نقل)</th>
                    <th className="px-6 py-4 text-center text-rose-600">الاستقطاعات/السلف</th>
                    <th className="px-6 py-4 text-center text-brand-700">تأمينات GOSI</th>
                    <th className="px-6 py-4 text-center font-black text-slate-800">صافي المستحق</th>
                    <th className="px-6 py-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayroll.map(record => (
                    <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${record.is_saudi ? 'bg-emerald-500' : 'bg-brand-500'}`} />
                          <div>
                            <p className="font-bold text-slate-800">{record.employee_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono font-bold">
                              {record.national_id_iqama || 'N/A'} • {record.department_name}
                            </p>
                            <span className={`inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                              (record as any).payment_status === 'paid' ? 'bg-slate-800 text-white'
                              : (record as any).approval_status === 'approved' || (record as any).approval_status == null
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {(record as any).payment_status === 'paid' ? 'مصروف'
                                : (record as any).approval_status === 'approved' || (record as any).approval_status == null
                                  ? 'معتمد' : 'بانتظار الاعتماد'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs font-bold text-slate-700">
                        {record.basic_salary.toLocaleString()} ر.س
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs text-emerald-700 font-bold">
                         <p>+{(record.allowances + record.bonuses).toLocaleString()} ر.س</p>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs text-rose-600 font-bold">
                         <p>-{(record.deductions + record.penalties).toLocaleString()} ر.س</p>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs text-brand-700 font-bold">
                         <p>{record.insurance_emp_share > 0 ? `-${record.insurance_emp_share.toLocaleString()} ر.س` : '0.00 ر.س'}</p>
                         <span className="text-[10px] text-slate-400 font-normal">
                           {record.is_saudi ? '(9.75% سعودي)' : '(0% وافد)'}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-black text-slate-900 text-base bg-slate-50/50">
                        {record.net_salary.toLocaleString()} ر.س
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => fetchSlipDetails(record)}
                            className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-emerald-50 hover:text-brand-700 transition-colors"
                          >
                            قسيمة الراتب
                          </button>
                          <button
                            onClick={() => setReceiptBatch([record])}
                            title="طباعة إيصال تسليم الراتب"
                            className="text-xs font-bold bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors"
                          >
                            إيصال تسليم
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payroll.length === 0 && (
              <div className="py-20 text-center">
                <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 font-medium">لم يتم استخراج مسير رواتب لهذا الشهر بعد</p>
                <button onClick={handleGenerate} className="mt-4 text-brand-600 text-sm font-black flex items-center gap-2 mx-auto hover:underline">
                  <RefreshCw className="w-4 h-4" />
                  <span>استخراج واحتساب الآن</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Summary */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-3xl shadow-xl space-y-4">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-400/20 inline-block">
              إجمالي مسير الرواتب المعتمد
            </span>
            <p className="text-3xl font-black font-mono text-emerald-400">
              {payroll.reduce((sum, r) => sum + r.net_salary, 0).toLocaleString()} <span className="text-sm font-sans font-medium text-slate-400">ر.س</span>
            </p>
            <div className="pt-4 border-t border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">عدد الموظفين:</span>
                <span className="font-bold font-mono">{payroll.length} موظف</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">إجمالي الأساسي:</span>
                <span className="font-bold font-mono">{payroll.reduce((sum, r) => sum + r.basic_salary, 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">إجمالي البدلات:</span>
                <span className="font-bold font-mono">{payroll.reduce((sum, r) => sum + r.allowances, 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between text-brand-300">
                <span>استقطاع GOSI للموظفين:</span>
                <span className="font-bold font-mono">-{payroll.reduce((sum, r) => sum + (r.insurance_emp_share || 0), 0).toLocaleString()} ر.س</span>
              </div>
              <div className="pt-3 mt-1 border-t border-slate-700 space-y-2">
                <div className="flex justify-between text-emerald-300">
                  <span>المحول بنكياً (WPS):</span>
                  <span className="font-bold font-mono">
                    {payroll.reduce((sum, r) => sum + ((r as any).bank_amount ?? r.net_salary), 0).toLocaleString()} ر.س
                  </span>
                </div>
                <div className="flex justify-between text-amber-300">
                  <span>المدفوع نقداً:</span>
                  <span className="font-bold font-mono">
                    {payroll.reduce((sum, r) => sum + ((r as any).cash_amount || 0), 0).toLocaleString()} ر.س
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={exportSifFile}
              disabled={exportingSif || !valueDate}
              className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-md text-xs disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{exportingSif ? 'جارٍ التوليد...' : 'تحميل ملف الحوالات (WPS SIF)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* فحص الجاهزية وإعادة الاحتساب من المصدر */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> فحص جاهزية المسير قبل الاحتساب
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              يمنع إنشاء المسير إذا كان أي موظف غير قابل للدفع (راتب صفر، حساب بنكي مفقود، أو نسبة نقد غير صحيحة).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {preflight && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${preflight.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {preflight.ready ? 'جاهز للاحتساب' : 'غير جاهز'}
              </span>
            )}
            <button
              onClick={runPreflight}
              disabled={preflightBusy}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50"
            >
              {preflightBusy ? 'جارٍ الفحص...' : 'فحص الجاهزية'}
            </button>
          </div>
        </div>

        {preflight && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
              موظفون سيُحتسبون: {preflight.checked} — حالياً في المسير: {preflight.existing}
            </div>
            <div className="rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
              موانع الدفع: {preflight.blockers?.length || 0}
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">
              تنبيهات: {preflight.warnings?.length || 0}
            </div>
          </div>
        )}
        {preflight && (preflight.blockers?.length > 0 || preflight.warnings?.length > 0) && (
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-50">
            {[...preflight.blockers, ...preflight.warnings].map((issue: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 text-[11px]">
                <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${issue.severity === 'block' ? 'text-rose-600' : 'text-amber-600'}`} />
                <span className="font-bold text-slate-700">{issue.employee_name}</span>
                <span className="text-slate-500">{issue.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-100 pt-5">
          <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-brand-600" /> إعادة احتساب مسير من المصدر
          </h4>
          <p className="text-[11px] text-slate-500 mb-4">
            تعرض المعاينة الفرق قبل التطبيق، وتستخدم نفس معادلات إنشاء المسير. لا تُطبَّق على مسير مقفل، ولا تُكرِّر خصم السلفة.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={recalcEmployee}
              onChange={e => { setRecalcEmployee(Number(e.target.value)); setRecalcPreview(null); }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value={0}>اختر موظفاً من المسير...</option>
              {payrollEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button
              onClick={previewRecalc}
              disabled={recalcBusy || !recalcEmployee}
              className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-black disabled:opacity-50"
            >
              {recalcBusy ? 'جارٍ...' : 'معاينة الفرق'}
            </button>
            {recalcPreview && (
              <button
                onClick={applyRecalc}
                disabled={recalcBusy || recalcPreview.locked || !recalcPreview.diff?.length}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50"
              >
                اعتماد التحديث ({recalcPreview.diff?.length || 0})
              </button>
            )}
            {recalcPreview?.locked && (
              <span className="text-[11px] font-bold text-amber-700">المسير مقفل — المعاينة للاطلاع فقط</span>
            )}
          </div>
          {recalcPreview && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-slate-50 text-slate-500 font-black">
                  <tr><th className="px-3 py-2">البند</th><th className="px-3 py-2">الحالي</th><th className="px-3 py-2">بعد الاحتساب</th><th className="px-3 py-2">الفرق</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(recalcPreview.diff || []).map((d: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-bold text-slate-700">{d.field}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{String(d.before ?? '—')}</td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-800">{String(d.after ?? '—')}</td>
                      <td className="px-3 py-2 font-mono text-brand-700">
                        {typeof d.after === 'number' && typeof d.before === 'number'
                          ? (Number(d.after) - Number(d.before)).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {!recalcPreview.diff?.length && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">لا يوجد فرق — المسير مطابق للمصادر</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* أدوات الحركات المرتبطة بالمسير */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-600" /> الدفعات الإضافية خارج الدورة
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                تُضاف إلى مسير {month}/{year} أو تُخصم منه. الحذف متاح ما دام المسير غير مقفل.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
              {offCycleLines.length} دفعة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={newOffCycle.employee_id}
              onChange={e => setNewOffCycle({ ...newOffCycle, employee_id: Number(e.target.value) })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value={0}>اختر موظفاً...</option>
              {payrollEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select
              value={newOffCycle.type}
              onChange={e => setNewOffCycle({ ...newOffCycle, type: e.target.value })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="earning">مستحق (+)</option>
              <option value="deduction">خصم (-)</option>
            </select>
            <input
              type="number"
              min="1"
              placeholder="المبلغ (ر.س)"
              value={newOffCycle.amount}
              onChange={e => setNewOffCycle({ ...newOffCycle, amount: e.target.value })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="السبب (اختياري)"
              value={newOffCycle.reason}
              onChange={e => setNewOffCycle({ ...newOffCycle, reason: e.target.value })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {selectedOffCycleEmployee && (
            <p className="text-[11px] font-bold text-brand-700 bg-brand-50 rounded-xl px-3 py-2">
              طريقة دفع {selectedOffCycleEmployee.employee_name}: {paymentLabel(selectedOffCycleEmployee)} — ستُطبَّق عند احتساب المسير.
            </p>
          )}

          {locked && (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
              المسير مقفل لهذا الشهر — افتحه أولاً قبل إضافة أو حذف دفعة.
            </p>
          )}

          <button
            onClick={handleAddOffCycle}
            disabled={offCycleBusy || locked}
            title={locked ? 'افتح المسير أولاً قبل إضافة دفعة' : 'إضافة دفعة للشهر المفتوح'}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black disabled:opacity-40 transition-colors"
          >
            إضافة دفعة لهذا الشهر
          </button>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="p-3">الموظف</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">السبب</th>
                  <th className="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offCycleLines.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400 font-bold">لا توجد دفعات إضافية لهذا الشهر</td></tr>
                ) : offCycleLines.map(line => (
                  <tr key={line.id} className="hover:bg-slate-50/70">
                    <td className="p-3 font-bold text-slate-700">{line.employee_name}</td>
                    <td className="p-3">{line.type === 'deduction' ? 'خصم' : 'مستحق'}</td>
                    <td className={`p-3 font-mono font-bold ${line.type === 'deduction' ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {line.type === 'deduction' ? '-' : '+'}{Number(line.amount || 0).toLocaleString()} ر.س
                    </td>
                    <td className="p-3 text-slate-500 max-w-[180px] truncate">{line.reason || '—'}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDeleteOffCycle(Number(line.id))}
                        disabled={offCycleBusy || locked}
                        title={locked ? 'افتح المسير أولاً قبل الحذف' : 'حذف الدفعة'}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30"
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

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" /> تصحيح مسير مقفل
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                يعدّل بنداً واحداً في كشف موظف ويُعيد احتساب الصافي تلقائياً، مع سجل تصحيح موثّق.
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${locked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {locked ? 'المسير مقفل' : 'المسير مفتوح'}
            </span>
          </div>

          {!locked && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-3 text-[11px] font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>التصحيح متاح بعد إقفال المسير. أغلق المسير من زر «إقفال واعتماد المسير» ثم استخدم هذه اللوحة.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={correction.employee_id}
              onChange={e => setCorrection({ ...correction, employee_id: Number(e.target.value) })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value={0}>اختر موظفاً...</option>
              {payrollEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select
              value={correction.field}
              onChange={e => setCorrection({ ...correction, field: e.target.value })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="bonuses">المكافآت</option>
              <option value="allowances">البدلات</option>
              <option value="deductions">الاستقطاعات</option>
              <option value="penalties">الجزاءات</option>
            </select>
            <input
              type="number"
              min="0"
              placeholder="القيمة الجديدة (ر.س)"
              value={correction.new_value}
              onChange={e => setCorrection({ ...correction, new_value: e.target.value })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="سبب التصحيح"
              value={correction.reason}
              onChange={e => setCorrection({ ...correction, reason: e.target.value })}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {selectedCorrectionEmployee && (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
              طريقة دفع {selectedCorrectionEmployee.employee_name}: {paymentLabel(selectedCorrectionEmployee)}
              {' '}(نقدي {cashOf(selectedCorrectionEmployee).toLocaleString()} / بنك {bankOf(selectedCorrectionEmployee).toLocaleString()}) — يُعاد التقسيم تلقائياً بعد التصحيح.
            </p>
          )}

          <button
            onClick={handleCorrection}
            disabled={!locked || correctionBusy}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black disabled:opacity-40 transition-colors"
          >
            تطبيق التصحيح وإعادة احتساب الصافي
          </button>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] font-black text-slate-500 mb-2">آخر التصحيحات لهذا الشهر</p>
            {corrections.length === 0 ? (
              <p className="text-[11px] text-slate-400">لا توجد تصحيحات مسجلة.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {corrections.slice(0, 8).map(c => (
                  <div key={c.id} className="flex justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2 text-[11px]">
                    <span className="font-bold text-slate-700">{c.employee_name} — {c.field}</span>
                    <span className="font-mono text-slate-500">{Number(c.old_value || 0).toLocaleString()} ← {Number(c.new_value || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toolNotice && (
        <div className={`flex items-center justify-between gap-3 rounded-2xl px-5 py-3 text-xs font-bold border ${
          toolNotice.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
        }`}>
          <span>{toolNotice.text}</span>
          <button onClick={() => setToolNotice(null)} className="p-1 hover:bg-white/60 rounded"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Salary Slip Modal */}
      {selectedSlip && employeeDetails && (
        <div className="print-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="print-document bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative animate-in slide-in-from-bottom-8 duration-300">
            <button 
              onClick={() => setSelectedSlip(null)}
              className="no-print absolute left-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 pb-4">
              <Letterhead company={company} />

              <div className="flex items-start gap-4 mb-6">
                <div className="bg-emerald-600 p-4 rounded-2xl text-white">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selectedSlip.employee_name}</h3>
                  <p className="text-slate-500 font-bold text-xs mt-0.5">
                    {employeeDetails.position} • {selectedSlip.branch_name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    الهوية/الإقامة: {selectedSlip.national_id_iqama || employeeDetails.national_id_iqama || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-500">فترة المسير:</span>
                  <span className="font-mono text-slate-800">شهر {selectedSlip.month} / {selectedSlip.year}</span>
                </div>
                <div className="h-px bg-slate-200" />
                
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 font-bold">الراتب الأساسي</span>
                    <span className="font-mono font-black text-slate-800">{selectedSlip.basic_salary.toLocaleString()} ر.س</span>
                  </div>
                  
                  {/* Detailed Allowances */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">البدلات والمستحقات</p>
                    {(employeeDetails.housing_allowance || 0) > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">بدل سكن شهري</span>
                        <span className="font-mono font-bold text-emerald-600">+{(employeeDetails.housing_allowance || 0).toLocaleString()} ر.س</span>
                      </div>
                    )}
                    {(employeeDetails.transport_allowance || 0) > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">بدل مواصلات ونقل</span>
                        <span className="font-mono font-bold text-emerald-600">+{(employeeDetails.transport_allowance || 0).toLocaleString()} ر.س</span>
                      </div>
                    )}
                    {employeeDetails.allowances_details?.map((al, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">{al.name}</span>
                        <span className="font-mono font-medium text-emerald-600">+{al.amount.toLocaleString()} ر.س</span>
                      </div>
                    ))}
                  </div>

                  {/* Deductions & GOSI */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                    <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider">الاستقطاعات والتأمينات GOSI</p>
                    {selectedSlip.insurance_emp_share > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">اشتراك التأمينات الاجتماعية GOSI (9.75%)</span>
                        <span className="font-mono font-bold text-rose-600">-{selectedSlip.insurance_emp_share.toLocaleString()} ر.س</span>
                      </div>
                    )}
                    {selectedSlip.deductions > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">استقطاعات أخرى / غياب / سلف</span>
                        <span className="font-mono font-medium text-rose-600">-{selectedSlip.deductions.toLocaleString()} ر.س</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-px bg-slate-200" />

                <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
                  <div>
                    <p className="text-[11px] text-emerald-300 font-bold">صافي الراتب المحول للحساب</p>
                    <span className="text-[10px] text-slate-400 font-mono">{employeeDetails.saudi_iban || employeeDetails.bank_account || 'غير مسجل'}</span>
                  </div>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    {selectedSlip.net_salary.toLocaleString()} ر.س
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => {
                    setPdfReportType('payslip');
                    setShowPdfModal(true);
                  }}
                  className="no-print flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-colors shadow-md shadow-emerald-200"
                >
                  <FileText className="w-4 h-4" />
                  <span>تصدير مسير / قسيمة PDF</span>
                </button>
                <button 
                  onClick={() => window.print()}
                  className="no-print py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-colors shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة فورية</span>
                </button>
              </div>

              <DocumentFooter company={company} reference={`PAY-${selectedSlip.month}-${selectedSlip.year}`} />
            </div>
          </div>
        </div>
      )}

      {/* نطاق إيصالات التسليم */}
      {receiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm no-print">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-5" dir="rtl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-500" />
                إيصالات تسليم الرواتب — شهر {month} / {year}
              </h3>
              <button onClick={() => setReceiptModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {([
                ['all', 'كل الموظفين في المسير'],
                ['cash', 'المدفوع نقداً فقط (يشمل النقدي الجزئي)'],
                ['department', 'إدارة محددة'],
                ['branch', 'فرع محدد'],
              ] as const).map(([value, label]) => (
                <label key={value} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer text-sm font-bold ${receiptScope === value ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <input
                    type="radio"
                    name="receipt-scope"
                    checked={receiptScope === value}
                    onChange={() => setReceiptScope(value)}
                    className="accent-amber-500"
                  />
                  {label}
                </label>
              ))}
            </div>

            {receiptScope === 'department' && (
              <select
                value={receiptDept}
                onChange={e => setReceiptDept(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-right text-sm font-bold"
              >
                <option value="">اختر الإدارة...</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {receiptScope === 'branch' && (
              <select
                value={receiptBranch}
                onChange={e => setReceiptBranch(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-right text-sm font-bold"
              >
                <option value="">اختر الفرع...</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}

            <div className="bg-slate-50 rounded-2xl p-4 text-xs font-bold text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>عدد الإيصالات:</span>
                <span className="font-mono">{scopedReceipts.length}</span>
              </div>
              <div className="flex justify-between">
                <span>إجمالي الصافي:</span>
                <span className="font-mono">{scopedReceipts.reduce((s, r) => s + r.net_salary, 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>منها نقداً:</span>
                <span className="font-mono">{scopedReceipts.reduce((s, r) => s + cashOf(r), 0).toLocaleString()} ر.س</span>
              </div>
            </div>

            <button
              onClick={() => { setReceiptBatch(scopedReceipts); setReceiptModalOpen(false); }}
              disabled={scopedReceipts.length === 0}
              className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
            >
              <Printer className="w-4 h-4" />
              طباعة {scopedReceipts.length} إيصال (صفحة لكل موظف)
            </button>
          </div>
        </div>
      )}

      {/* دفعة إيصالات التسليم — كل إيصال صفحة مستقلة عبر print-page */}
      {receiptBatch && (
        <div className="print-document bg-white">
          <div className="no-print fixed top-4 left-4 z-50 flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={() => setReceiptBatch(null)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
              <X className="w-4 h-4" /> إغلاق
            </button>
          </div>
          {receiptBatch.map(record => {
            const cash = cashOf(record);
            const bank = bankOf(record);
            return (
              <div key={record.id} className="print-page p-8 space-y-4">
                <Letterhead company={company} title="إيصال تسليم راتب" />
                <div className="flex justify-between text-sm border-b border-slate-300 pb-2">
                  <span className="font-bold">رقم الإيصال: RCP-{record.year}{String(record.month).padStart(2, '0')}-{String(record.employee_id).padStart(4, '0')}</span>
                  <span>فترة الراتب: شهر {record.month} / {record.year}</span>
                </div>

                <table className="w-full text-sm border border-slate-300">
                  <tbody>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 font-bold bg-slate-50 w-36">اسم الموظف</td>
                      <td className="p-2 font-bold">{record.employee_name}</td>
                      <td className="p-2 font-bold bg-slate-50 w-36">الهوية / الإقامة</td>
                      <td className="p-2 font-mono">{record.national_id_iqama || '—'}</td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 font-bold bg-slate-50">الإدارة</td>
                      <td className="p-2">{record.department_name || '—'}</td>
                      <td className="p-2 font-bold bg-slate-50">الفرع</td>
                      <td className="p-2">{record.branch_name || '—'}</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold bg-slate-50">طريقة الدفع</td>
                      <td className="p-2 font-bold" colSpan={3}>{paymentLabel(record)}</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full text-sm border border-slate-300">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-2">الراتب الأساسي</td>
                      <td className="p-2 font-mono text-left" dir="ltr">{record.basic_salary.toLocaleString()} ر.س</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2">البدلات والمكافآت</td>
                      <td className="p-2 font-mono text-left" dir="ltr">+{(record.allowances + record.bonuses).toLocaleString()} ر.س</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2">الاستقطاعات والجزاءات والسلف</td>
                      <td className="p-2 font-mono text-left" dir="ltr">-{(record.deductions + record.penalties).toLocaleString()} ر.س</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2">حصة الموظف في التأمينات (GOSI)</td>
                      <td className="p-2 font-mono text-left" dir="ltr">-{(record.insurance_emp_share || 0).toLocaleString()} ر.س</td>
                    </tr>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="p-2 font-black">صافي الراتب المستحق</td>
                      <td className="p-2 font-mono font-black text-left" dir="ltr">{record.net_salary.toLocaleString()} ر.س</td>
                    </tr>
                    {cash > 0 && (
                      <tr className="border-b border-slate-200">
                        <td className="p-2 font-bold text-amber-700">المسلَّم نقداً</td>
                        <td className="p-2 font-mono font-bold text-left" dir="ltr">{cash.toLocaleString()} ر.س</td>
                      </tr>
                    )}
                    {bank > 0 && (
                      <tr>
                        <td className="p-2 font-bold text-emerald-700">المحوَّل بنكياً {record.saudi_iban ? `(${record.saudi_iban})` : ''}</td>
                        <td className="p-2 font-mono font-bold text-left" dir="ltr">{bank.toLocaleString()} ر.س</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <p className="text-sm leading-relaxed border border-slate-300 rounded-xl p-3 bg-slate-50">
                  أقر أنا الموقع أدناه بأنني استلمت راتبي عن شهر {record.month} / {record.year}
                  {' '}الموضح تفاصيله أعلاه، بمبلغ إجمالي قدره {record.net_salary.toLocaleString()} ر.س
                  {cash > 0 ? ` (منه ${cash.toLocaleString()} ر.س نقداً)` : ''}،
                  {' '}وأنني اطلعت على تفاصيل الاستقطاعات ولا اعتراض لي عليها، وذلك دون إخلال بحقوقي النظامية.
                </p>

                <div className="grid grid-cols-3 gap-6 pt-6 text-center text-sm print-signature">
                  <div>
                    <p className="font-bold mb-6">توقيع الموظف المستلم</p>
                    <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
                  </div>
                  <div>
                    <p className="font-bold mb-6">مسلّم الراتب (المحاسب)</p>
                    <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
                  </div>
                  <div>
                    <p className="font-bold mb-6">اعتماد المدير المالي</p>
                    <p className="border-t border-slate-400 pt-1 text-xs text-slate-500">الاسم / التاريخ</p>
                  </div>
                </div>
                <DocumentFooter company={company} reference={`RCP-${record.year}${String(record.month).padStart(2, '0')}-${String(record.employee_id).padStart(4, '0')}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Export Modal */}
      {showPdfModal && (
        <Suspense fallback={null}>
          <PdfExportModal
            isOpen={showPdfModal}
            onClose={() => setShowPdfModal(false)}
            defaultReportType={pdfReportType}
            selectedSlipData={selectedSlip ? { slip: selectedSlip, employee: employeeDetails } : undefined}
          />
        </Suspense>
      )}
    </div>
  );
}
