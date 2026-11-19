import { useState, useEffect } from 'react';
import { History, Search, Filter, Clock, User, ShieldCheck, Printer, X } from 'lucide-react';
import type { AuditLog } from '../types';
import { Letterhead, DocumentFooter } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

export default function AuditLogsView() {
  const company = useLetterhead();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [printing]);

  const fetchLogs = async () => {
    const res = await fetch('/api/audit-logs');
    const data = await res.json();
    setLogs(data);
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'bg-emerald-50 text-emerald-600';
      case 'update': return 'bg-brand-50 text-brand-600';
      case 'delete': return 'bg-red-50 text-red-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">سجل العمليات</h1>
          <p className="text-slate-500 text-sm">مراقبة التغييرات والعمليات المنفذة في النظام</p>
        </div>
        <button
          onClick={() => setPrinting(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة السجل ({filteredLogs.length})</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="بحث في السجلات..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-4 pl-12 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-medium text-right"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-slate-500">العملية</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500">نوع الكيان</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500">التفاصيل</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500">بواسطة</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500">التوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-700">{log.entity_type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-500 max-w-md truncate" title={log.details}>
                      {log.details}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-600">{log.created_by}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs font-mono">{new Date(log.created_at).toLocaleString('ar-EG')}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p>لا توجد سجلات مطابقة للبحث</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {printing && (
        <div className="print-document bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="no-print flex justify-end gap-2 mb-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={() => setPrinting(false)} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold">
              <X className="w-4 h-4" /> إغلاق
            </button>
          </div>
          <Letterhead company={company} title="سجل العمليات والتدقيق" />
          <div className="flex justify-between text-xs text-slate-600 border-b border-slate-200 pb-2">
            <span>عدد السجلات: {filteredLogs.length}</span>
            <span>تاريخ الاستخراج: {new Date().toLocaleString('ar-EG')}</span>
            {searchTerm && <span>فلتر البحث: {searchTerm}</span>}
          </div>
          <table className="w-full text-[11px] border border-slate-300">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-2 border-b border-slate-300 text-right">العملية</th>
                <th className="p-2 border-b border-slate-300 text-right">الكيان</th>
                <th className="p-2 border-b border-slate-300 text-right">التفاصيل</th>
                <th className="p-2 border-b border-slate-300 text-right">بواسطة</th>
                <th className="p-2 border-b border-slate-300 text-right">التوقيت</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id} className="border-b border-slate-200 align-top">
                  <td className="p-2 font-bold uppercase">{log.action}</td>
                  <td className="p-2">{log.entity_type}</td>
                  <td className="p-2">{log.details}</td>
                  <td className="p-2">{log.created_by}</td>
                  <td className="p-2 font-mono whitespace-nowrap" dir="ltr">{new Date(log.created_at).toLocaleString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <DocumentFooter company={company} reference={`AUDIT-${new Date().toISOString().slice(0, 10)}`} />
        </div>
      )}
    </div>
  );
}
