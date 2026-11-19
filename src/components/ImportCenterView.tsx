import { useState, useEffect, useRef } from 'react';
import {
  UploadCloud, FileSpreadsheet, Download, CheckCircle2, XCircle,
  Stethoscope, HeartPulse, Car, Landmark, CalendarDays, Star,
  Briefcase, Award, AlertTriangle, Loader2, Database
} from 'lucide-react';

type ImportColumn = {
  key: string; label: string; type: string; required: boolean; options?: string[];
};
type ImportModule = {
  key: string; label: string; description: string; count: number; columns: ImportColumn[];
};
type PreviewRow = {
  row: number; data: Record<string, any>; display: Record<string, string>;
  ok: boolean; errors: Array<{ field: string; message: string }>;
};
type PreviewResult = {
  module: string; total: number; valid: number; invalid: number;
  matched_headers: string[]; unmapped_headers: string[];
  columns: ImportColumn[]; rows: PreviewRow[];
};
type CommitResult = { inserted: number; rejected: Array<{ row: number; errors: any[] }> };

const MODULE_ICONS: Record<string, any> = {
  health_certificates: Stethoscope,
  medical_policies: HeartPulse,
  fleet_vehicles: Car,
  loans: Landmark,
  leaves: CalendarDays,
  appraisals: Star,
  recruitment_jobs: Briefcase,
  kudos: Award,
};

export default function ImportCenterView() {
  const [modules, setModules] = useState<ImportModule[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState<'upload' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mod = modules.find(m => m.key === selected) || null;

  const loadModules = async () => {
    try {
      const res = await fetch('/api/import/modules', { credentials: 'include' });
      if (res.ok) setModules(await res.json());
    } catch { /* logged by caller screens if needed */ }
  };

  useEffect(() => { loadModules(); }, []);

  const selectModule = (key: string) => {
    setSelected(key);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const downloadTemplate = () => {
    if (!mod) return;
    window.open(`/api/import/template/${mod.key}`, '_blank');
  };

  const handleFile = async (file: File) => {
    if (!mod) return;
    setBusy('upload');
    setError(null);
    setResult(null);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
        reader.readAsDataURL(file);
      });
      const content_base64 = dataUrl.split(',')[1] || '';
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ module: mod.key, filename: file.name, content_base64 })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.hint ? `${json.error} — ${json.hint}` : json.error || 'فشل التحليل');
        setPreview(null);
      } else {
        setPreview(json);
        setShowErrorsOnly(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commit = async () => {
    if (!mod || !preview || preview.valid === 0) return;
    if (!confirm(`سيتم إضافة ${preview.valid} صف إلى «${mod.label}». هل تريد المتابعة؟`)) return;
    setBusy('commit');
    setError(null);
    try {
      const okRows = preview.rows.filter(r => r.ok);
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          module: mod.key,
          rows: okRows.map(r => r.data),
          raw_values: okRows.map(r => r.display)
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'فشل الاستيراد');
      } else {
        setResult(json);
        setPreview(null);
        loadModules();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const visibleRows = preview ? (showErrorsOnly ? preview.rows.filter(r => !r.ok) : preview.rows) : [];
  const tableColumns = preview?.columns || [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              مركز الاستيراد الموحد
              <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2.5 py-0.5 rounded-full">
                Excel / CSV بمعاينة قبل التنفيذ
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              حمّل قالب أي وحدة، املأه من ملفك، ثم ارفعه لمعاينة الصفوف والأخطاء قبل الإضافة النهائية. لا يُكتب شيء في النظام قبل تأكيدك.
            </p>
          </div>
        </div>
      </div>

      {/* Module picker */}
      <div>
        <h2 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-500" />
          اختر الوحدة المطلوب استيراد بياناتها
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modules.map(m => {
            const Icon = MODULE_ICONS[m.key] || FileSpreadsheet;
            const active = m.key === selected;
            return (
              <button
                key={m.key}
                onClick={() => selectModule(m.key)}
                className={`text-right p-4 rounded-2xl border transition-all ${active
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Icon className={`w-5 h-5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.count === 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {m.count} صف
                  </span>
                </div>
                <div className="font-bold text-slate-800 text-sm">{m.label}</div>
                <div className="text-xs text-slate-500 mt-1 leading-5 line-clamp-2">{m.description}</div>
              </button>
            );
          })}
          {modules.length === 0 && (
            <div className="col-span-full p-6 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-5 h-5 animate-spin inline-block ml-2" />
              جارٍ تحميل الوحدات...
            </div>
          )}
        </div>
      </div>

      {/* Selected module workflow */}
      {mod && (
        <div className="space-y-4">
          {/* Step 1: template + upload */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800">
                  الخطوة 1 — القالب والملف: <span className="text-indigo-600">{mod.label}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  الأعمدة المطلوبة: {mod.columns.filter(c => c.required).map(c => c.label).join('، ') || '—'} • بقية الأعمدة اختيارية
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"
                >
                  <Download className="w-4 h-4" />
                  تحميل قالب CSV
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === 'upload'}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
                >
                  {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  رفع ملف Excel / CSV
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold text-slate-600">كل أعمدة القالب ({mod.columns.length})</summary>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 mt-2">
                  {mod.columns.map(c => (
                    <div key={c.key} className="flex items-center gap-1">
                      <span className={`font-semibold ${c.required ? 'text-rose-600' : 'text-slate-600'}`}>{c.label}</span>
                      {c.required && <span className="text-rose-500">*</span>}
                      {c.options && <span className="text-slate-400">({c.options.join('/')})</span>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="w-5 h-5" />
                تم الاستيراد بنجاح: {result.inserted} صف أُضيف إلى «{mod.label}»
              </div>
              {result.rejected.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  <div className="font-bold flex items-center gap-1"><XCircle className="w-4 h-4" /> صفوف رُفضت أثناء الفحص النهائي:</div>
                  {result.rejected.map(r => (
                    <div key={r.row}>صف {r.row}: {r.errors.map(e => `${e.field} — ${e.message}`).join('؛ ')}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: preview */}
          {preview && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">الخطوة 2 — معاينة قبل التنفيذ</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-lg">{preview.valid} صف جاهز</span>
                    {preview.invalid > 0 && (
                      <span className="bg-red-50 text-red-700 font-bold px-2.5 py-1 rounded-lg">{preview.invalid} صف به أخطاء</span>
                    )}
                    <span className="text-slate-400">{preview.total} صف في الملف</span>
                  </div>
                  {(preview.unmapped_headers.length > 0 || preview.matched_headers.length > 0) && (
                    <div className="text-xs text-slate-400 mt-1.5">
                      أعمدة تم التعرف عليها: {preview.matched_headers.join('، ') || '—'}
                      {preview.unmapped_headers.length > 0 && <> • أعمدة متجاهَلة: {preview.unmapped_headers.join('، ')}</>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {preview.invalid > 0 && (
                    <button
                      onClick={() => setShowErrorsOnly(!showErrorsOnly)}
                      className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-2 rounded-lg font-semibold transition-all"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {showErrorsOnly ? 'عرض كل الصفوف' : 'الأخطاء فقط'}
                    </button>
                  )}
                  <button
                    onClick={commit}
                    disabled={preview.valid === 0 || busy === 'commit'}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm"
                  >
                    {busy === 'commit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    تنفيذ الاستيراد ({preview.valid})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-12">#</th>
                      {tableColumns.map(c => (
                        <th key={c.key} className="p-3 whitespace-nowrap">
                          {c.label}{c.required && <span className="text-rose-500"> *</span>}
                        </th>
                      ))}
                      <th className="p-3 w-24">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map(r => (
                      <tr key={r.row} className={r.ok ? 'hover:bg-slate-50/60' : 'bg-red-50/50 hover:bg-red-50'}>
                        <td className="p-3 text-slate-400 text-xs">{r.row}</td>
                        {tableColumns.map(c => (
                          <td key={c.key} className="p-3 max-w-[220px] truncate" title={r.display[c.key] || ''}>
                            {r.display[c.key] || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="p-3">
                          {r.ok ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold"><CheckCircle2 className="w-4 h-4" /> جاهز</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-bold" title={r.errors.map(e => `${e.field}: ${e.message}`).join('\n')}>
                              <XCircle className="w-4 h-4" /> خطأ
                            </span>
                          )}
                          {!r.ok && (
                            <div className="text-[11px] text-red-500 mt-0.5 max-w-[260px]">
                              {r.errors.map(e => e.message).join('؛ ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr><td colSpan={tableColumns.length + 2} className="p-8 text-center text-slate-400">لا توجد صفوف للعرض</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!mod && modules.length > 0 && (
        <div className="bg-indigo-50/60 border border-indigo-100 p-5 rounded-2xl text-sm text-indigo-800">
          اختر وحدة من الأعلى للبدء. القوالب جاهزة بأسماء الأعمدة العربية — افتحها في Excel، الصق بياناتك، ثم ارفع الملف بعد الحفظ.
        </div>
      )}
    </div>
  );
}
