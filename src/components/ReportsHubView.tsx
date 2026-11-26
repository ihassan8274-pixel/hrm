import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bot, Download, FileText, Loader2, RefreshCw, Send, SlidersHorizontal, Sparkles,
} from 'lucide-react';

/**
 * Reports Hub — catalog, allowlisted custom builder and the AI assistant.
 *
 * The server owns every identifier and every file: this screen only picks
 * from the metadata returned by /api/reports-hub/catalog. No SQL, no table
 * name and no file path is ever constructed here.
 */

type CatalogEntry = {
  key: string;
  titleAr: string;
  descriptionAr: string;
  group: string;
  endpoint: string;
  csvEndpoint?: string;
};
type Field = { key: string; labelAr: string; type: 'text' | 'number' | 'date'; op?: string; enumValues?: string[] };
type Dataset = {
  key: string;
  labelAr: string;
  descriptionAr: string;
  fields: Field[];
  filters: Field[];
  defaultFields: string[];
};
type SystemModule = { navId: string; titleAr: string; sectionAr: string; descriptionAr?: string; roles: string[] };
type Schema = { catalog: CatalogEntry[]; datasets: Dataset[]; system?: SystemModule[] };
type CustomReport = {
  dataset: string;
  columns: Array<{ key: string; labelAr: string; type: string }>;
  rows: unknown[][];
  returned: number;
  truncated: boolean;
  generated_at: string;
};
type AiReply = {
  answer: string;
  suggested_reports: CatalogEntry[];
  related_screens: SystemModule[];
  aggregates: Record<string, unknown>;
  mode: 'gemini' | 'local';
  generated_at: string;
};
type Message = { role: 'user' | 'assistant'; text: string; reply?: AiReply };

type Tab = 'catalog' | 'builder' | 'ai';

const QUICK = [
  'كم عدد الموظفين في نطاقي؟',
  'أعطني تقريرًا نصيًا عن الرواتب والإضافي المعتمد',
  'ما التقارير المتاحة للامتثال السعودي؟',
  'كيف أستخرج ملف CSV للموظفين؟',
];

const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
};

const apiError = async (r: Response) => {
  const d = await r.json().catch(() => null);
  return d?.error || `تعذر إكمال الطلب (${r.status})`;
};

export default function ReportsHubView() {
  const [tab, setTab] = useState<Tab>('catalog');
  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');

  const [datasetKey, setDatasetKey] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [filters, setFilters] = useState<Array<{ key: string; value: string }>>([]);
  const [limit, setLimit] = useState('200');
  const [preview, setPreview] = useState<CustomReport | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/reports-hub/catalog');
        if (!r.ok) throw new Error(await apiError(r));
        const d = (await r.json()) as Schema;
        if (!alive) return;
        setSchema(d);
        const first = d.datasets[0];
        if (first) {
          setDatasetKey(first.key);
          setFields(first.defaultFields);
        }
      } catch (e: any) {
        if (alive) setSchemaError(e?.message || 'تعذر تحميل دليل التقارير');
      }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const dataset = schema?.datasets.find((d) => d.key === datasetKey) ?? null;

  const spec = useMemo(() => ({
    dataset: datasetKey,
    fields,
    filters: filters.filter((f) => f.value.trim()).map((f) => ({ key: f.key, value: f.value.trim() })),
    limit: Number(limit),
  }), [datasetKey, fields, filters, limit]);

  const csvHref = '/api/reports-hub/custom/csv?spec=' + encodeURIComponent(JSON.stringify(spec));

  const catalog = (schema?.catalog ?? []).filter((entry) => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return true;
    return [entry.titleAr, entry.descriptionAr, entry.key, entry.group].join(' ').toLowerCase().includes(q);
  });

  const chooseDataset = (key: string) => {
    const next = schema?.datasets.find((d) => d.key === key);
    setDatasetKey(key);
    setFields(next?.defaultFields ?? []);
    setFilters([]);
    setPreview(null);
    setPreviewError(null);
  };

  const toggleField = (key: string) => {
    setFields((current) => current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key]);
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const r = await fetch('/api/reports-hub/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (!r.ok) throw new Error(await apiError(r));
      setPreview((await r.json()) as CustomReport);
    } catch (e: any) {
      setPreview(null);
      setPreviewError(e?.message || 'تعذر إنشاء التقرير');
    } finally {
      setPreviewing(false);
    }
  };

  const ask = async (text: string) => {
    const value = text.trim();
    if (!value || asking) return;
    setMessages((current) => [...current, { role: 'user', text: value }]);
    setQuestion('');
    setAsking(true);
    setAiError(null);
    try {
      const r = await fetch('/api/reports-hub/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: value }),
      });
      if (!r.ok) throw new Error(await apiError(r));
      const reply = (await r.json()) as AiReply;
      setMessages((current) => [...current, { role: 'assistant', text: reply.answer, reply }]);
    } catch (e: any) {
      const message = e?.message || 'تعذر الحصول على الإجابة';
      setAiError(message);
      setMessages((current) => [...current, { role: 'assistant', text: message }]);
    } finally {
      setAsking(false);
    }
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
    { id: 'catalog', label: 'دليل التقارير', icon: FileText },
    { id: 'builder', label: 'باني التقارير', icon: SlidersHorizontal },
    { id: 'ai', label: 'المساعد الذكي', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand-600" /> مركز التقارير والمساعد الذكي
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            تقارير معتمدة داخل نطاقك فقط — المساعد يجيب من قيم مجمّعة ومخطط الحقول، ولا يرى أسماء أو رواتب فردية.
          </p>
        </div>
      </div>

      {schemaError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
          {schemaError}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                tab === t.id
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-brand-600'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'catalog' && (
        <div className="space-y-4">
          <input
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            placeholder="ابحث عن تقرير بالاسم أو الوصف..."
            className="w-full md:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {catalog.map((entry) => (
              <div key={entry.key} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{entry.titleAr}</h3>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-brand-600/10 text-brand-600 dark:text-brand-night font-bold">
                    {entry.group === 'operational' ? 'تشغيلي' : entry.group === 'salary' ? 'رواتب' : 'مجمّع'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{entry.descriptionAr}</p>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <code className="text-[11px] text-slate-400 dark:text-slate-500 truncate" dir="ltr">{entry.endpoint}</code>
                  {entry.csvEndpoint && (
                    <a
                      href={entry.csvEndpoint}
                      download
                      className="flex items-center gap-1.5 shrink-0 text-xs font-bold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!schema && !schemaError && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل دليل التقارير...
            </div>
          )}
          {schema && catalog.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">لا توجد تقارير مطابقة للبحث.</p>
          )}
        </div>
      )}

      {tab === 'builder' && (
        <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">مجموعة البيانات</label>
              <select
                value={datasetKey}
                onChange={(e) => chooseDataset(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
              >
                {(schema?.datasets ?? []).map((d) => <option key={d.key} value={d.key}>{d.labelAr}</option>)}
              </select>
              {dataset && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{dataset.descriptionAr}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">الحقول (حتى 12)</label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pl-1">
                {(dataset?.fields ?? []).map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fields.includes(f.key)}
                      onChange={() => toggleField(f.key)}
                      className="accent-brand-600"
                    />
                    {f.labelAr}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">المرشحات (حتى 6)</label>
              <div className="space-y-2">
                {(dataset?.filters ?? []).map((f) => {
                  const current = filters.find((x) => x.key === f.key);
                  return (
                    <div key={f.key} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">{f.labelAr}</span>
                      {f.enumValues ? (
                        <select
                          value={current?.value ?? ''}
                          onChange={(e) => setFilters((all) => [
                            ...all.filter((x) => x.key !== f.key),
                            { key: f.key, value: e.target.value },
                          ])}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs"
                        >
                          <option value="">بدون</option>
                          {f.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                          value={current?.value ?? ''}
                          onChange={(e) => setFilters((all) => [
                            ...all.filter((x) => x.key !== f.key),
                            { key: f.key, value: e.target.value },
                          ])}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">أقصى عدد صفوف (1–1000)</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => void runPreview()}
                disabled={previewing || fields.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
              >
                {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} معاينة
              </button>
              <a
                href={csvHref}
                download
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                <Download className="w-4 h-4" /> تنزيل CSV
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 min-h-64">
            {previewError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{previewError}</div>
            )}
            {!preview && !previewError && (
              <p className="text-sm text-slate-500 dark:text-slate-400">اختر الحقول والمرشحات ثم اضغط «معاينة». الملف يُولَّد من مولّد التقارير المعتمد على الخادم.</p>
            )}
            {preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{preview.returned} صفوف {preview.truncated && '(مقتطع عند الحد)'}</span>
                  <span>{new Date(preview.generated_at).toLocaleString('ar-SA')}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300">
                        {preview.columns.map((c) => <th key={c.key} className="text-right px-3 py-2 border-b border-slate-200 dark:border-slate-700">{c.labelAr}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i} className="text-slate-700 dark:text-slate-200">
                          {row.map((cell, j) => <td key={j} className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60">{fmt(cell)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">لا توجد بيانات مطابقة في نطاقك.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => void ask(q)}
                disabled={asking}
                className="text-xs font-bold px-3 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:border-brand-600 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4 min-h-72">
            {messages.length === 0 && (
              <div className="flex items-start gap-3 text-slate-500 dark:text-slate-400">
                <Bot className="w-5 h-5 text-brand-600 shrink-0" />
                <p className="text-sm">اسأل عن أي شاشة أو تقرير في النظام. يمكنك طلب تقرير غير موجود في الدليل كنص، وسيخبرك بأقرب مولّد معتمد لإخراج ملف رسمي.</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  message.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                }`}>
                  {message.text}
                  {message.reply && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-full bg-brand-600/10 text-brand-600 dark:text-brand-night font-bold">
                          {message.reply.mode === 'gemini' ? 'إجابة الذكاء الاصطناعي' : 'ملخص محلي مجمّع'}
                        </span>
                        <span className="px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          الموظفون: {fmt((message.reply.aggregates as any)?.employees?.total)}
                        </span>
                        <span className="px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          سجلات الرواتب: {fmt((message.reply.aggregates as any)?.payroll?.records)}
                        </span>
                      </div>
                      {message.reply.suggested_reports.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {message.reply.suggested_reports.map((entry) => (
                            <button
                              key={entry.key}
                              onClick={() => { setCatalogQuery(entry.titleAr); setTab('catalog'); }}
                              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-brand-600/40 text-brand-600 dark:text-brand-night hover:bg-brand-600/10"
                            >
                              {entry.titleAr}
                            </button>
                          ))}
                        </div>
                      )}
                      {(message.reply.related_screens ?? []).length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">شاشات ذات صلة:</span>
                          {message.reply.related_screens.map((screen) => (
                            <span
                              key={screen.navId}
                              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                              title={screen.sectionAr + ' — ' + screen.roles.join(' / ')}
                            >
                              {screen.titleAr}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التفكير...
              </div>
            )}
          </div>

          {aiError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{aiError}</div>
          )}

          <form onSubmit={submitQuestion} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="اكتب سؤالك عن النظام أو اطلب تقريرًا..."
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> إرسال
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
