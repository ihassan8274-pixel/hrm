import { useState, useEffect } from 'react';
import { 
  FileCheck2, Download, AlertTriangle, CheckCircle2, 
  ShieldAlert, RefreshCw, Landmark, FileText, ArrowRight,
  TrendingUp, Users, DollarSign, Ban, Copy, Check
} from 'lucide-react';
import type { WpsAuditResult } from '../types';

export default function WpsAuditSifView() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [auditReport, setAuditReport] = useState<WpsAuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingSif, setExportingSif] = useState(false);
  const [sifPreview, setSifPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wps/audit?month=${selectedMonth}&year=${selectedYear}`);
      if (res.ok) {
        setAuditReport(await res.json());
      }
    } catch (err) {
      console.error('Error fetching WPS audit:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [selectedMonth, selectedYear]);

  const handleDownloadSif = async () => {
    setExportingSif(true);
    try {
      const res = await fetch(`/api/wps/export-sif?month=${selectedMonth}&year=${selectedYear}`);
      if (res.ok) {
        const data = await res.json();
        setSifPreview(data.content);

        // Trigger file download
        const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', data.fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Error downloading SIF:', err);
    } finally {
      setExportingSif(false);
    }
  };

  const copyToClipboard = () => {
    if (!sifPreview) return;
    navigator.clipboard.writeText(sifPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getViolationBadge = (type: string) => {
    switch (type) {
      case 'excessive_deduction':
        return <span className="bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-md font-bold">مخالفة م (92): استقطاع {'>'} 50%</span>;
      case 'gosi_salary_mismatch':
        return <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-md font-bold">فارق أجر التأمينات (GOSI)</span>;
      case 'invalid_iban':
        return <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-1 rounded-md font-bold">صيغة IBAN غير صالحة</span>;
      case 'zero_salary':
        return <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-1 rounded-md font-bold">صافي الراتب صفر أو سالب</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md font-bold">{type}</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileCheck2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              محرك التدقيق الاستباقي لملف حماية الأجور (WPS & SAMA SIF)
              <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 rounded-full">
                معيار البنك المركزي السعودي (SAMA)
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              فحص شامل لمسير الرواتب، رصد مخالفات المادة 92 وفروقات أجور التأمينات، وتوليد ملف صرف الرواتب المعتمد (.SIF).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-slate-700 px-2 py-1 focus:outline-none"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>شهر {m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-slate-700 px-2 py-1 focus:outline-none"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <button
            onClick={fetchAudit}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="تحديث الفحص"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleDownloadSif}
            disabled={exportingSif}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm shadow-blue-200 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exportingSif ? 'جارٍ التوليد...' : 'تصدير ملف .SIF للبنك'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {auditReport && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">نسبة الامتثال لنظام العمل</span>
              <TrendingUp className={`w-5 h-5 ${auditReport.complianceScore >= 90 ? 'text-emerald-500' : 'text-amber-500'}`} />
            </div>
            <div className={`text-3xl font-black ${auditReport.complianceScore >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
              %{auditReport.complianceScore}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {auditReport.compliantCount} موظف مطابق بالكامل من أصل {auditReport.totalEmployees}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">إجمالي الأجور المستحقة للمسير</span>
              <DollarSign className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {auditReport.totalDisbursed?.toLocaleString()} ر.س
            </div>
            <div className="text-xs text-slate-400 mt-1">صافي الحوالات البنكية المجدولة</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">الملاحظات والمخالفات المكتشفة</span>
              <AlertTriangle className={`w-5 h-5 ${auditReport.violationCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${auditReport.violationCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {auditReport.violationCount} حالة
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {auditReport.violationCount === 0 ? 'لا توجد ملاحظات تمنع الصرف' : 'تتطلب تصحيحاً قبل رفع الملف لمنصة مدد'}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">تطابق أجر الاشتراك (GOSI)</span>
              <Landmark className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {auditReport.gosiReconciliation?.matched} / {auditReport.totalEmployees}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {auditReport.gosiReconciliation?.mismatched > 0 ? `${auditReport.gosiReconciliation?.mismatched} تباين في مسير التأمينات` : 'مطابقة تامة 100%'}
            </div>
          </div>
        </div>
      )}

      {/* Rules Banner */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Landmark className="w-6 h-6 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-1.5 text-sm text-blue-900">
            <h3 className="font-bold text-base text-blue-950">
              قواعد الفحص الآلي لملفات SAMA SIF ونظام حماية الأجور (مدد - وزارة الموارد البشرية):
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs text-blue-800">
              <div className="p-2.5 bg-white/80 rounded-xl border border-blue-100">
                <span className="font-bold block mb-1">1. المادة 92 من نظام العمل:</span>
                حظر استقطاع أكثر من 50% من إجمالي أجر الموظف لأي سبب كان دون حكم قضائي نافذ.
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-blue-100">
                <span className="font-bold block mb-1">2. أجور التأمينات الاجتماعية (GOSI):</span>
                ضرورة تطابق الراتب الأساسي وبدل السكن في المسير مع الأجر المسجل في التأمينات.
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-blue-100">
                <span className="font-bold block mb-1">3. معيار الآيبان المعتمد (SAMA):</span>
                يجب أن يبدأ الآيبان بـ SA ويتكون من 24 خانة بدون مسافات أو رموز خاصة.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Violations and Audit Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-slate-700" />
            <h2 className="font-bold text-slate-800 text-base">
              سجل التدقيق الاستباقي وتفاصيل الملاحظات ({auditReport?.violations?.length || 0} ملاحظة)
            </h2>
          </div>
          {auditReport?.sifFileName && (
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
              الملف المستهدف: {auditReport.sifFileName}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5">رقم الهوية / الإقامة</th>
                <th className="p-3.5">نوع الملاحظة</th>
                <th className="p-3.5">الراتب الأساسي</th>
                <th className="p-3.5">صافي الصرف</th>
                <th className="p-3.5">نسبة الاستقطاع</th>
                <th className="p-3.5">تفاصيل الملاحظة والإجراء التصحيحي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditReport?.violations?.map((v, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 bg-rose-50/15">
                  <td className="p-3.5 font-bold text-slate-800">{v.employee_name}</td>
                  <td className="p-3.5 font-mono text-slate-600">{v.national_id_iqama}</td>
                  <td className="p-3.5">{getViolationBadge(v.violation_type)}</td>
                  <td className="p-3.5 text-slate-700">{v.basic_salary?.toLocaleString()} ر.س</td>
                  <td className="p-3.5 font-bold text-slate-800">{v.net_salary?.toLocaleString()} ر.س</td>
                  <td className="p-3.5">
                    <span className={`font-bold ${v.deduction_ratio > 50 ? 'text-red-600' : 'text-slate-700'}`}>
                      %{v.deduction_ratio}
                    </span>
                  </td>
                  <td className="p-3.5 text-xs text-slate-600 max-w-md">{v.details}</td>
                </tr>
              ))}
              {(!auditReport?.violations || auditReport.violations.length === 0) && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-emerald-600">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <span className="font-bold text-base">تهانينا! مسير هذا الشهر متوافق 100% مع معايير حماية الأجور والبنك المركزي.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIF File Content Preview */}
      {sifPreview && (
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 space-y-3 font-mono text-xs shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3 font-sans">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="font-bold text-sm text-slate-200">معاينة محتوى ملف SAMA SIF الجاهز للرفع للبنك</span>
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'تم النسخ' : 'نسخ المحتوى'}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap max-h-60 p-2 bg-slate-950 rounded-xl text-emerald-400">
            {sifPreview}
          </pre>
        </div>
      )}
    </div>
  );
}
