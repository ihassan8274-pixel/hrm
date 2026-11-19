import { useState, useEffect, FormEvent } from 'react';
import { 
  Sparkles, FileText, Printer, Copy, Check, 
  Send, User, AlertCircle, RefreshCw, Bookmark, Download, ShieldCheck
} from 'lucide-react';
import type { GeneratedHrLetter, Employee } from '../types';
import { Letterhead } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

export default function AiHrLetterStudioView() {
  const [letters, setLetters] = useState<GeneratedHrLetter[]>([]);
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [letterType, setLetterType] = useState('salary_certificate');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [generatedResult, setGeneratedResult] = useState<GeneratedHrLetter | null>(null);

  useEffect(() => {
    fetch('/api/employees')
      .then(r => r.json())
      .then(data => {
        setEmployees(data);
        if (data.length > 0) {
          setSelectedEmployeeId(String(data[0].id));
        }
      })
      .catch(console.error);

    fetch('/api/ai/hr-letters')
      .then(r => r.json())
      .then(data => setLetters(data))
      .catch(console.error);
  }, []);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    try {
      setLoading(true);
      const res = await fetch('/api/ai/hr-letter-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letter_type: letterType,
          employee_id: Number(selectedEmployeeId),
          custom_notes: customInstructions
        })
      });
      const data = await res.json();
      setGeneratedResult(data);
      // Refresh previous letters list
      fetch('/api/ai/hr-letters').then(r => r.json()).then(l => setLetters(l));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (generatedResult?.content) {
      navigator.clipboard.writeText(generatedResult.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const letterTemplates = [
    { id: 'salary_certificate', name: 'شهادة تعريف بالراتب موثقة', category: 'خطابات رسمية' },
    { id: 'experience_certificate', name: 'شهادة خدمة وخبرة (المادة 64)', category: 'نهاية الخدمة' },
    { id: 'art75_notice', name: 'إشعار عدم رغبة في تجديد العقد (المادة 75)', category: 'عقود' },
    { id: 'art77_termination', name: 'قرار إنهاء خدمة لسبب مشروع (المادة 77)', category: 'قرارات إدارية' },
    { id: 'art80_termination', name: 'قرار فسخ العقد لمخالفة جسيمة (المادة 80)', category: 'تأديبي' },
    { id: 'promotion_decision', name: 'قرار ترقية وتعديل مسمى وراتب', category: 'قرارات إدارية' },
    { id: 'warning_letter', name: 'خطاب إنذار تأديبي رسمي (المادة 66)', category: 'تأديبي' },
    { id: 'delegation_order', name: 'قرار تكليف وندب مؤقت بمهام إشرافية', category: 'إداري' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-700 rounded-xl border border-purple-100">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">استوديو الخطابات الإدارية والقرارات الذكية (AI Letter Studio)</h2>
            <p className="text-sm text-slate-500">صياغة فورية للخطابات الرسمية والقرارات الإدارية المتوافقة حرفياً مع نظام العمل السعودي واللوائح التنفيذية</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Input Setup & AI Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration & Templates */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-purple-600" />
              1. إعداد الخطاب والنموذج
            </h3>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المعني *</label>
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} - {e.position || 'موظف'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الخطاب أو القرار *</label>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {letterTemplates.map(t => (
                    <label
                      key={t.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                        letterType === t.id
                          ? 'border-purple-600 bg-purple-50/70 text-purple-900 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="letterType"
                          value={t.id}
                          checked={letterType === t.id}
                          onChange={(e) => setLetterType(e.target.value)}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span>{t.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">{t.category}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">توجيهات أو بنود إضافية (اختياري)</label>
                <textarea
                  rows={2}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="مثال: إضافة موعد التسليم، أو توجيه الخطاب للسفارة أو البنك..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    جاري الصياغة القانونية الذكية...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    توليد الخطاب بالذكاء الاصطناعي
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Recent Letters Archive */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-700">الخطابات الصادرة مؤخراً</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
              {letters.slice(0, 5).map(l => (
                <div
                  key={l.id}
                  onClick={() => setGeneratedResult(l)}
                  className="p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-800 line-clamp-1">{l.title}</p>
                    <span className="text-[10px] text-slate-400 font-mono">{l.created_at}</span>
                  </div>
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Formal Document Viewer & Print Canvas */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  {generatedResult ? generatedResult.title : 'معاينة الخطاب الرسمي المعتمد'}
                </h3>
              </div>

              {generatedResult && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'تم النسخ' : 'نسخ النص'}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    طباعة الخطاب
                  </button>
                </div>
              )}
            </div>

            {/* Document Canvas */}
            {generatedResult ? (
              <div className="print-document border-2 border-slate-800 rounded-xl p-8 space-y-6 text-slate-900 bg-white shadow-sm font-sans leading-relaxed text-sm">
                {/* Official Letterhead — ترويسة موحّدة مع بقية مخرجات النظام */}
                <Letterhead company={company} />

                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="text-right">
                    <h3 className="font-bold text-slate-800">{generatedResult.title}</h3>
                  </div>
                  <div className="text-left font-mono text-xs text-slate-600">
                    <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
                    <p>الرقم الإشاري: HR-DOC-{generatedResult.id || 'AUTO'}</p>
                  </div>
                </div>

                {/* Body Text */}
                <div className="whitespace-pre-line text-justify text-slate-800 space-y-4 min-h-[300px] leading-8">
                  {generatedResult.content}
                </div>

                {/* Signatures & Seal */}
                <div className="pt-10 grid grid-cols-2 text-center text-xs border-t border-slate-300">
                  <div>
                    <p className="font-bold text-slate-900">مدير عام الموارد البشرية</p>
                    <p className="mt-8 font-serif font-bold text-purple-950">عبدالرحمن العتيبي</p>
                    <span className="text-[10px] text-slate-400">توقيع معتمد</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">الختم الرسمي للمنشأة</p>
                    <div className="mt-4 inline-flex items-center justify-center w-20 h-20 rounded-full border-2 border-dashed border-purple-400 text-purple-800 text-[10px] font-bold rotate-[-12deg]">
                      ختم معتمد ✓
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <Sparkles className="w-12 h-12 text-purple-300 mx-auto animate-pulse" />
                <p className="font-medium text-slate-600">اختر نوع الخطاب والموظف واضغط "توليد الخطاب بالذكاء الاصطناعي"</p>
                <p className="text-xs text-slate-400">يقوم المحرك بصياغة لغة قانونية عربية رسمية رصينة ومطابقة لكافة مواد نظام العمل</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
