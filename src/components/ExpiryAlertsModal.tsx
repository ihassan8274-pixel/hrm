import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Calendar, 
  CheckCircle, 
  X, 
  Send, 
  ExternalLink, 
  BellRing,
  FileText,
  HeartPulse,
  Car,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface ExpiryAlertItem {
  id: string;
  category: 'iqama' | 'insurance' | 'contract' | 'work_permit' | 'vehicle';
  title: string;
  employee_id?: number;
  employee_name?: string;
  department_name?: string;
  document_number?: string;
  expiry_date: string;
  days_left: number;
  severity: 'critical' | 'warning' | 'info';
  status_text: string;
  action_label: string;
  action_type: string;
}

interface ExpiryAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction?: (actionType: string, empId?: number) => void;
}

export const ExpiryAlertsModal: React.FC<ExpiryAlertsModalProps> = ({ 
  isOpen, 
  onClose,
  onSelectAction 
}) => {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<ExpiryAlertItem[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'iqama' | 'insurance' | 'contract'>('all');
  const [loading, setLoading] = useState(false);
  const [sentReminders, setSentReminders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
    }
  }, [isOpen]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alerts/expiries');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
        setSummary(data.summary || {});
      }
    } catch (e) {
      console.error("Failed to fetch expiry alerts", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (alert: ExpiryAlertItem) => {
    try {
      await fetch('/api/alerts/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alert.id,
          title: `تنبيه: ${alert.title}`,
          message: `${alert.status_text} (${alert.document_number}) - يرجى المتابعة والتجديد فوراً.`
        })
      });
      setSentReminders(prev => ({ ...prev, [alert.id]: true }));
    } catch (e) {
      console.error("Failed to send reminder", e);
    }
  };

  if (!isOpen) return null;

  const filteredAlerts = alerts.filter(a => {
    if (activeTab === 'critical') return a.severity === 'critical';
    if (activeTab === 'iqama') return a.category === 'iqama';
    if (activeTab === 'insurance') return a.category === 'insurance';
    if (activeTab === 'contract') return a.category === 'contract';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-rose-50 via-slate-50 to-slate-50 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-md shadow-rose-600/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800">{t('alerts.title')}</h3>
                {summary.critical_count > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-black border border-rose-200 animate-pulse">
                    {summary.critical_count} حرج
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{t('alerts.subtitle')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick KPI stats */}
        <div className="p-4 bg-slate-100/70 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 text-center text-xs">
          <div 
            onClick={() => setActiveTab('all')}
            className={`p-3 rounded-2xl cursor-pointer transition-all border ${
              activeTab === 'all' ? 'bg-white border-indigo-400 shadow-sm font-bold text-indigo-700' : 'bg-slate-50/50 border-slate-200 text-slate-600'
            }`}
          >
            <p className="text-[10px] text-slate-400">إجمالي التنبيهات</p>
            <p className="text-lg font-black text-slate-800 font-mono mt-0.5">{summary.total_alerts || 0}</p>
          </div>

          <div 
            onClick={() => setActiveTab('critical')}
            className={`p-3 rounded-2xl cursor-pointer transition-all border ${
              activeTab === 'critical' ? 'bg-rose-50 border-rose-400 shadow-sm font-bold text-rose-800' : 'bg-slate-50/50 border-slate-200 text-slate-600'
            }`}
          >
            <p className="text-[10px] text-rose-500 font-bold">وثائق حرجة (منتهية/&lt;30 يوم)</p>
            <p className="text-lg font-black text-rose-600 font-mono mt-0.5">{summary.critical_count || 0}</p>
          </div>

          <div 
            onClick={() => setActiveTab('iqama')}
            className={`p-3 rounded-2xl cursor-pointer transition-all border ${
              activeTab === 'iqama' ? 'bg-amber-50 border-amber-400 shadow-sm font-bold text-amber-800' : 'bg-slate-50/50 border-slate-200 text-slate-600'
            }`}
          >
            <p className="text-[10px] text-slate-400">إقامات قاربت على الانتهاء</p>
            <p className="text-lg font-black text-amber-600 font-mono mt-0.5">{summary.iqama_count || 0}</p>
          </div>

          <div 
            onClick={() => setActiveTab('insurance')}
            className={`p-3 rounded-2xl cursor-pointer transition-all border ${
              activeTab === 'insurance' ? 'bg-emerald-50 border-emerald-400 shadow-sm font-bold text-emerald-800' : 'bg-slate-50/50 border-slate-200 text-slate-600'
            }`}
          >
            <p className="text-[10px] text-slate-400">التأمين الصحي CCHI</p>
            <p className="text-lg font-black text-emerald-600 font-mono mt-0.5">{summary.insurance_count || 0}</p>
          </div>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-400" />
              <p className="text-xs font-medium">جاري فحص وتحديث سجلات الإقامات والوثائق...</p>
            </div>
          ) : filteredAlerts.length > 0 ? (
            filteredAlerts.map(alert => {
              const isSent = sentReminders[alert.id];
              return (
                <div 
                  key={alert.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    alert.severity === 'critical'
                      ? 'bg-rose-50/70 border-rose-200 shadow-sm'
                      : alert.severity === 'warning'
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${
                      alert.severity === 'critical'
                        ? 'bg-rose-600 text-white'
                        : alert.severity === 'warning'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {alert.category === 'iqama' && <FileText className="w-5 h-5" />}
                      {alert.category === 'insurance' && <HeartPulse className="w-5 h-5" />}
                      {alert.category === 'contract' && <Calendar className="w-5 h-5" />}
                      {alert.category === 'vehicle' && <Car className="w-5 h-5" />}
                      {alert.category === 'work_permit' && <ShieldAlert className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-800">{alert.title}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          alert.severity === 'critical' ? 'bg-rose-200 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {alert.severity === 'critical' ? 'حرج جداً' : 'تنبيه'}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-rose-700 mt-1">{alert.status_text}</p>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-1.5">
                        <span>القسم: <b className="text-slate-700">{alert.department_name}</b></span>
                        <span>رقم الوثيقة: <b className="font-mono text-slate-700">{alert.document_number}</b></span>
                        <span>تاريخ الانتهاء: <b className="font-mono text-slate-700">{alert.expiry_date}</b></span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                    <button
                      onClick={() => handleSendReminder(alert)}
                      disabled={isSent}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        isSent 
                          ? 'bg-emerald-100 text-emerald-800 cursor-default' 
                          : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 shadow-sm'
                      }`}
                    >
                      {isSent ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Send className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{isSent ? 'تم الإشعار' : t('btn.send_reminder')}</span>
                    </button>

                    <button
                      onClick={() => {
                        onClose();
                        if (onSelectAction) onSelectAction(alert.action_type, alert.employee_id);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <span>{alert.action_label}</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 text-slate-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-80" />
              <h4 className="text-base font-bold text-slate-700">{t('alerts.no_critical')}</h4>
              <p className="text-xs text-slate-400 mt-1">يتم الفحص التلقائي لجميع الإقامات ورخص العمل والوثائق يومياً</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <BellRing className="w-4 h-4 text-emerald-600" />
            <span>نظام الفحص اللحظي متصل بقواعد بيانات الجوازات والتأمينات ومنصة قوى</span>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            {t('btn.close')}
          </button>
        </div>

      </div>
    </div>
  );
};
