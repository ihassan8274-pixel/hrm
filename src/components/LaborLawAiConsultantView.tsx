import { useState } from 'react';
import { 
  Scale, Sparkles, Send, BookOpen, ShieldAlert, CheckCircle2, 
  HelpCircle, Copy, Check, RefreshCw, FileText, ChevronLeft
} from 'lucide-react';

export default function LaborLawAiConsultantView() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: `مرحباً بك في **المستشار القانوني الذكي لنظام العمل السعودي**.
أنا هنا لمساعدتك في تقديم استشارات دقيقة وموثقة نظامياً وفقاً لـ:
- مواد نظام العمل الصادر بالمرسوم الملكي (م/51) وتعديلاته
- اللائحة التنفيذية لوزارة الموارد البشرية والتنمية الاجتماعية
- قرارات التوطين ومنصة **قوى** ولوائح نظام حماية الأجور منصة **مدد**
- قواعد التأمينات الاجتماعية (GOSI)

يمكنك كتابة أي استفسار أو النقر على أحد المواضيع الجاهزة أدناه:`,
      time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const quickPrompts = [
    { title: 'مكافأة نهاية الخدمة (المادتان 84 و 85)', prompt: 'كيف يتم احتساب مكافأة نهاية الخدمة في حال الاستقالة مقابل إنهاء العقد من صاحب العمل وفق المادتين 84 و 85؟ وما هو الأجر المعتمد؟' },
    { title: 'التعويض عن الفصل التعسفي (المادة 77)', prompt: 'ما هي ضوابط وتفاصيل التعويض المالي بموجب المادة (77) في العقود محددة المدة وغير محددة المدة؟ وما هو الحد الأدنى للتعويض؟' },
    { title: 'فسخ العقد بدون مكافأة (المادة 80)', prompt: 'ما هي الحالات الـ 9 الحصرية التي تجيز لصاحب العمل فصل العامل دون مكافأة أو إشعار وفق المادة (80) مع شروط الإنذار؟' },
    { title: 'ضوابط فترة التجربة (المادة 53)', prompt: 'ما هي أقصى مدة لفترة التجربة وفق المادة (53)؟ وكيف يتم تمديدها نظاماً؟ وهل تدخل الإجازات المرضية فيها؟' },
    { title: 'رصيد الإجازات السنوية (المادة 109)', prompt: 'كم يبلغ رصيد الإجازة السنوية للموظف في أول 5 سنوات وما بعدها وفق المادة 109؟ ومتى يستحق تعويضاً نقدياً عنها؟' },
    { title: 'ساعات العمل والإضافي (المادتان 98 و 107)', prompt: 'كيف تحسب ساعات العمل الإضافية وفق المادة 107 في الأيام العادية وأيام العطل والأعياد؟ وما هي ساعات العمل في رمضان؟' },
  ];

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || question;
    if (!textToSend.trim() || loading) return;

    const userMsg = {
      sender: 'user' as const,
      text: textToSend,
      time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/labor-law-consultant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: textToSend })
      });
      const data = await res.json();

      const aiMsg = {
        sender: 'ai' as const,
        text: data.answer || 'حدث خطأ في معالجة الاستشارة، يرجى المحاولة مرة أخرى.',
        time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error("AI error:", err);
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai' as const,
          text: 'تعذر الاتصال بخدمة المستشار القانوني، يرجى التحقق من اتصال الشبكة.',
          time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-emerald-950 via-slate-900 to-slate-950 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-emerald-900/50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Scale className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">المستشار القانوني لنظام العمل السعودي</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> مدعوم بالذكاء الاصطناعي (Gemini 2.5)
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              إجابات قانونية موثقة بمواد النظام، حساب التعويضات، صياغة الإشعارات، وحماية المنشأة من النزاعات العمالية
            </p>
          </div>
        </div>
      </div>

      {/* Quick Prompts Grid */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
        <span className="text-xs font-bold text-slate-400 block">استشارات ونصوص نظامية شائعة:</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp.prompt)}
              className="p-3 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-2xl text-right transition-all group"
            >
              <p className="text-xs font-black text-slate-800 group-hover:text-emerald-900 flex items-center justify-between">
                <span>{qp.title}</span>
                <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transform group-hover:-translate-x-0.5 transition-transform" />
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Conversation Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '480px' }}>
        <div className="p-6 flex-1 overflow-y-auto space-y-6 max-h-[550px] custom-scrollbar">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-md shadow-emerald-600/20">
                  <Scale className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-2xl rounded-2xl p-5 text-xs leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white font-medium shadow-md shadow-emerald-600/10'
                  : 'bg-slate-50 text-slate-800 border border-slate-200 space-y-3 font-normal'
              }`}>
                <div className="whitespace-pre-line">
                  {m.text}
                </div>

                <div className={`flex justify-between items-center pt-2 text-[10px] ${
                  m.sender === 'user' ? 'text-emerald-200' : 'text-slate-400 border-t border-slate-200/60'
                }`}>
                  <span>{m.time}</span>
                  {m.sender === 'ai' && (
                    <button
                      onClick={() => copyToClipboard(m.text, idx)}
                      className="hover:text-slate-700 flex items-center gap-1 font-bold transition-colors"
                    >
                      {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {copiedIndex === idx ? 'تم النسخ' : 'نسخ الاستشارة'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Scale className="w-4 h-4" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold text-slate-600 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                جارِ مراجعة نصوص ومواد نظام العمل السعودي وصياغة الاستشارة...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="اكتب استفسارك القانوني (مثال: هل تحسب البدلات في مكافأة نهاية الخدمة؟ وما شروط الإنهاء وفق المادة 77؟)..."
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-2xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all shrink-0"
            >
              <span>إرسال</span>
              <Send className="w-4 h-4 rtl:rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
