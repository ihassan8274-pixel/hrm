import { useState, useEffect } from 'react';
import { Calendar, Download, RefreshCw, CheckCircle2, History, Printer, X, User, Search, ShieldCheck, Building, FileText, Lock } from 'lucide-react';
import type { PayrollRecord, Employee } from '../types';
import { PdfExportModal } from './PdfExportModal';

export default function PayrollView() {
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

  const fetchPayroll = async () => {
    const res = await fetch(`/api/payroll?month=${month}&year=${year}`);
    const data = await res.json();
    setPayroll(data);
  };

  const filteredPayroll = payroll.filter(record => 
    record.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.national_id_iqama && record.national_id_iqama.includes(searchTerm))
  );

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

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year })
      });
      const data = await res.json().catch(() => ({}));
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
        p.national_id_iqama || 'N/A',
        p.saudi_iban || p.bank_account || 'N/A',
        p.bank_name || 'مصرف الراجحي',
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

            <a
              href={`/api/saudi/wps-export?month=${month}&year=${year}`}
              download
              className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl font-black hover:bg-emerald-100 transition-all text-xs border border-emerald-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ملف مدد (SIF)</span>
            </a>

            <button 
              onClick={exportBankFile}
              className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>كشف Excel</span>
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
                    <th className="px-6 py-4 text-center text-indigo-700">تأمينات GOSI</th>
                    <th className="px-6 py-4 text-center font-black text-slate-800">صافي المستحق</th>
                    <th className="px-6 py-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayroll.map(record => (
                    <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${record.is_saudi ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          <div>
                            <p className="font-bold text-slate-800">{record.employee_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono font-bold">
                              {record.national_id_iqama || 'N/A'} • {record.department_name}
                            </p>
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
                      <td className="px-6 py-4 text-center font-mono text-xs text-indigo-700 font-bold">
                         <p>{record.insurance_emp_share > 0 ? `-${record.insurance_emp_share.toLocaleString()} ر.س` : '0.00 ر.س'}</p>
                         <span className="text-[10px] text-slate-400 font-normal">
                           {record.is_saudi ? '(9.75% سعودي)' : '(0% وافد)'}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-black text-slate-900 text-base bg-slate-50/50">
                        {record.net_salary.toLocaleString()} ر.س
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => fetchSlipDetails(record)}
                          className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                        >
                          قسيمة الراتب
                        </button>
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
                <button onClick={handleGenerate} className="mt-4 text-emerald-600 text-sm font-black flex items-center gap-2 mx-auto hover:underline">
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
              <div className="flex justify-between text-indigo-300">
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

            <a
              href={`/api/saudi/wps-export?month=${month}&year=${year}`}
              download
              className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-md block text-center text-xs"
            >
              <Download className="w-4 h-4" />
              <span>تحميل ملف مدد (WPS SIF)</span>
            </a>
          </div>
        </div>
      </div>

      {/* Salary Slip Modal */}
      {selectedSlip && employeeDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative animate-in slide-in-from-bottom-8 duration-300">
            <button 
              onClick={() => setSelectedSlip(null)}
              className="absolute left-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 pb-4">
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
                    <span className="text-[10px] text-slate-400 font-mono">{employeeDetails.saudi_iban || employeeDetails.bank_account || 'IBAN'}</span>
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
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-colors shadow-md shadow-emerald-200"
                >
                  <FileText className="w-4 h-4" />
                  <span>تصدير مسير / قسيمة PDF</span>
                </button>
                <button 
                  onClick={() => window.print()}
                  className="py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-colors shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة فورية</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {showPdfModal && (
        <PdfExportModal
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          defaultReportType={pdfReportType}
          selectedSlipData={selectedSlip ? { slip: selectedSlip, employee: employeeDetails } : undefined}
        />
      )}
    </div>
  );
}
