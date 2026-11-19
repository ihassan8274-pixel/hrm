import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Btn, inputCls } from './ui';

export const LoginView: React.FC = () => {
  const { t, direction } = useLanguage();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapActive, setBootstrapActive] = useState(false);

  // The factory-default quick-fill is only useful while admin still signs in with
  // ADMIN123. Ask the server once so the helper vanishes after the first change/reset.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/bootstrap-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (!cancelled) setBootstrapActive(!!d?.defaultAdminActive); })
      .catch(() => { if (!cancelled) setBootstrapActive(false); });
    return () => { cancelled = true; };
  }, []);

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

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('login.error') || 'Login failed');
        return;
      }

      login(data.token, data.user);
    } catch (err) {
      setError(t('login.networkError') || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // Only the bootstrap admin has a known password; the rest are created by an
// admin through /api/auth/register with no published default.
const demoCredentials = [
    { username: 'admin', password: 'ADMIN123', role: 'admin' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-brand-100 p-4" dir={direction}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-brand-600 to-brand-600 mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{t('login.title') || 'Welcome Back'}</h1>
            <p className="text-slate-500 mt-1">{t('login.subtitle') || 'Sign in to your account'}</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('login.username') || 'Username'}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputCls} pl-10`} 
                  placeholder={t('login.usernamePlaceholder') || 'Enter your username'}
                  required
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('login.password') || 'Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pl-10 pr-10`}
                  placeholder={t('login.passwordPlaceholder') || 'Enter your password'}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Btn type="submit" className="w-full py-3" loading={loading} loadingText={t('login.signingIn') || 'Signing in...'}>
              {t('login.signIn') || 'Sign In'}
            </Btn>
          </form>

          {bootstrapActive && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-500 text-center mb-3">حساب التشغيل الأول</p>
            <div className="space-y-2">
              {demoCredentials.map((cred, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setUsername(cred.username);
                    setPassword(cred.password);
                  }}
                  className="w-full px-4 py-2 text-sm text-left bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center justify-between"
                  disabled={loading}
                >
                  <span className="font-medium text-slate-700">
                    {cred.username} / {cred.password}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-brand-100 text-brand-700 rounded">{cred.role}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-amber-700 mt-3 text-center leading-relaxed">
              سيطلب النظام تغيير كلمة المرور فور أول دخول.
            </p>
          </div>
          )}
        </div>

        <p className="text-center text-slate-400 text-sm mt-6">
          {t('login.version') || 'Version 2.0.0'} • {t('login.poweredBy') || 'Powered by RestoCost ERP'}
        </p>
      </motion.div>
    </div>
  );
};