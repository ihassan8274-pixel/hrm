import { useState, useEffect } from 'react';
import {
  FileCheck2, Download, AlertTriangle, CheckCircle2,
  ShieldAlert, RefreshCw, Landmark, FileText,
  TrendingUp, DollarSign, Copy, Check, Info, Ban
} from 'lucide-react';
import type { WpsAuditResult } from '../types';

interface SifExportPayload {
  fileName: string;
  content: string;
  totalEmployees: number;
  totalAmount: number;
  currency: string;
  generatedAt: string;
  valueDate: string;
  cashExcluded: { employee_id: number; employee_name: string; amount: number }[];
  layout: string;
}

interface SifExportError {
  error: string;
  code?: string;
  missing?: string[];
  missing_count?: number;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function todayAsInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function WpsAuditSifView() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [valueDate, setValueDate] = useState(todayAsInputValue);
  const [auditReport, setAuditReport] = useState<WpsAuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [exportingSif, setExportingSif] = useState(false);
  const [exportError, setExportError] = useState<SifExportError | null>(null);
  const [sifPreview, setSifPreview] = useState<SifExportPayload | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAudit = async () => {
    setLoading(true);
    setAuditError(null);
    try {
      const res = await fetch(`/api/wps/audit?month=${selectedMonth}&year=${selectedYear}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAuditReport(null);
        setAuditError(body?.error || `تعذّر تحميل نتائج الفحص (${res.status})`);
        return;
      }
      setAuditReport(await res.json());
    } catch (err) {
      console.error('Error fetching WPS audit:', err);
      setAuditReport(null);
      setAuditError('تعذّر الاتصال بالخادم لتحميل نتائج الفحص');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [selectedMonth, selectedYear]);

  const handleDownloadSif = async () => {
    setExportingSif(true);
    setExportError(null);
    setSifPreview(null);
    try {
      const params = new URLSearchParams({
        month: String(selectedMonth),
        year: String(selectedYear),
        value_date: valueDate,
      });
      const res = await fetch(`/api/wps/export-sif?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setExportError({
          error: body?.error || `تعذّر توليد ملف البنك (${res.status})`,
          code: body?.code,
          missing: Array.isArray(body?.missing) ? body.missing : undefined,
          missing_count: typeof body?.missing_count === 'number' ? body.missing_count : undefined,
        });
        return;
      }
      const data: SifExportPayload = await res.json();
      setSifPreview(data);

      const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', data.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading SIF:', err);
      setExportError({ error: 'تعذّر الاتصال بالخادم لتوليد ملف البنك' });
    } finally {
      setExportingSif(false);
    }
  };

  const copyToClipboard = () => {
    if (!sifPreview) return;
    navigator.clipboard.writeText(sifPreview.content);
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

  const blockers = auditReport?.exportBlockers ?? [];
  const exportReady = auditReport?.exportReady === true;
  const hasRows = (auditReport?.totalEmployees ?? 0) > 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
            <FileCheck2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              محرك التدقيق الاستباقي لملف حماية الأجور (WPS)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              فحص مسير الرواتب، رصد مخالفات المادة 92 وفروقات أجور التأمينات، وتوليد ملف الحوالات البنكية بصيغة SCR/EDR.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <label htmlFor="wps-month" className="text-xs font-semibold text-slate-500 px-1">الشهر</label>
            <select
              id="wps-month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-slate-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>شهر {m}</option>
              ))}
            </select>
            <label htmlFor="wps-year" className="text-xs font-semibold text-slate-500 px-1">السنة</label>
            <select
              id="wps-year"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-slate-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <button
            onClick={fetchAudit}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="تحديث الفحص"
            aria-label="تحديث الفحص"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {auditError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold">{auditError}</p>
        </div>
      )}

      {/* Export panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Landmark className="w-5 h-5 text-brand-600" />
              توليد ملف الحوالات البنكية
            </h2>
            <p className="text-xs text-slate-500">
              الصيغة المستخدمة: <span className="font-mono">SCR/EDR</span> — قالب داخلي غير معتمد من البنك، تُراجع مواصفته لدى البنك قبل الرفع.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="wps-value-date" className="block text-xs font-semibold text-slate-600 mb-1">
                تاريخ القيمة (تاريخ صرف الحوالات) <span className="text-rose-500">*</span>
              </label>
              <input
                id="wps-value-date"
                type="date"
                value={valueDate}
                onChange={e => setValueDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={handleDownloadSif}
              disabled={exportingSif || !valueDate}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm shadow-brand-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exportingSif ? 'جارٍ التوليد...' : 'توليد ملف الحوالات'}
            </button>
          </div>
        </div>

        {blockers.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" role="status">
            <div className="flex items-start gap-3">
              <Ban className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h3 className="font-bold text-sm text-amber-900">لا يمكن توليد ملف البنك قبل معالجة النقاط التالية:</h3>
                <ul className="list-disc list-inside space-y-1 text-xs text-amber-900/90">
                  {blockers.map((blocker, idx) => (
                    <li key={idx}>{blocker}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {exportReady && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900">
              اكتملت متطلبات التوليد (بيانات المنشأة، كود بنك التسوية، ربط كود كل بنك، وبيانات هوية صالحة). مراجعة الملف قبل الرفع تبقى مسؤوليتك.
            </p>
          </div>
        )}

        {exportError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm font-bold">{exportError.error}</p>
                {exportError.code && (
                  <p className="text-xs font-mono">رمز الخطأ: {exportError.code}</p>
                )}
                {exportError.missing && exportError.missing.length > 0 && (
                  <p className="text-xs">الحقول الناقصة: <span className="font-mono">{exportError.missing.join('، ')}</span></p>
                )}
                {typeof exportError.missing_count === 'number' && (
                  <p className="text-xs">عدد السجلات المتأثرة: {exportError.missing_count}</p>
                )}
              </div>
            </div>
          </div>
        )}
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
              <DollarSign className="w-5 h-5 text-brand-500" />
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
              {auditReport.violationCount === 0 ? 'لا توجد ملاحظات في هذا المسير' : 'تتطلب تصحيحاً قبل صرف الحوالات'}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">تطابق أجر الاشتراك (GOSI)</span>
              <Landmark className="w-5 h-5 text-brand-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {auditReport.gosiReconciliation?.matched} / {auditReport.totalEmployees}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {auditReport.gosiReconciliation?.mismatched > 0 ? `${auditReport.gosiReconciliation?.mismatched} تباين في مسير التأمينات` : 'مطابقة تامة'}
            </div>
          </div>
        </div>
      )}

      {auditReport?.simulated && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <p className="text-sm text-sky-900">{auditReport.note}</p>
        </div>
      )}

      {/* Rules Banner */}
      <div className="bg-brand-50/70 border border-brand-200/80 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Landmark className="w-6 h-6 text-brand-700 shrink-0 mt-0.5" />
          <div className="space-y-1.5 text-sm text-brand-900">
            <h3 className="font-bold text-base text-brand-950">
              قواعد الفحص الآلي لملفات الحوالات وحماية الأجور (مدد - وزارة الموارد البشرية):
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs text-brand-800">
              <div className="p-2.5 bg-white/80 rounded-xl border border-brand-100">
                <span className="font-bold block mb-1">1. المادة 92 من نظام العمل:</span>
                حظر استقطاع أكثر من 50% من إجمالي أجر الموظف لأي سبب كان دون حكم قضائي نافذ.
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-brand-100">
                <span className="font-bold block mb-1">2. أجور التأمينات الاجتماعية (GOSI):</span>
                ضرورة تطابق الراتب الأساسي وبدل السكن في المسير مع الأجر المسجل في التأمينات.
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-brand-100">
                <span className="font-bold block mb-1">3. صحة بيانات التحويل:</span>
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
              {auditReport && auditReport.violations.length === 0 && hasRows && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-emerald-600">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <span className="font-bold text-base">لا توجد ملاحظات في مسير هذا الشهر.</span>
                  </td>
                </tr>
              )}
              {(!auditReport || !hasRows) && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    <span className="font-semibold">لا توجد بيانات في النطاق المحدد لهذا الشهر.</span>
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
              <FileText className="w-5 h-5 text-brand-400" />
              <span className="font-bold text-sm text-slate-200">معاينة محتوى الملف المولّد</span>
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'تم النسخ' : 'نسخ المحتوى'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-sans">
            <div className="bg-slate-800/60 rounded-xl p-2.5">
              <span className="block text-[11px] text-slate-400">عدد الحوالات</span>
              <span className="block text-sm font-bold text-slate-100">{sifPreview.totalEmployees}</span>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-2.5">
              <span className="block text-[11px] text-slate-400">إجمالي المبلغ</span>
              <span className="block text-sm font-bold text-slate-100">{sifPreview.totalAmount?.toLocaleString()} {sifPreview.currency}</span>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-2.5">
              <span className="block text-[11px] text-slate-400">تاريخ القيمة</span>
              <span className="block text-sm font-bold text-slate-100">{sifPreview.valueDate}</span>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-2.5">
              <span className="block text-[11px] text-slate-400">مستبعَدون (نقدًا)</span>
              <span className="block text-sm font-bold text-slate-100">{sifPreview.cashExcluded?.length || 0}</span>
            </div>
          </div>

          {sifPreview.cashExcluded && sifPreview.cashExcluded.length > 0 && (
            <div className="bg-amber-950/60 border border-amber-800/60 rounded-xl p-3 font-sans">
              <p className="text-xs font-bold text-amber-300 mb-1.5">موظفون لم تُدرج حوالاتهم (الراتب نقدي):</p>
              <ul className="text-[11px] text-amber-100 space-y-0.5">
                {sifPreview.cashExcluded.map((row) => (
                  <li key={row.employee_id}>{row.employee_name} — {row.amount?.toLocaleString()} ر.س</li>
                ))}
              </ul>
            </div>
          )}

          <p className="font-sans text-[11px] text-slate-400">{sifPreview.layout}</p>

          <pre className="overflow-x-auto whitespace-pre-wrap max-h-60 p-2 bg-slate-950 rounded-xl text-emerald-400">
            {sifPreview.content}
          </pre>
        </div>
      )}
    </div>
  );
}
