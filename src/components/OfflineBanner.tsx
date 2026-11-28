import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/** Navigator-based signal, shared with the mobile shell's read-only guard. */
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/** Visible on every /m screen, including login and the password-change gate. */
export default function OfflineBanner() {
  const { t, direction } = useLanguage();
  const online = useOnline();
  if (online) return null;
  return (
    <div className="mpwa-offline-banner" role="status" aria-live="polite" dir={direction}>
      <WifiOff size={15} aria-hidden="true" />
      <span>
        <b>{t('offline.banner', 'أنت دون اتصال')}</b>
        <small>{t('offline.readonly', 'البيانات المعروضة آخر ما تم تحميله — للقراءة فقط.')}</small>
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        {t('offline.retry', 'إعادة المحاولة')}
      </button>
    </div>
  );
}
