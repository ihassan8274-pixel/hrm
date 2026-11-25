import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Check, 
  Info, 
  AlertTriangle, 
  X, 
  ShieldAlert, 
  Calendar, 
  ExternalLink,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppNotification } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { ExpiryAlertsModal } from './ExpiryAlertsModal';

export default function NotificationBell({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const { t, language } = useLanguage();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [expirySummary, setExpirySummary] = useState<any>({ critical_count: 0, total_alerts: 0 });
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setNotifications(data);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch notifications", e);
    }
  };

  const fetchExpiryAlerts = async () => {
    try {
      const res = await fetch('/api/alerts/expiries');
      if (res.ok) {
        const data = await res.json();
        if (data && data.summary) {
          setExpirySummary(data.summary);
        }
      }
    } catch (e) {
      console.error("Failed to fetch expiry summary", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchExpiryAlerts();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchExpiryAlerts();
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (e) {
      console.error("Failed to mark notifications as read", e);
    }
  };

  const unreadCount = notifications.filter(n => n.is_read === 0).length;
  const criticalExpiries = expirySummary.critical_count || 0;
  const totalBadgeCount = unreadCount + criticalExpiries;

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <Check className="w-4 h-4 text-emerald-500" />;
      case 'error': return <X className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-brand-500" />;
    }
  };

  return (
    <>
      <div className="relative font-sans flex items-center gap-2">
        {/* Quick Expiry Warning Pill if critical expiries exist */}
        {criticalExpiries > 0 && (
          <button
            onClick={() => setShowExpiryModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-full text-xs font-black transition-all shadow-sm animate-pulse"
            title="تنبيه: توجد وثائق وإقامات قاربت على الانتهاء"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>{criticalExpiries} {language === 'ar' ? 'وثيقة حرجة قاربت على الانتهاء' : 'Critical Expiries'}</span>
          </button>
        )}

        <button 
          id="top-notification-bell-btn"
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-600 dark:hover:text-brand-300 rounded-xl transition-all relative border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <Bell className="w-5 h-5" />
          {totalBadgeCount > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 ${
              criticalExpiries > 0 ? 'bg-rose-600' : 'bg-brand-600'
            }`}>
              {totalBadgeCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <div className="print-hide fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute left-0 rtl:left-0 ltr:right-0 mt-3 w-88 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden text-xs"
                style={{ width: '340px' }}
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/60">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white">
                      {language === 'ar' ? 'التنبيهات والإشعارات' : 'Notifications & Alerts'}
                    </h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 text-[10px] font-bold">
                        {unreadCount} جديد
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={markAllRead}
                    className="text-[10px] font-bold text-brand-600 hover:underline"
                  >
                    {t('btn.mark_read')}
                  </button>
                </div>

                {/* Expiry Banner shortcut */}
                {expirySummary.total_alerts > 0 && (
                  <div 
                    onClick={() => {
                      setIsOpen(false);
                      setShowExpiryModal(true);
                    }}
                    className="p-3 bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-500/10 dark:to-amber-500/10 border-b border-rose-100 dark:border-rose-500/20 flex items-center justify-between cursor-pointer hover:bg-rose-100/60 dark:hover:bg-rose-500/15 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-rose-600 text-white rounded-xl shadow-sm">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-black text-slate-800 dark:text-white text-xs">مركز تنبيهات الوثائق والإقامات</p>
                        <p className="text-[10px] text-rose-700 dark:text-rose-300 font-bold">
                          {expirySummary.critical_count} حرج • {expirySummary.total_alerts} إجمالي التنبيهات
                        </p>
                      </div>
                    </div>
                    {language === 'ar' ? <ChevronLeft className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                )}

                {/* Notification Items */}
                <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={`p-3.5 border-b border-slate-50 dark:border-slate-800 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                          n.is_read === 0 ? 'bg-brand-50/30 dark:bg-brand-500/10' : ''
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{n.title}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{new Date(n.created_at).toLocaleString('ar-SA')}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs font-medium">لا توجد إشعارات جديدة حالياً</p>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="p-3 text-center border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      setShowExpiryModal(true);
                    }}
                    className="text-[11px] font-black text-brand-600 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200 flex items-center justify-center gap-1.5 w-full py-1"
                  >
                    <span>{t('alerts.open_hub')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Expiry Alerts Center Modal */}
      {showExpiryModal && (
        <ExpiryAlertsModal 
          isOpen={showExpiryModal}
          onClose={() => setShowExpiryModal(false)}
          onSelectAction={(actionType) => {
            setShowExpiryModal(false);
            if (onNavigate) {
              if (actionType === 'renew_iqama' || actionType === 'renew_contract') onNavigate('employees');
              else if (actionType === 'renew_insurance') onNavigate('medical');
              else if (actionType === 'renew_vehicle') onNavigate('fleet');
            }
          }}
        />
      )}
    </>
  );
}
