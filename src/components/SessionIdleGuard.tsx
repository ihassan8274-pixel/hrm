import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Timer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  LAST_ACTIVITY_KEY,
  clearLastActivity,
  idleRemainingMs,
  readLastActivity,
  writeLastActivity,
} from '../lib/sessionIdle';

/**
 * Real user input only. Background polling (notifications, live attendance,
 * audit logs) must never keep an unattended workstation signed in.
 */
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/**
 * Ends the local session after 15 minutes without user input and revokes the
 * server-side session. Shows a 60-second countdown first so nobody is ejected
 * mid-task without warning. Mounted only for signed-in users.
 */
export default function SessionIdleGuard() {
  const { user, logout } = useAuth();
  const { t, direction } = useLanguage();
  const isAuthenticated = Boolean(user?.id);
  const [remaining, setRemaining] = useState(IDLE_TIMEOUT_MS);
  const lastActivityRef = useRef(Date.now());
  const lastWriteRef = useRef(0);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const markActivity = useCallback((force = false) => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (force || now - lastWriteRef.current >= 1000) {
      writeLastActivity(now);
      lastWriteRef.current = now;
      // The browser clock is client-side only. Extend the server-side session
      // as well, at the same throttled rate, so a token cannot live forever on
      // a workstation nobody is using. API polling never calls markActivity.
      void fetch('/api/auth/activity', { method: 'POST' }).catch(() => {});
    }
    setRemaining(IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const now = Date.now();
    const stored = readLastActivity(now);
    // A tab closed while idle must not silently sign the user back in on return.
    if (now - stored >= IDLE_TIMEOUT_MS) {
      clearLastActivity();
      logoutRef.current();
      return;
    }
    lastActivityRef.current = stored;
    writeLastActivity(stored);
    setRemaining(idleRemainingMs(stored, now));

    const onActivity = () => markActivity();
    const onVisibility = () => {
      // Coming back from another tab/window is activity; leaving is not.
      if (document.visibilityState === 'visible') markActivity(true);
    };
    // Shared timestamp keeps sibling tabs alive when one of them is in use.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY || !event.newValue) return;
      const at = Number(event.newValue);
      if (Number.isFinite(at) && at > lastActivityRef.current) {
        lastActivityRef.current = at;
        setRemaining(idleRemainingMs(at, Date.now()));
      }
    };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    const tick = window.setInterval(() => {
      const left = idleRemainingMs(lastActivityRef.current, Date.now());
      setRemaining(left);
      if (left <= 0) {
        clearLastActivity();
        logoutRef.current();
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [isAuthenticated, markActivity]);

  if (!isAuthenticated || remaining > IDLE_WARNING_MS || remaining <= 0) return null;

  return (
    <div dir={direction} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900/95"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <Timer className="h-5 w-5" />
          </span>
          <div>
            <h2 id="idle-title" className="font-black text-navy-900 dark:text-white">
              {t('session.warningTitle', 'انتهاء الجلسة قريباً')}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('session.warningHint', 'لا يوجد نشاط منذ 15 دقيقة')}
            </p>
          </div>
        </div>

        <p className="mb-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
          {t('session.warningBody', 'سيتم تسجيل خروجك تلقائياً لحماية بياناتك. اضغط «متابعة العمل» للبقاء.')}
        </p>

        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
          <span className="text-xs font-bold text-amber-800 dark:text-amber-200">
            {t('session.countdown', 'الوقت المتبقي')}
          </span>
          <span className="ms-auto font-mono text-lg font-black tabular-nums text-amber-700 dark:text-amber-300" dir="ltr">
            00:{String(Math.ceil(remaining / 1000)).padStart(2, '0')}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => markActivity(true)}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_8px_20px_rgba(23,105,209,0.25)] transition-colors hover:bg-brand-700"
          >
            {t('session.stay', 'متابعة العمل')}
          </button>
          <button
            type="button"
            onClick={() => { clearLastActivity(); logoutRef.current(); }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" />
            {t('session.logoutNow', 'خروج الآن')}
          </button>
        </div>
      </div>
    </div>
  );
}
