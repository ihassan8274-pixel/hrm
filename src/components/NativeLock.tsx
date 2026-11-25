import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { App } from '@capacitor/app';
import { Fingerprint, LockKeyhole } from 'lucide-react';
import { isBiometricEnabled, isNativeApp, setBiometricEnabled } from '../lib/nativeSession';

const authOptions = {
  reason: 'تحقق من هويتك للوصول إلى بيانات تمكين',
  cancelTitle: 'إلغاء',
  allowDeviceCredential: true,
  iosFallbackTitle: 'استخدام رمز الجهاز',
  title: 'تمكين | EMPOWER',
  subtitle: 'الدخول الآمن',
};

/** حالة إعداد البصمة داخل تطبيق الجوال الأصلي فقط. */
export function useBiometric() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isNativeApp) return;
    let alive = true;
    (async () => {
      try {
        const info = await BiometricAuth.checkBiometry();
        if (alive) setAvailable(Boolean(info.isAvailable));
      } catch {
        if (alive) setAvailable(false);
      }
      if (alive) setEnabled(await isBiometricEnabled());
    })();
    return () => { alive = false; };
  }, []);

  const toggle = useCallback(async (next: boolean) => {
    if (next) {
      const confirmed = await BiometricAuth.authenticate(authOptions).then(() => true).catch(() => false);
      if (!confirmed) return false;
    }
    await setBiometricEnabled(next);
    setEnabled(next);
    return true;
  }, []);

  return { native: isNativeApp, available, enabled, toggle };
}

/**
 * قفل البصمة: لا يغيّر المصادقة ولا يمنح صلاحيات، بل يمنع عرض البيانات المخزّنة
 * على جهاز مشترك إذا كان الموظف قد فعّل الخيار. يعاد القفل عند العودة للتطبيق.
 */
export default function NativeLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backgrounded = useRef(false);

  useEffect(() => {
    if (!isNativeApp) return;
    let alive = true;
    let listener: { remove: () => void } | undefined;
    (async () => {
      const enabled = await isBiometricEnabled();
      if (!alive || !enabled) return;
      setLocked(true);

      listener = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          backgrounded.current = true;
          setLocked(true);
        } else if (backgrounded.current) {
          backgrounded.current = false;
          setLocked(true);
        }
      });
    })();
    return () => { alive = false; listener?.remove(); };
  }, []);

  const unlock = useCallback(async () => {
    setBusy(true); setError('');
    try {
      await BiometricAuth.authenticate(authOptions);
      setLocked(false);
    } catch {
      setError('تعذّر التحقق. استخدم البصمة أو رمز الجهاز، أو أغلق التطبيق وأعد فتحه.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isNativeApp || !locked) return <>{children}</>;

  return (
    <div className="mpwa" dir="rtl">
      <div className="mpwa-login">
        <div className="mpwa-login-brand">
          <div className="mpwa-mark"><LockKeyhole size={22} /></div>
          <b>تمكين | EMPOWER</b>
          <span>التطبيق مقفل لحماية بياناتك.<br />استخدم البصمة أو رمز الجهاز للمتابعة.</span>
        </div>
        <div className="mpwa-login-card">
          {error && <div className="mpwa-error">{error}</div>}
          <button className="mpwa-btn" onClick={() => void unlock()} disabled={busy}>
            {busy ? <span className="mpwa-spinner" /> : <Fingerprint size={18} />}
            {busy ? 'جارٍ التحقق…' : 'فتح القفل'}
          </button>
        </div>
      </div>
    </div>
  );
}
