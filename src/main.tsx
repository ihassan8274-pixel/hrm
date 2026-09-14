import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import BranchMobileKiosk from './components/BranchMobileKiosk';
import ManagerInboxView from './components/ManagerInboxView';
import { LoginView } from './components/LoginView';

const _fetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return _fetch(input, { ...init, headers });
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const kioskMatch = window.location.pathname.match(/^\/kiosk\/([^/]+)\/?$/);
const kioskToken = kioskMatch ? decodeURIComponent(kioskMatch[1]) : null;
const isApprovals = window.location.pathname.replace(/\/$/, '') === '/approvals';

function ApprovalsGate() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 text-center">...</div>;
  if (!user) return <LoginView />;
  return <ManagerInboxView />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {kioskToken ? (
      <BranchMobileKiosk token={kioskToken} />
    ) : isApprovals ? (
      <LanguageProvider>
        <AuthProvider>
          <div className="min-h-screen bg-slate-50">
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
