import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Lock, User, Eye, EyeOff, AlertCircle, Loader2,
  Mail, Phone, BadgeCheck, CheckCircle2, ArrowRight, X
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Btn } from './ui';

type AuthTab = 'login' | 'signup';

interface SignupDraft {
  full_name: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  confirm: string;
}

const emptySignup: SignupDraft = {
  full_name: '', email: '', phone: '', username: '', password: '', confirm: ''
};

/** Frosted inputs: the identity paper must stay visible behind every field. */
const glassInputCls =
  'w-full px-4 py-2.5 rounded-xl border border-white/80 dark:border-white/10 ' +
  'bg-white/55 dark:bg-slate-950/40 backdrop-blur-md text-sm font-bold text-navy-800 dark:text-slate-100 ' +
  'outline-none transition-all focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500/70 ' +
  'disabled:opacity-60 placeholder:text-slate-500 dark:placeholder:text-slate-400 placeholder:font-medium';

/** النسخة ثلاثية الأبعاد من الحقول — بنفس البالية مع عمق زجاجي على الجوال. */
const glassInput3dCls = `${glassInputCls} auth3d__input`;

/** النموذج 01 — انقسام الهوية: ورقة الهوية C على الجانب، والنموذج على الجانب الآخر. */
export const LoginView: React.FC = () => {
  const { t, direction } = useLanguage();
  const { login } = useAuth();

  const [tab, setTab] = useState<AuthTab>('login');

  // login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapActive, setBootstrapActive] = useState(false);

  // signup-request state
  const [draft, setDraft] = useState<SignupDraft>({ ...emptySignup });
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  // password-recovery request state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/bootstrap-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (!cancelled) setBootstrapActive(!!d?.defaultAdminActive); })
      .catch(() => { if (!cancelled) setBootstrapActive(false); });
    return () => { cancelled = true; };
  }, []);

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setError('');
    setSignupError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('login.error') || 'Login failed');
        return;
      }
      login(data.token, data.user);
    } catch {
      setError(t('login.networkError') || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    if (draft.password !== draft.confirm) {
      setSignupError(t('auth.passwordMismatch') || 'Password confirmation does not match');
      return;
    }
    setSignupLoading(true);
    try {
      const res = await fetch('/api/auth/signup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: draft.full_name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          username: draft.username.trim(),
          password: draft.password,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSignupError(data.error || t('login.error') || 'Request failed');
        return;
      }
      setRequestId(String(data.id ?? data.request_id ?? '—'));
      setDraft({ ...emptySignup });
    } catch {
      setSignupError(t('login.networkError') || 'Network error');
    } finally {
      setSignupLoading(false);
    }
  };

  const openReset = () => {
    setResetUsername(username);
    setResetEmail('');
    setResetError('');
    setResetSent(false);
    setResetOpen(true);
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetBusy(true);
    try {
      const res = await fetch('/api/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUsername.trim(), email: resetEmail.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetError(data.error || t('login.networkError') || 'Network error');
        return;
      }
      setResetSent(true);
    } catch {
      setResetError(t('login.networkError') || 'Network error');
    } finally {
      setResetBusy(false);
    }
  };

  // Only the bootstrap admin has a known password; the helper vanishes after the first change/reset.
  const demoCredentials = [
    { username: 'admin', password: 'ADMIN123', role: 'admin' },
  ];

  const setField = (key: keyof SignupDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="auth3d relative min-h-screen flex items-center justify-center overflow-hidden p-4" dir={direction}>
      {/* طبقات العمق: شبكة أفقية + ثلاث كرات زجاجية بألوان الشعار */}
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--blue" />
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--teal" />
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--coral" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-5xl"
      >
        <div className="auth3d__shell grid md:grid-cols-2 overflow-hidden rounded-[28px] border border-white/80 dark:border-white/10 bg-white/35 dark:bg-slate-950/35 backdrop-blur-2xl shadow-[0_24px_70px_rgba(16,42,86,0.18)] ring-1 ring-white/40 dark:ring-white/5">

          {/* ===== ورقة الهوية C — الجانب الثابت ===== */}
          <aside className="auth3d__identity hidden md:flex relative flex-col items-center justify-center gap-4 overflow-hidden p-10
                            bg-gradient-to-br from-white/55 via-white/25 to-brand-100/40
                            dark:from-white/10 dark:via-slate-900/25 dark:to-[#0B1D3A]/60
                            border-e border-white/70 dark:border-white/10 backdrop-blur-xl">
            <div className="absolute -top-24 -end-24 h-72 w-72 rounded-full border border-brand-200/70 dark:border-brand-800/50 shadow-[0_0_0_36px_rgba(23,105,209,0.04)]" />
            <span className="font-sans text-[10px] font-bold tracking-[0.5em] text-brand-600 dark:text-brand-300 uppercase">
              EMPOWER
            </span>
            <h2 className="font-sans text-6xl leading-none font-black text-brand-900 dark:text-white">تمكين</h2>
            <span className="font-sans text-2xl font-bold tracking-[0.28em] text-brand-800 dark:text-brand-300" dir="ltr">
              EMPOWER
            </span>
            <span className="h-1 w-32 rounded-full bg-gradient-to-l from-brand-600 via-primary-500 to-[#F26B5B]" />
            <p className="font-sans text-[9px] font-semibold tracking-[0.22em] text-slate-500 dark:text-slate-400 text-center" dir="ltr">
              HUMAN RESOURCES MANAGEMENT SYSTEM
            </p>
            <img
              src="/brand/empower-3d-icon.png"
              alt=""
              className="auth3d__mark mt-3 h-40 w-40 rounded-3xl bg-white/70 p-2 object-contain drop-shadow-[0_18px_30px_rgba(16,42,86,0.22)]"
            />
            <div className="mt-1 flex gap-2">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-900 text-[8px] font-bold text-white font-sans">EMPOWER</span>
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-primary-500 text-[9px] font-bold text-white">تمكين</span>
            </div>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-[260px]">
              {t('auth.identityLine') || 'نظام إدارة الموارد البشرية والرواتب'}
            </p>
          </aside>

          {/* ===== نموذج الدخول / طلب التسجيل ===== */}
          <section className="auth3d__form relative p-7 sm:p-10 flex flex-col justify-center bg-white/20 dark:bg-white/[0.03]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/50 to-transparent dark:from-white/[0.07]" />
            {/* شعار مصغّر للشاشات الصغيرة */}
            <div className="mb-6 flex items-center gap-3 md:hidden">
              <img src="/brand/empower-3d-icon.png" alt="" className="auth3d__mark h-11 w-11 rounded-xl bg-white/80 p-1 object-cover" />
              <div>
                <b className="block text-sm font-black text-brand-900 dark:text-white">تمكين</b>
                <small className="font-sans text-[8px] font-bold tracking-[1.3px] text-brand-600 dark:text-brand-300">EMPOWER</small>
              </div>
            </div>

            <div className="auth3d__tabs mb-6 flex gap-1 rounded-2xl border border-white/80 dark:border-white/10 bg-white/40 dark:bg-slate-950/30 p-1 shadow-inner backdrop-blur-xl">
              <button
                type="button"
                onClick={() => switchTab('login')}
                className={`auth3d__tab flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  tab === 'login'
                    ? 'on bg-white/90 dark:bg-slate-900/80 text-brand-700 dark:text-brand-300 shadow-sm backdrop-blur-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-brand-600'
                }`}
              >
                {t('auth.tab.login') || 'تسجيل الدخول'}
              </button>
              <button
                type="button"
                onClick={() => switchTab('signup')}
                className={`auth3d__tab flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  tab === 'signup'
                    ? 'on bg-white/90 dark:bg-slate-900/80 text-brand-700 dark:text-brand-300 shadow-sm backdrop-blur-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-brand-600'
                }`}
              >
                {t('auth.tab.signup') || 'إنشاء حساب'}
              </button>
            </div>

            {tab === 'login' ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="auth3d__title text-2xl font-black text-navy-900 dark:text-white">
                  {t('auth.welcome') || t('login.title') || 'مرحباً بعودتك'}
                </h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('login.subtitle') || 'سجّل الدخول إلى حسابك'}
                </p>

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200/70 bg-red-50/70 p-3 text-xs text-red-700 backdrop-blur-md dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="login-username" className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
                      {t('login.username') || 'اسم المستخدم'}
                    </label>
                    <div className="relative">
                      <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={`${glassInput3dCls} ps-10`}
                        placeholder={t('login.usernamePlaceholder') || 'اسم المستخدم'}
                        required
                        autoComplete="username"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-password" className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
                      {t('login.password') || 'كلمة المرور'}
                    </label>
                    <div className="relative">
                      <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${glassInput3dCls} ps-10 pe-10`}
                        placeholder={t('login.passwordPlaceholder') || 'كلمة المرور'}
                        required
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600"
                        aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <label className="flex cursor-pointer items-center gap-1.5 font-bold text-slate-500 dark:text-slate-400">
                      <input type="checkbox" className="accent-brand-600" />
                      {t('auth.remember') || 'تذكرني'}
                    </label>
                    <button
                      type="button"
                      onClick={openReset}
                      disabled={loading}
                      className="font-bold text-brand-600 underline decoration-brand-300 underline-offset-2 transition-colors hover:text-brand-700 disabled:opacity-50 dark:text-brand-300"
                    >
                      {t('auth.forgot') || 'نسيت كلمة المرور؟'}
                    </button>
                  </div>

                  <Btn type="submit" className="auth3d__cta w-full py-3 shadow-[0_10px_25px_rgba(23,105,209,0.28)] ring-1 ring-white/25" loading={loading} loadingText={t('login.signingIn') || 'جارٍ تسجيل الدخول...'}>
                    {t('login.signIn') || 'تسجيل الدخول'}
                  </Btn>
                </form>

                {bootstrapActive && (
                  <div className="mt-6 border-t border-white/70 pt-5 dark:border-white/10">
                    <p className="mb-3 text-center text-[11px] font-bold text-slate-500">حساب التشغيل الأول</p>
                    <button
                      type="button"
                      onClick={() => { setUsername(demoCredentials[0].username); setPassword(demoCredentials[0].password); }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/80 bg-white/45 px-4 py-2 text-xs backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                      disabled={loading}
                    >
                      <span className="font-bold text-navy-700 dark:text-slate-200">admin / ADMIN123</span>
                      <span className="rounded bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">admin</span>
                    </button>
                    <p className="mt-2 text-center text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
                      سيطلب النظام تغيير كلمة المرور فور أول دخول.
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="auth3d__title text-2xl font-black text-navy-900 dark:text-white">
                  {t('auth.signupTitle') || 'طلب تسجيل جديد'}
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {t('auth.signupSubtitle') || 'سيُراجع الطلب من الإدارة قبل تفعيل الحساب'}
                </p>

                {requestId ? (
                  <div className="mt-6 rounded-2xl border border-white/80 bg-white/45 p-6 text-center shadow-lg backdrop-blur-xl ring-1 ring-primary-200/60 dark:border-white/10 dark:bg-slate-950/40 dark:ring-primary-900/40">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-primary-600 dark:text-primary-300" />
                    <p className="mt-3 text-sm font-black text-navy-900 dark:text-white">
                      {t('auth.requestSent') || 'تم استلام الطلب'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {t('auth.requestSentBody') || 'رقم الطلب'}: <span className="font-mono font-bold">#{requestId}</span>
                    </p>
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {t('auth.requestPending') || 'يبقى قيد المراجعة ولن يُفعّل الحساب إلا بعد اعتماد الإدارة.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => switchTab('login')}
                      className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 dark:text-brand-300"
                    >
                      {t('auth.backToLogin') || 'العودة لتسجيل الدخول'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    {signupError && (
                      <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200/70 bg-red-50/70 p-3 text-xs text-red-700 backdrop-blur-md dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{signupError}</span>
                      </div>
                    )}

                    <form onSubmit={handleSignup} className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label htmlFor="su-name" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('auth.fullName')}</label>
                        <div className="relative">
                          <BadgeCheck className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input id="su-name" className={`${glassInput3dCls} ps-10`} value={draft.full_name} onChange={setField('full_name')} placeholder={t('auth.fullName')} required disabled={signupLoading} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="su-email" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('auth.email')}</label>
                        <div className="relative">
                          <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input id="su-email" type="email" className={`${glassInput3dCls} ps-10`} value={draft.email} onChange={setField('email')} placeholder={t('auth.email')} required disabled={signupLoading} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="su-phone" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('auth.phone')}</label>
                        <div className="relative">
                          <Phone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input id="su-phone" type="tel" className={`${glassInput3dCls} ps-10`} value={draft.phone} onChange={setField('phone')} placeholder={t('auth.phone')} required disabled={signupLoading} />
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="su-username" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('auth.username')}</label>
                        <div className="relative">
                          <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input id="su-username" className={`${glassInput3dCls} ps-10`} value={draft.username} onChange={setField('username')} placeholder={t('auth.username')} required disabled={signupLoading} autoComplete="username" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="su-password" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('auth.password')}</label>
                        <input id="su-password" type="password" className={glassInput3dCls} value={draft.password} onChange={setField('password')} placeholder={t('auth.password')} required minLength={8} disabled={signupLoading} autoComplete="new-password" />
                      </div>
                      <div>
                        <label htmlFor="su-confirm" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">{t('auth.confirmPassword')}</label>
                        <input id="su-confirm" type="password" className={glassInput3dCls} value={draft.confirm} onChange={setField('confirm')} placeholder={t('auth.confirmPassword')} required minLength={8} disabled={signupLoading} autoComplete="new-password" />
                      </div>
                      <div className="sm:col-span-2">
                        <Btn type="submit" className="auth3d__cta auth3d__cta--coral w-full py-3 shadow-[0_10px_25px_rgba(23,105,209,0.28)] ring-1 ring-white/25" loading={signupLoading} loadingText={t('auth.submitting') || 'جارٍ الإرسال...'}>
                          {t('auth.submitRequest') || 'إرسال طلب التسجيل'}
                        </Btn>
                      </div>
                    </form>
                  </>
                )}
              </motion.div>
            )}

            <p className="mt-7 text-center text-[10px] font-medium text-slate-400">
              {t('login.version') || 'Version 2.0.0'}
            </p>
          </section>
        </div>
      </motion.div>

      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t('auth.resetTitle') || 'استعادة كلمة المرور'}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#122238]/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-navy-900 dark:text-white">
                  {t('auth.resetTitle') || 'استعادة كلمة المرور'}
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {t('auth.resetSubtitle') || 'أدخل اسم المستخدم والبريد المسجل؛ سيراجع مدير النظام الطلب.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                aria-label={t('auth.resetClose') || 'إغلاق'}
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-800 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {resetSent ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle2 className="mb-2 h-5 w-5" />
                <p className="font-black">{t('auth.resetSent') || 'تم استلام الطلب'}</p>
                <p className="mt-1 leading-relaxed">{t('auth.resetSentBody') || 'إن كان الحساب موجوداً، سيراجعه مدير النظام.'}</p>
                <Btn className="mt-4 w-full" onClick={() => setResetOpen(false)}>
                  {t('auth.resetClose') || 'إغلاق'}
                </Btn>
              </div>
            ) : (
              <form onSubmit={submitReset} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="reset-username" className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('auth.resetUsername') || 'اسم المستخدم'}
                  </label>
                  <input
                    id="reset-username"
                    type="text"
                    autoComplete="username"
                    required
                    disabled={resetBusy}
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    className={glassInputCls}
                  />
                </div>
                <div>
                  <label htmlFor="reset-email" className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('auth.email') || 'البريد الإلكتروني'}
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    required
                    disabled={resetBusy}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={glassInputCls}
                  />
                </div>
                {resetError && (
                  <p className="flex items-start gap-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                    <span>{resetError}</span>
                  </p>
                )}
                <Btn type="submit" className="w-full" loading={resetBusy} loadingText={t('auth.submitting') || 'جارٍ الإرسال...'}>
                  {t('auth.resetSubmit') || 'إرسال طلب الاستعادة'}
                </Btn>
                <p className="text-center text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {t('auth.resetNote') || 'لا يُخبر النظام ما إذا كان الحساب موجوداً، ولا يُنشأ تسجيل دخول من الطلب.'}
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
