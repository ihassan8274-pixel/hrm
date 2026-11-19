import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Btn, inputCls } from './ui';

/**
 * Shown instead of the application when the signed-in account still runs on its
 * factory-default password (the bootstrap admin).
 *
 * Nothing else in the app is rendered or reachable while this is active — the
 * point is that ADMIN123 is never usable beyond this screen, not merely
 * discouraged.
 */
export const MustChangePasswordView: React.FC = () => {
  const { direction } = useLanguage();
  const { token, user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = (): string => {
    if (newPassword.length < 8) return 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل';
    if (newPassword === 'ADMIN123') return 'لا يمكن اختيار كلمة المرور الافتراضية نفسها';
    if (newPassword !== confirmPassword) return 'كلمتا المرور غير متطابقتين';
    if (newPassword === currentPassword) return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذّر تغيير كلمة المرور');
        return;
      }
      setDone(true);
      // The server revokes every other session on password change, so drop the
      // local session too and let the operator sign in with the new password.
      setTimeout(() => {
        logout();
        window.location.reload();
      }, 2500);
    } catch {
      setError('تعذّر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-slate-100 p-4" dir={direction}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">تم تغيير كلمة المرور</h1>
            <p className="text-slate-500 text-sm">سيتم تسجيل خروجك الآن. سجّل الدخول بكلمة المرور الجديدة.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-slate-100 p-4" dir={direction}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-amber-200">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <KeyRound className="w-8 h-8 text-amber-700" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">يجب تغيير كلمة المرور</h1>
            <p className="text-slate-600 text-sm mt-2">
              مرحباً <span className="font-bold">{user?.username}</span> — حسابك لا يزال يستخدم كلمة المرور
              الافتراضية. غيّرها الآن للمتابعة إلى النظام.
            </p>
          </div>

          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed">
              لا يمكن استخدام النظام قبل تغيير كلمة المرور. لن يتم السماح بالوصول إلى أي بيانات أو شاشة أخرى.
            </span>
          </div>

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700" role="alert">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="cur" className="block text-sm font-medium text-slate-700 mb-1.5">
                كلمة المرور الحالية
              </label>
              <input
                id="cur" type={showPassword ? 'text' : 'password'} value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls} autoComplete="current-password" required disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="new" className="block text-sm font-medium text-slate-700 mb-1.5">
                كلمة المرور الجديدة
              </label>
              <input
                id="new" type={showPassword ? 'text' : 'password'} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls} autoComplete="new-password" required minLength={8} disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-1">8 أحرف على الأقل، وكلمة المرور الافتراضية غير مسموحة.</p>
            </div>

            <div>
              <label htmlFor="conf" className="block text-sm font-medium text-slate-700 mb-1.5">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                id="conf" type={showPassword ? 'text' : 'password'} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls} autoComplete="new-password" required minLength={8} disabled={loading}
              />
            </div>

            <button
              type="button" onClick={() => setShowPassword((s) => !s)}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPassword ? 'إخفاء كلمات المرور' : 'إظهار كلمات المرور'}
            </button>

            <Btn type="submit" className="w-full py-3" loading={loading} loadingText="جارٍ الحفظ...">
              حفظ كلمة المرور والدخول
            </Btn>
          </form>

          <button
            type="button" onClick={logout} className="mt-4 w-full text-xs text-slate-500 hover:text-slate-700"
          >
            تسجيل الخروج بدلاً من ذلك
          </button>
        </div>
      </motion.div>
    </div>
  );
};
