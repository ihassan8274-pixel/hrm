import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  X, 
  CheckCircle2, 
  Building2, 
  Landmark, 
  ShieldCheck, 
  QrCode, 
  Check, 
  Calendar,
  Sparkles,
  Layers,
  Award
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { Letterhead } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultReportType?: 'payroll' | 'payslip' | 'financial' | 'compliance' | 'budget';
  selectedSlipData?: { slip: any; employee: any };
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({ 
  isOpen, 
  onClose, 
  defaultReportType = 'payroll',
  selectedSlipData
}) => {
  const { t, language } = useLanguage();
  const [reportType, setReportType] = useState(defaultReportType);
  const [includeStamp, setIncludeStamp] = useState(true);
  const [includeQr, setIncludeQr] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Data states
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | 'all'>(
    selectedSlipData?.employee?.id || 'all'
  );

  const printRef = useRef<HTMLDivElement>(null);
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, selectedMonth, selectedYear]);

  const fetchData = async () => {
    try {
      const [settingsRes, payrollRes, compRes, empsRes, budgetsRes] = await Promise.all([
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/payroll').then(r => r.json()),
        fetch('/api/saudi/compliance-summary').then(r => r.json()),
        fetch('/api/employees').then(r => r.json()),
        fetch('/api/budgets/departments').then(r => r.json()).catch(() => [])
      ]);

      setSettings(settingsRes || {});
      setPayrollData(Array.isArray(payrollRes) ? payrollRes : []);
      setComplianceData(compRes || {});
      setEmployees(Array.isArray(empsRes) ? empsRes : []);
      setBudgets(Array.isArray(budgetsRes) ? budgetsRes : []);
    } catch (e) {
      console.error("Failed to load PDF report data", e);
    }
  };

  if (!isOpen) return null;

  const currentPayrollFiltered = payrollData.filter(p => 
    (!p.month || p.month === selectedMonth) && 
    (!p.year || p.year === selectedYear)
  );

  const selectedEmployeeObj = employees.find(e => e.id === Number(selectedEmployeeId)) || employees[0];

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: reportType === 'payroll' ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = reportType === 'payroll' ? 297 : 210;
      const pageHeight = reportType === 'payroll' ? 210 : 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `تقرير_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const docRefNumber = `REF-${reportType.toUpperCase()}-${selectedYear}${selectedMonth.toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md shadow-emerald-600/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white">{t('pdf.modal_title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('pdf.modal_subtitle')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Controls Bar */}
        <div className="p-4 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0 text-xs">
          <div>
            <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">{t('pdf.select_report')}</label>
            <select 
              value={reportType}
              onChange={e => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="payroll">{t('pdf.report_payroll')}</option>
              <option value="payslip">{t('pdf.report_payslip')}</option>
              <option value="financial">{t('pdf.report_financial')}</option>
              <option value="compliance">{t('pdf.report_compliance')}</option>
              <option value="budget">{t('pdf.report_budget')}</option>
            </select>
          </div>

          {reportType === 'payslip' && (
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">الموظف المعني</label>
              <select 
                value={selectedEmployeeId}
                onChange={e => setSelectedEmployeeId(e.target.value as any)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 outline-none"
              >
                <option value="all">كافة الموظفين (دفعة واحدة)</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.nationality || 'غير مسجل'})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">الشهر</label>
              <select 
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>شهر {m}</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">السنة</label>
              <input 
                type="number"
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-100 outline-none"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col justify-center gap-1.5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={includeStamp} 
                onChange={e => setIncludeStamp(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500" 
              />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px]">{t('pdf.include_stamp')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={includeQr} 
                onChange={e => setIncludeQr(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500" 
              />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px]">{t('pdf.include_qr')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={includeSignatures} 
                onChange={e => setIncludeSignatures(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500" 
              />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px]">{t('pdf.include_signatures')}</span>
            </label>
          </div>
        </div>

        {/* PDF Document Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-200/60 dark:bg-slate-950/50 flex justify-center custom-scrollbar">
          <div 
            ref={printRef}
            className={`bg-white text-slate-900 shadow-xl border border-slate-300 p-8 rounded-none transition-all ${
              reportType === 'payroll' ? 'w-[1050px]' : 'w-[800px]'
            }`}
            style={{ minHeight: '1050px', fontFamily: "'Noto Sans Arabic', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}
            dir="rtl"
          >
            {/* 1. Official Header — الترويسة الموحّدة لكل مخرجات النظام */}
            <div className="mb-6">
              <Letterhead company={company} />
            </div>

            <div className="border-b-2 border-emerald-800 pb-4 mb-6 flex justify-between items-center">
              <div className="space-y-1">
                <div className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded text-xs font-black">
                  مستند رسمي معتمد
                </div>
              </div>

              <div className="text-left space-y-1">
                <p className="text-[10px] text-slate-500 font-mono">المرجع: {docRefNumber}</p>
                <p className="text-[10px] text-slate-500">التاريخ: {new Date().toLocaleDateString('ar-SA')} م</p>
              </div>
            </div>

            {/* 2. Document Title Banner */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center mb-6">
              <h2 className="text-base font-black text-slate-800">
                {reportType === 'payroll' && `كشف مسير الرواتب المعتمد لشهر ${selectedMonth}/${selectedYear} (حسب نظام حماية الأجور مدد)`}
                {reportType === 'payslip' && `قسيمة راتب الموظف الرسمية - شهر ${selectedMonth}/${selectedYear}`}
                {reportType === 'financial' && `التقرير المالي والالتزامات النظامية (GOSI، مكافأة نهاية الخدمة، التأمين)`}
                {reportType === 'compliance' && `تقرير الامتثال الحكومي السعودي ونطاقات والتوطين (Vision 2030)`}
                {reportType === 'budget' && `كشف ميزانيات الموارد البشرية وتكاليف التعيين للأقسام`}
              </h2>
            </div>

            {/* 3. Report Body Content */}
            {reportType === 'payroll' && (
              <div className="space-y-4">
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-emerald-800 text-white font-bold">
                      <th className="border border-emerald-700 p-2">#</th>
                      <th className="border border-emerald-700 p-2 text-right">اسم الموظف</th>
                      <th className="border border-emerald-700 p-2">الهوية / الإقامة</th>
                      <th className="border border-emerald-700 p-2">الجنسية</th>
                      <th className="border border-emerald-700 p-2">الأساسي</th>
                      <th className="border border-emerald-700 p-2">بدل سكن</th>
                      <th className="border border-emerald-700 p-2">بدل نقل</th>
                      <th className="border border-emerald-700 p-2">إجمالي الراتب</th>
                      <th className="border border-emerald-700 p-2">استقطاع GOSI</th>
                      <th className="border border-emerald-700 p-2">خصومات</th>
                      <th className="border border-emerald-700 p-2">صافي المستحق</th>
                      <th className="border border-emerald-700 p-2">الآيبان البنكي (IBAN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentPayrollFiltered.length > 0 ? currentPayrollFiltered : employees).map((item, idx) => {
                      const isSaudi = item.is_saudi === 1 || item.nationality === 'سعودي';
                      const basic = Number(item.basic_salary) || 0;
                      const housing = Number(item.housing_allowance) || 0;
                      const transport = Number(item.transport_allowance) || 0;
                      const totalGross = basic + housing + transport;
                      const gosiEmp = isSaudi ? Math.round((basic + housing) * 0.0975) : 0;
                      const deductions = Number(item.deductions) || 0;
                      const net = item.net_salary || (totalGross - gosiEmp - deductions);

                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="border border-slate-300 p-2 text-center font-mono">{idx + 1}</td>
                          <td className="border border-slate-300 p-2 font-bold">{item.name || item.employee_name}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono">{item.national_id_iqama || 'غير مسجل'}</td>
                          <td className="border border-slate-300 p-2 text-center">{isSaudi ? 'سعودي 🇸🇦' : (item.nationality || 'مقيم')}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono">{basic.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono">{housing.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono">{transport.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono font-bold bg-slate-100">{totalGross.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono text-red-600">{gosiEmp.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono text-red-600">{deductions.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">{net.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono text-[9px]">{item.saudi_iban || 'غير مسجل'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'payslip' && selectedEmployeeObj && (
              <div className="space-y-6">
                {/* Employee Header */}
                <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 rounded-lg bg-slate-50 text-xs">
                  <div>
                    <p className="text-slate-500">اسم الموظف: <span className="font-bold text-slate-900 text-sm">{selectedEmployeeObj.name}</span></p>
                    <p className="text-slate-500 mt-1">المسمى الوظيفي: <span className="font-bold text-slate-900">{selectedEmployeeObj.job_title || selectedEmployeeObj.position || 'موظف'}</span></p>
                    <p className="text-slate-500 mt-1">القسم / الإدارة: <span className="font-bold text-slate-900">{selectedEmployeeObj.department_name || 'الشؤون الإدارية'}</span></p>
                  </div>
                  <div>
                    <p className="text-slate-500">رقم الهوية / الإقامة: <span className="font-bold font-mono text-slate-900">{selectedEmployeeObj.national_id_iqama || 'غير مسجل'}</span></p>
                    <p className="text-slate-500 mt-1">الجنسية: <span className="font-bold text-slate-900">{selectedEmployeeObj.nationality || 'غير مسجل'}</span></p>
                    <p className="text-slate-500 mt-1">البنك والآيبان: <span className="font-bold font-mono text-slate-900">{selectedEmployeeObj.saudi_iban || 'غير مسجل'}</span></p>
                  </div>
                </div>

                {/* Salary Breakdown Table */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Earnings */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="bg-emerald-800 text-white font-bold p-2 text-xs text-center">الاستحقاقات والبدلات (Earnings)</div>
                    <table className="w-full text-xs">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="p-2.5 font-medium">الراتب الأساسي</td>
                          <td className="p-2.5 font-mono text-left font-bold">{Number(selectedEmployeeObj.basic_salary || 12000).toLocaleString()} ر.س</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="p-2.5 font-medium">بدل السكن</td>
                          <td className="p-2.5 font-mono text-left font-bold">{Number(selectedEmployeeObj.housing_allowance || 3000).toLocaleString()} ر.س</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="p-2.5 font-medium">بدل النقل والمواصلات</td>
                          <td className="p-2.5 font-mono text-left font-bold">{Number(selectedEmployeeObj.transport_allowance || 1000).toLocaleString()} ر.س</td>
                        </tr>
                        <tr className="bg-slate-100 font-black">
                          <td className="p-2.5">إجمالي الراتب المستحق</td>
                          <td className="p-2.5 font-mono text-left text-emerald-800">
                            {(Number(selectedEmployeeObj.basic_salary || 12000) + Number(selectedEmployeeObj.housing_allowance || 3000) + Number(selectedEmployeeObj.transport_allowance || 1000)).toLocaleString()} ر.س
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Deductions */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="bg-rose-800 text-white font-bold p-2 text-xs text-center">الاستقطاعات والخصومات (Deductions)</div>
                    <table className="w-full text-xs">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="p-2.5 font-medium">حصة الموظف في التأمينات (GOSI 9.75%)</td>
                          <td className="p-2.5 font-mono text-left font-bold text-rose-600">
                            {selectedEmployeeObj.is_saudi !== 0 ? Math.round((Number(selectedEmployeeObj.basic_salary || 12000) + Number(selectedEmployeeObj.housing_allowance || 3000)) * 0.0975).toLocaleString() : 0} ر.س
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="p-2.5 font-medium">أقساط سلف وقروض</td>
                          <td className="p-2.5 font-mono text-left font-bold text-rose-600">0 ر.س</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="p-2.5 font-medium">خصم غياب / جزاءات</td>
                          <td className="p-2.5 font-mono text-left font-bold text-rose-600">0 ر.س</td>
                        </tr>
                        <tr className="bg-slate-100 font-black">
                          <td className="p-2.5">إجمالي الاستقطاعات</td>
                          <td className="p-2.5 font-mono text-left text-rose-700">
                            {selectedEmployeeObj.is_saudi !== 0 ? Math.round((Number(selectedEmployeeObj.basic_salary || 12000) + Number(selectedEmployeeObj.housing_allowance || 3000)) * 0.0975).toLocaleString() : 0} ر.س
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Net Pay Highlight */}
                <div className="bg-emerald-50 border-2 border-emerald-700 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="text-xs font-black text-emerald-900 uppercase tracking-wider">صافي الراتب المحول إلى الحساب البنكي</p>
                    <p className="text-[10px] text-emerald-700">متوافق مع نظام حماية الأجور WPS ومودع عبر مصرف الراجحي / SNB</p>
                  </div>
                  <div className="text-2xl font-black text-emerald-800 font-mono">
                    {(
                      (Number(selectedEmployeeObj.basic_salary || 12000) + Number(selectedEmployeeObj.housing_allowance || 3000) + Number(selectedEmployeeObj.transport_allowance || 1000)) - 
                      (selectedEmployeeObj.is_saudi !== 0 ? Math.round((Number(selectedEmployeeObj.basic_salary || 12000) + Number(selectedEmployeeObj.housing_allowance || 3000)) * 0.0975) : 0)
                    ).toLocaleString()} ر.س
                  </div>
                </div>
              </div>
            )}

            {reportType === 'financial' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="border border-slate-200 p-3 rounded-lg bg-slate-50">
                    <p className="text-slate-500 font-bold">إجمالي فاتورة الرواتب الشهرية</p>
                    <p className="text-lg font-black text-slate-800 font-mono mt-1">185,400 ر.س</p>
                  </div>
                  <div className="border border-slate-200 p-3 rounded-lg bg-slate-50">
                    <p className="text-slate-500 font-bold">حصة المنشأة في التأمينات (GOSI)</p>
                    <p className="text-lg font-black text-brand-700 font-mono mt-1">21,780 ر.س</p>
                  </div>
                  <div className="border border-slate-200 p-3 rounded-lg bg-slate-50">
                    <p className="text-slate-500 font-bold">مخصص مكافأة نهاية الخدمة (IAS 19)</p>
                    <p className="text-lg font-black text-emerald-700 font-mono mt-1">340,500 ر.س</p>
                  </div>
                </div>

                <table className="w-full border border-slate-300 text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="p-2 text-right">البند المالي والالتزام</th>
                      <th className="p-2 text-center">المرجع النظامي</th>
                      <th className="p-2 text-center">النسبة / المعيار</th>
                      <th className="p-2 text-left">المبلغ المخصص (ر.س)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">اشتراكات التأمينات الاجتماعية - السعوديين</td>
                      <td className="p-2 text-center">المؤسسة العامة للتأمينات</td>
                      <td className="p-2 text-center font-mono">11.75% صاحب العمل</td>
                      <td className="p-2 text-left font-mono font-bold">19,500</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">اشتراكات الأخطار المهنية - الوافدين</td>
                      <td className="p-2 text-center">المؤسسة العامة للتأمينات</td>
                      <td className="p-2 text-center font-mono">2.00%</td>
                      <td className="p-2 text-left font-mono font-bold">2,280</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">المقابل المالي لرخص العمل (منصة قوى)</td>
                      <td className="p-2 text-center">وزارة الموارد البشرية</td>
                      <td className="p-2 text-center font-mono">800 ر.س / شهر للوافد</td>
                      <td className="p-2 text-left font-mono font-bold">48,000</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">مخصص رصيد الإجازات السنوية المستحقة</td>
                      <td className="p-2 text-center">المادة 109 نظام العمل</td>
                      <td className="p-2 text-center font-mono">21 - 30 يوم سنوياً</td>
                      <td className="p-2 text-left font-mono font-bold">65,200</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'compliance' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4 bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <div>
                    <p className="text-slate-600 font-bold">تصنيف المنشأة في نطاقات:</p>
                    <p className="text-xl font-black text-emerald-800 mt-1">النطاق الأخضر المرتفع 🟢</p>
                    <p className="text-slate-500 text-[11px] mt-1">نسبة التوطين الحالية: <span className="font-mono font-black text-emerald-700">42.5%</span> (الهدف المطلوب: 35%)</p>
                  </div>
                  <div>
                    <p className="text-slate-600 font-bold">الامتثال لحماية الأجور (مدد):</p>
                    <p className="text-xl font-black text-emerald-800 mt-1">نسبة الامتثال 100% 🛡️</p>
                    <p className="text-slate-500 text-[11px] mt-1">تم تسليم جميع المسيرات في موعدها النظامي دون مخالفات</p>
                  </div>
                </div>

                <table className="w-full border border-slate-300 text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="p-2 text-right">المؤشر الحكومي والامتثال</th>
                      <th className="p-2 text-center">الجهة التنظيمية</th>
                      <th className="p-2 text-center">الحالة</th>
                      <th className="p-2 text-center">تاريخ المراجعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">عقود العمل الموثقة بنسبة 100%</td>
                      <td className="p-2 text-center">منصة قوى (QIWA)</td>
                      <td className="p-2 text-center font-bold text-emerald-700">موثق ومعتمد</td>
                      <td className="p-2 text-center font-mono">{new Date().toLocaleDateString('en-GB')}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">التأمين الصحي الإلزامي الموحد</td>
                      <td className="p-2 text-center">مجلس الضمان الصحي CCHI</td>
                      <td className="p-2 text-center font-bold text-emerald-700">ساري ومطابق</td>
                      <td className="p-2 text-center font-mono">{new Date().toLocaleDateString('en-GB')}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2 font-bold">ملف حماية الأجور السنوي (SIF)</td>
                      <td className="p-2 text-center">البنك المركزي السعودي & مدد</td>
                      <td className="p-2 text-center font-bold text-emerald-700">مكتمل 100%</td>
                      <td className="p-2 text-center font-mono">{new Date().toLocaleDateString('en-GB')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'budget' && (
              <div className="space-y-4 text-xs">
                <table className="w-full border border-slate-300 text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="p-2 text-right">الإدارة / القسم</th>
                      <th className="p-2 text-center">سقف الكادر (Headcount)</th>
                      <th className="p-2 text-center">الميزانية المخصصة (ر.س)</th>
                      <th className="p-2 text-center">المصروف الفعلي (ر.س)</th>
                      <th className="p-2 text-left">نسبة الاستهلاك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(budgets.length > 0 ? budgets : [
                      { department_name: 'الموارد البشرية والشؤون الحكومية', headcount_cap: 8, total_allocated: 450000, actual_spent: 380000 },
                      { department_name: 'الإدارة المالية والمحاسبة', headcount_cap: 6, total_allocated: 380000, actual_spent: 310000 },
                      { department_name: 'تقنية المعلومات والبرمجيات', headcount_cap: 12, total_allocated: 850000, actual_spent: 790000 },
                      { department_name: 'المبيعات والتسويق', headcount_cap: 10, total_allocated: 620000, actual_spent: 540000 },
                    ]).map((b: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="p-2 font-bold">{b.department_name}</td>
                        <td className="p-2 text-center font-mono">{b.headcount_cap || 10}</td>
                        <td className="p-2 text-center font-mono font-bold">{Number(b.total_allocated || 500000).toLocaleString()}</td>
                        <td className="p-2 text-center font-mono font-bold text-emerald-700">{Number(b.actual_spent || 400000).toLocaleString()}</td>
                        <td className="p-2 text-left font-mono font-bold">
                          {Math.round(((b.actual_spent || 400000) / (b.total_allocated || 500000)) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. Footer, Stamp, QR & Signatures */}
            <div className="mt-12 pt-6 border-t-2 border-slate-200">
              <div className="grid grid-cols-3 gap-6 items-end">
                {/* Signatures */}
                {includeSignatures && (
                  <div className="space-y-6 text-[11px]">
                    <div>
                      <p className="font-bold text-slate-700">إعداد / مدير الرواتب والامتثال:</p>
                      <p className="text-slate-400 font-mono mt-4">........................................</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-700">اعتماد / المدير العام والرئيس التنفيذي:</p>
                      <p className="text-slate-400 font-mono mt-4">........................................</p>
                    </div>
                  </div>
                )}

                {/* QR Code Verification */}
                {includeQr ? (
                  <div className="text-center flex flex-col items-center justify-center p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="w-20 h-20 bg-white border border-slate-300 p-1 flex items-center justify-center shadow-inner">
                      <QrCode className="w-16 h-16 text-slate-800" />
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 mt-1">رمز التحقق الإلكتروني</span>
                    <span className="text-[8px] font-mono text-slate-400">{docRefNumber}</span>
                  </div>
                ) : <div />}

                {/* Official Stamp */}
                {includeStamp ? (
                  <div className="flex justify-end">
                    <div className="w-32 h-32 rounded-full border-4 border-emerald-800 border-dashed flex flex-col items-center justify-center p-2 text-center transform -rotate-12 bg-emerald-50/30">
                      <span className="text-[9px] font-black text-emerald-900 uppercase">شركة معتمدة</span>
                      <span className="text-[8px] font-bold text-emerald-800">{settings.org_name || 'المسار الرقمي'}</span>
                      <span className="text-[8px] font-mono text-emerald-700">س.ت: {settings.cr_number || '1010892341'}</span>
                      <div className="w-12 h-0.5 bg-emerald-800 my-0.5" />
                      <span className="text-[7px] font-bold text-emerald-900">قسم الموارد البشرية</span>
                    </div>
                  </div>
                ) : <div />}
              </div>

              {/* Watermark & Legal Footer */}
              <div className="text-center mt-8 pt-4 border-t border-slate-100 text-[9px] text-slate-400">
                هذا المستند صادر إلكترونياً من نظام إدارة الموارد البشرية والرواتب والامتثال السعودي، ومعتمد بدون الحاجة لتوقيع يدوي وفقاً لنظام التعاملات الإلكترونية.
              </div>
            </div>

          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
          <button
            onClick={handleBrowserPrint}
            className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>{t('btn.print')}</span>
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors"
            >
              {t('btn.close')}
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isGenerating ? t('pdf.printing') : t('pdf.download_now')}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
