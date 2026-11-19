import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, Sparkles, X, FileText, CheckCircle2, 
  HelpCircle, UserCheck, ShieldCheck, Download, 
  Printer, ArrowRight, MessageSquare, ChevronRight
} from 'lucide-react';
import type { CopilotMessage, SalaryCertificateData } from '../types';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

interface AiHrCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

export default function AiHrCopilotModal({ isOpen, onClose, onNavigate }: AiHrCopilotModalProps) {
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `مرحباً بك! أنا **المساعد الذكي للموارد البشرية والأنظمة السعودية (AI HR Copilot)**. 🇸🇦✨
يمكنني مساعدتك في:
- 📜 **إصدار شهادات تعريف بالراتب** معتمدة فورية.
- ⚖️ **استشارات نظام العمل السعودي** (مكافأة نهاية الخدمة، الإجازات، فترات التجربة).
- 📊 **تحليل مؤشرات التوطين (نطاقات)** وسجل الإقامات والتأشيرات.
- ⚡ **توجيهك المباشر** لأي قسم أو تقرير في النظام.

كيف يمكنني خدمتك اليوم؟`,
      timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      suggestedActions: [
        { label: '📄 إصدار شهادة راتب رسمية', actionType: 'query', payload: 'أريد إصدار شهادة تعريف بالراتب' },
        { label: '🇸🇦 ما هي نسبة السعودة الحالية؟', actionType: 'query', payload: 'ما هي نسبة السعودة الحالية في المنشأة؟' },
        { label: '🛡️ حساب مكافأة نهاية الخدمة', actionType: 'query', payload: 'كيف تُحسب مكافأة نهاية الخدمة نظاماً؟' },
        { label: '📅 الإقامات المنتهية قريباً', actionType: 'query', payload: 'كم عدد الإقامات التي ستنتهي قريباً؟' }
      ]
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCert, setSelectedCert] = useState<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: CopilotMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query })
      });
      const data = await res.json();

      const assistantMsg: CopilotMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'تمت معالجة الطلب بنجاح.',
        timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: data.suggestedActions,
        quickCard: data.quickCard
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'عذراً، حدث خطأ أثناء الاتصال بالمساعد الذكي. يرجى المحاولة مرة أخرى.',
          timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (action: any) => {
    if (action.actionType === 'navigate' && onNavigate) {
      onNavigate(action.payload);
      onClose();
    } else if (action.actionType === 'query') {
      handleSendMessage(action.payload);
    }
  };

  const handlePrintCert = () => {
    window.print();
  };

  return (
    <div id="ai-copilot-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl h-[650px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
              <Bot className="w-6 h-6 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">المساعد الذكي للموارد البشرية (AI HR Copilot)</h3>
                <span className="bg-emerald-500/30 text-emerald-100 text-xs px-2 py-0.5 rounded-full border border-emerald-400/30">
                  متوافق مع نظام العمل 🇸🇦
                </span>
              </div>
              <p className="text-xs text-emerald-100/80">استشارات فورية، توليد شهادات الراتب، وتحليلات الامتثال لنظام العمل</p>
            </div>
          </div>
          <button 
            id="close-copilot-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.role === 'user' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-teal-700 text-white shadow-sm'
              }`}>
                {msg.role === 'user' ? 'أنت' : <Sparkles className="w-4 h-4 text-emerald-200" />}
              </div>

              <div className={`max-w-[85%] space-y-2.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-none'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none shadow-sm'
                }`}>
                  <div className="whitespace-pre-line">{msg.content}</div>
                </div>

                {/* Quick Card if returned (e.g. Official Salary Certificate) */}
                {msg.quickCard && msg.quickCard.type === 'salary_cert' && (
                  <div className="p-4 bg-white dark:bg-slate-900 border-2 border-emerald-500/40 rounded-xl shadow-md space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        <span className="font-bold text-slate-800 dark:text-white text-sm">شهادة تعريف بالراتب رسمية (جاهزة)</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono">
                        {msg.quickCard.data.qr_ref}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                        <span className="text-slate-500 block">اسم الموظف:</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{msg.quickCard.data.employee_name}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                        <span className="text-slate-500 block">الهوية الوطنية / الإقامة:</span>
                        <span className="font-semibold font-mono text-slate-800 dark:text-white">{msg.quickCard.data.national_id}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                        <span className="text-slate-500 block">المسمى الوظيفي:</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{msg.quickCard.data.job_title}</span>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded border border-emerald-200 dark:border-emerald-800">
                        <span className="text-emerald-700 dark:text-emerald-300 block">إجمالي الراتب المعتمد:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                          {Number(msg.quickCard.data.total_salary).toLocaleString()} ر.س
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button 
                        onClick={() => setSelectedCert(msg.quickCard.data)}
                        className="flex-1 py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        معاينة وطباعة الخطاب المعتمد
                      </button>
                    </div>
                  </div>
                )}

                {/* Suggested Action Buttons */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {msg.suggestedActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleActionClick(action)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium transition flex items-center gap-1"
                      >
                        <span>{action.label}</span>
                        <ChevronRight className="w-3 h-3 text-emerald-600" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="text-[10px] text-slate-400 px-1">
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 animate-spin text-emerald-200" />
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-none text-xs text-slate-500 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
                <span>جاري استدعاء المعرفة النظامية وصياغة الإجابة...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="copilot-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اطرح استفسارك النظامي، اطلب شهادة راتب، أو استعلم عن السعودة والوثائق..."
              className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
            />
            <button
              id="copilot-send-btn"
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-medium transition shadow-sm flex items-center justify-center shrink-0"
            >
              <Send className="w-5 h-5 rotate-180" />
            </button>
          </form>
        </div>

      </div>

      {/* Salary Certificate Printable Modal */}
      {selectedCert && (
        <div className="print-modal-overlay fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="print-document bg-white text-slate-900 rounded-xl max-w-2xl w-full p-8 shadow-2xl space-y-6 relative print:p-0 print:shadow-none">
            <button 
              onClick={() => setSelectedCert(null)}
              className="absolute top-4 left-4 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 print:hidden no-print"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Letterhead */}
            <Letterhead company={company} />

            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="text-xs text-slate-500">المملكة العربية السعودية - إدارة الموارد البشرية</div>
              <div className="text-left text-xs text-slate-600 font-mono">
                <p>التاريخ: {new Date().toLocaleDateString('ar-SA')}</p>
                <p>الرقم المرجعي: {selectedCert.qr_ref}</p>
              </div>
            </div>

            {/* Certificate Title */}
            <div className="text-center py-2">
              <h3 className="text-lg font-bold text-slate-800 underline underline-offset-8">شهادة تعريف وتثبيت راتب رسمية</h3>
              <p className="text-xs text-slate-500 mt-2">إلى من يهمه الأمر (معتمدة وموجهة لكافة الجهات الحكومية والبنكية)</p>
            </div>

            {/* Content Body */}
            <div className="text-sm leading-relaxed space-y-4 text-justify">
              <p>
                تشهد إدارة الموارد البشرية بأن الموظف / <strong>{selectedCert.employee_name}</strong>، ويحمل الهوية رقم (<strong>{selectedCert.national_id}</strong>)، يعمل لدى المنشأة بمسمى وظيفي <strong>{selectedCert.job_title}</strong> منذ تاريخ <strong>{selectedCert.join_date}</strong> وما زال على رأس العمل حتى تاريخه.
              </p>
              <p>
                وفيما يلي تفصيل مفردات الأجر الشهري الإجمالي المعتمد للموظف:
              </p>

              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      <th className="p-2.5">بند الأجر</th>
                      <th className="p-2.5">المبلغ الشهري (ر.س)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    <tr>
                      <td className="p-2.5">الراتب الأساسي</td>
                      <td className="p-2.5 font-bold">{Number(selectedCert.basic_salary).toLocaleString()} ر.س</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">بدل السكن</td>
                      <td className="p-2.5">{Number(selectedCert.housing_allowance).toLocaleString()} ر.س</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">بدل النقل والمواصلات</td>
                      <td className="p-2.5">{Number(selectedCert.transport_allowance).toLocaleString()} ر.س</td>
                    </tr>
                    <tr className="bg-emerald-50 font-black text-emerald-800 text-sm">
                      <td className="p-2.5">إجمالي الراتب الشهري</td>
                      <td className="p-2.5">{Number(selectedCert.total_salary).toLocaleString()} ر.س</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-600">
                أُعطيت هذه الشهادة للموظف بناءً على طلبه دون أدنى مسؤولية مالية أو التزام على المنشأة تجاه الغير.
              </p>
            </div>

            {/* Official Stamp & Signatures */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-200">
              <div className="text-center space-y-1">
                <p className="text-xs text-slate-500 font-semibold">إدارة الموارد البشرية والشؤون الإدارية</p>
                <div className="w-28 h-12 border border-dashed border-slate-300 rounded flex items-center justify-center text-[10px] text-slate-400">
                  توقيع المعتمد
                </div>
              </div>

              {/* Digital Seal */}
              <div className="w-24 h-24 rounded-full border-4 border-double border-emerald-700 flex flex-col items-center justify-center text-center p-1 transform rotate-[-8deg] bg-emerald-50/50">
                <span className="text-[9px] font-bold text-emerald-800">مؤسسة الرواتب</span>
                <span className="text-[11px] font-black text-emerald-900">معتمد رقمياً</span>
                <span className="text-[8px] font-mono text-emerald-700">QR-VERIFIED</span>
              </div>
            </div>

            <DocumentFooter company={company} reference={selectedCert.qr_ref} />

            {/* Print Action */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 print:hidden no-print">
              <button
                onClick={() => setSelectedCert(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                إغلاق
              </button>
              <button
                onClick={handlePrintCert}
                className="px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow"
              >
                <Printer className="w-4 h-4" />
                طباعة الخطاب الرسمي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
