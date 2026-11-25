import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import BranchMobileKiosk from './components/BranchMobileKiosk';
import ManagerInboxView from './components/ManagerInboxView';
import { LoginView } from './components/LoginView';
import { IdentityPaperBackground } from './components/IdentityPaperBackground';
import MobilePwa from './components/MobilePwa';
import { clearSession, getAuthToken, updateAuthUser } from './lib/nativeSession';

const NATIVE_APP = Capacitor.isNativePlatform();
const API_ORIGIN = 'https://hr.restocost.shop';

/**
 * داخل WebView يصبح أصل الصفحة هو localhost، فالمسارات النسبية /api لن تصل للخادم.
 * نعيد كتابتها إلى نطاق الإنتاج هنا مرة واحدة، وتبقى كل الشاشات تستخدم /api كما هي.
 */
function nativeUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!NATIVE_APP) return input;
  if (typeof input === 'string' && input.startsWith('/')) return `${API_ORIGIN}${input}`;
  if (input instanceof URL && input.pathname.startsWith('/api/')) {
    return new URL(`${API_ORIGIN}${input.pathname}${input.search}`);
  }
  return input;
}

const _fetch = window.fetch.bind(window);

// The server answers an expired/revoked session with 403, not 401. Components that
// call fetch directly would otherwise hand the {error: ...} body to .filter() and
// crash the whole screen. Detect those auth failures centrally and tell AuthContext
// to drop the cached user so the login screen replaces the stale UI.
const AUTH_FAILURE_ERRORS = new Set([
  'Invalid or expired token',
  'Token revoked',
  'Account inactive',
  'Access token required',
]);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const target = nativeUrl(input);
  const token = await getAuthToken();
  const headers = new Headers(init?.headers || (target instanceof Request ? target.headers : undefined));
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const response = await _fetch(target, { ...init, headers });
  if (token && !response.ok && (response.status === 401 || response.status === 403)) {
    let body: any = null;
    try {
      body = await response.clone().json();
    } catch {
      // Non-JSON error page — fall back to the status code only.
    }
    if (body?.code === 'PASSWORD_CHANGE_REQUIRED') {
      await updateAuthUser({ must_change_password: true });
      window.dispatchEvent(new CustomEvent('auth:password-change-required'));
    } else if (response.status === 401 || AUTH_FAILURE_ERRORS.has(String(body?.error || ''))) {
      await clearSession();
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
  }
  return response;
};

// الـ Service Worker مخصص للـ PWA على نطاق الويب؛ WebView الأصلي يعتمد على التخزين الآمن.
if ('serviceWorker' in navigator && !NATIVE_APP) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const kioskMatch = window.location.pathname.match(/^\/kiosk\/([^/]+)\/?$/);
const kioskToken = kioskMatch ? decodeURIComponent(kioskMatch[1]) : null;
const isApprovals = window.location.pathname.replace(/\/$/, '') === '/approvals';
const isMobilePwa = /^\/m\/?$/.test(window.location.pathname);

function ApprovalsGate() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 text-center">...</div>;
  if (!user) return <LoginView />;
  return <ManagerInboxView />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* C · ورقة الهوية — خلفية ثابتة لكل مسارات النظام (تطبيق، كيسك، اعتمادات). */}
    <IdentityPaperBackground />
    {kioskToken ? (
      <BranchMobileKiosk token={kioskToken} />
    ) : isMobilePwa ? (
      <LanguageProvider>
        <AuthProvider>
          <MobilePwa />
        </AuthProvider>
      </LanguageProvider>
    ) : isApprovals ? (
      <LanguageProvider>
        <AuthProvider>
          <div className="min-h-screen bg-transparent">
            <ApprovalsGate />
          </div>
        </AuthProvider>
      </LanguageProvider>
    ) : (
      <LanguageProvider>
        <App />
      </LanguageProvider>
    )}
  </StrictMode>,
);
