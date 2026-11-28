import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  Bell, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ClipboardCheck,
  FileText, Fingerprint, Home, Landmark, Lightbulb, LockKeyhole, LogOut, MessageSquare,
  RefreshCw, ShieldCheck, Smartphone, User, Wallet, WifiOff, X,
} from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { useAuth } from '../context/AuthContext';
import SessionIdleGuard from './SessionIdleGuard';
import NativeLock, { useBiometric } from './NativeLock';
import OfflineBanner, { useOnline } from './OfflineBanner';
import { isNativeApp, loadOfflineSnapshot, saveOfflineSnapshot, updateAuthUser } from '../lib/nativeSession';
import { startNativePush } from '../lib/nativePush';
import { isRestrictedPresencePolicy, presenceRecheckDelay, samplePresenceOnce } from '../lib/presence';
import '../mobile.css';

type Tab = 'home' | 'requests' | 'inbox' | 'profile';
type Panel = null | 'presence' | 'payslip' | 'annual' | 'approvals' | 'notifications';
type RequestType = 'leave' | 'loan' | 'grievance' | 'suggestion' | 'workflow_improvement';

const APPROVER_ROLES = new Set(['admin', 'hr_manager', 'branch_manager']);

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shortDate = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusLabel = (status: unknown) => {
  const map: Record<string, string> = {
    pending: 'قيد الاعتماد', submitted: 'مُرفوع', under_review: 'قيد المراجعة',
    approved: 'معتمد', rejected: 'مرفوض', active: 'ساري', completed: 'مكتمل',
    accepted: 'مقبول', cancelled: 'ملغي',
  };
  const key = String(status || '').toLowerCase();
  return map[key] || key || '—';
};

const statusClass = (status: unknown) => {
  const key = String(status || '').toLowerCase();
  if (['pending', 'submitted', 'under_review'].includes(key)) return 'mpwa-status pending';
  if (['approved', 'active', 'completed', 'accepted'].includes(key)) return 'mpwa-status done';
  return 'mpwa-status';
};

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || data?.message || `فشل الطلب (${response.status})`));
  return data as T;
}

function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mpwa-card tight" style={{ position: 'fixed', bottom: 88, left: 16, right: 16, zIndex: 60, margin: 0, background: '#102A56', color: '#fff', borderColor: '#102A56' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <Check size={16} /> {text}
      </div>
    </div>
  );
}

type AuthTab = 'login' | 'signup';
const emptySignup = { full_name: '', email: '', phone: '', username: '', password: '', confirm: '' };

function MobileLogin() {
  const { login } = useAuth();
  const [tab, setTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ ...emptySignup });
  const [signupBusy, setSignupBusy] = useState(false);
  const [requestId, setRequestId] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'بيانات الدخول غير صحيحة'));
      if (!data?.token || !data?.user) throw new Error('استجابة الدخول غير مكتملة');
      login(data.token, data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signup = async (event: FormEvent) => {
    event.preventDefault();
    setSignupBusy(true); setError(''); setRequestId('');
    if (draft.password !== draft.confirm) {
      setError('تأكيد كلمة المرور غير مطابق');
      setSignupBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/auth/signup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: draft.full_name.trim(), email: draft.email.trim(), phone: draft.phone.trim(),
          username: draft.username.trim(), password: draft.password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'تعذّر إرسال الطلب'));
      setRequestId(String(data.id ?? data.request_id ?? '—'));
      setDraft({ ...emptySignup });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSignupBusy(false);
    }
  };

  const setField = (key: keyof typeof emptySignup) => (event: ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: event.target.value }));

  return (
    <div className="mpwa auth3d" dir="rtl">
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--blue" />
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--teal" />
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--coral" />
      <div className="mpwa-login">
        <div className="mpwa-login-brand">
          <img src="/brand/empower-3d-icon.png" alt="" className="auth3d__mark mpwa-login-mark" />
          <b className="auth3d__title">تمكين | EMPOWER</b>
          <span>نسخة الجوال — خدمات الموظفين والاعتمادات<br />نظام إدارة الموارد البشرية والرواتب</span>
        </div>
        <div className="auth3d__tabs mpwa-auth-tabs">
          <button type="button" className={`auth3d__tab ${tab === 'login' ? 'on' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            تسجيل الدخول
          </button>
          <button type="button" className={`auth3d__tab ${tab === 'signup' ? 'on' : ''}`} onClick={() => { setTab('signup'); setError(''); }}>
            إنشاء حساب
          </button>
        </div>
        {tab === 'login' ? (
          <form className="mpwa-login-card auth3d__shell auth3d__form" onSubmit={submit}>
            {error && <div className="mpwa-error">{error}</div>}
            <div className="mpwa-field">
              <label htmlFor="mpwa-user">اسم المستخدم</label>
              <input id="mpwa-user" className="mpwa-input auth3d__input" value={username} onChange={e => setUsername(e.target.value)}
                autoComplete="username" inputMode="text" required placeholder="مثال: emp001" />
            </div>
            <div className="mpwa-field">
              <label htmlFor="mpwa-pass">كلمة المرور</label>
              <input id="mpwa-pass" className="mpwa-input auth3d__input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" required placeholder="••••••••" />
            </div>
            <button className="mpwa-btn auth3d__cta" type="submit" disabled={busy}>
              {busy ? <span className="mpwa-spinner" /> : <LockKeyhole size={16} />}
              {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
            </button>
            <p className="mpwa-note" style={{ margin: '14px 0 0' }}>
              الدخول هنا هو نفس دخول النظام. لا تُشارك كلمة المرور، ولا تستخدم حساب زميلك.
            </p>
          </form>
        ) : (
          <form className="mpwa-login-card auth3d__shell auth3d__form" onSubmit={signup}>
            {error && <div className="mpwa-error">{error}</div>}
            {requestId && <div className="mpwa-note">تم إرسال الطلب برقم {requestId}. سيراجعه المسؤول.</div>}
            <div className="mpwa-field"><label>الاسم الكامل</label><input className="mpwa-input auth3d__input" value={draft.full_name} onChange={setField('full_name')} required /></div>
            <div className="mpwa-field"><label>البريد الإلكتروني</label><input className="mpwa-input auth3d__input" type="email" value={draft.email} onChange={setField('email')} required /></div>
            <div className="mpwa-field"><label>رقم الجوال</label><input className="mpwa-input auth3d__input" type="tel" value={draft.phone} onChange={setField('phone')} required /></div>
            <div className="mpwa-field"><label>اسم المستخدم المقترح</label><input className="mpwa-input auth3d__input" value={draft.username} onChange={setField('username')} autoComplete="username" required /></div>
            <div className="mpwa-field"><label>كلمة المرور</label><input className="mpwa-input auth3d__input" type="password" value={draft.password} onChange={setField('password')} autoComplete="new-password" required /></div>
            <div className="mpwa-field"><label>تأكيد كلمة المرور</label><input className="mpwa-input auth3d__input" type="password" value={draft.confirm} onChange={setField('confirm')} autoComplete="new-password" required /></div>
            <button className="mpwa-btn auth3d__cta auth3d__cta--coral" type="submit" disabled={signupBusy}>
              {signupBusy ? <span className="mpwa-spinner" /> : <ShieldCheck size={16} />}
              {signupBusy ? 'جارٍ الإرسال…' : 'إرسال طلب التسجيل'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ForcePasswordChange() {
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (next !== confirm) return setError('تأكيد كلمة المرور غير مطابق');
    if (next.length < 8) return setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
    setBusy(true);
    try {
      await api('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      await updateAuthUser({ must_change_password: false });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mpwa auth3d" dir="rtl">
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--blue" />
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--teal" />
      <div aria-hidden="true" className="auth3d__orb auth3d__orb--coral" />
      <div className="mpwa-login">
        <div className="mpwa-login-brand">
          <img src="/brand/empower-3d-icon.png" alt="" className="auth3d__mark mpwa-login-mark" />
          <b className="auth3d__title">تغيير كلمة المرور مطلوب</b>
          <span>كلمة المرور الحالية هي كلمة التفعيل الأولى.<br />يجب تغييرها قبل استخدام أي خدمة.</span>
        </div>
        <form className="mpwa-login-card auth3d__shell auth3d__form" onSubmit={submit}>
          {error && <div className="mpwa-error">{error}</div>}
          <div className="mpwa-field">
            <label>كلمة المرور الحالية</label>
            <input className="mpwa-input auth3d__input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
          </div>
          <div className="mpwa-field">
            <label>كلمة المرور الجديدة</label>
            <input className="mpwa-input auth3d__input" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} required />
          </div>
          <div className="mpwa-field">
            <label>تأكيد كلمة المرور الجديدة</label>
            <input className="mpwa-input auth3d__input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          <button className="mpwa-btn auth3d__cta" type="submit" disabled={busy}>
            {busy ? <span className="mpwa-spinner" /> : <ShieldCheck size={16} />}
            {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
          </button>
          <button className="mpwa-btn ghost" type="button" style={{ marginTop: 8 }} onClick={logout}>تسجيل الخروج</button>
        </form>
      </div>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`mpwa-card ${className}`}>{children}</section>;
}

function MobileShell() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const biometric = useBiometric();
  const [tab, setTab] = useState<Tab>('home');
  const [panel, setPanel] = useState<Panel>(null);
  const [sheet, setSheet] = useState<RequestType | null>(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stale, setStale] = useState<{ savedAt: number } | null>(null);
  const [me, setMe] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [requests, setRequests] = useState<any>({ loans: [], leaves: [], grievances: [], suggestions: [] });
  const [payroll, setPayroll] = useState<any[]>([]);
  const [annual, setAnnual] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [presenceMe, setPresenceMe] = useState<any>(null);
  const [presenceGate, setPresenceGate] = useState<any>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [presenceError, setPresenceError] = useState('');
  const [presenceNotice, setPresenceNotice] = useState('');
  const [exitForm, setExitForm] = useState({ starts_at: '', ends_at: '', reason: '' });
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const canApprove = APPROVER_ROLES.has(String(user?.role || ''));
  const today = new Date();

  const applyPayload = useCallback((payload: any) => {
    const meData = payload?.meData ?? null;
    const empRows: any[] = Array.isArray(payload?.empRows) ? payload.empRows : [];
    const payRows: any[] = Array.isArray(payload?.payRows) ? payload.payRows : [];
    const noteRows = Array.isArray(payload?.noteRows) ? payload.noteRows : [];
    const approvalRows: any[] = Array.isArray(payload?.approvalRows) ? payload.approvalRows : [];
    const ownId = meData?.employee_id || empRows[0]?.id;
    setMe(meData);
    setEmployee(empRows.find((e: any) => e.id === ownId) || empRows[0] || null);
    setNotifications(noteRows);
    setRequests(payload?.requests || { loans: [], leaves: [], grievances: [], suggestions: [] });
    setPayroll(payRows.filter((p: any) => p.employee_id === ownId));
    setAnnual(payload?.annual ?? null);
    setApprovals(canApprove ? approvalRows.filter((a: any) => a.status === 'pending') : []);
  }, [canApprove]);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setStale(null);
    try {
      const results = await Promise.allSettled([
        api('/api/auth/me'),
        api('/api/employees'),
        api('/api/notifications'),
        api('/api/ess/requests'),
        api(`/api/payroll?month=${today.getMonth() + 1}&year=${today.getFullYear()}`),
        api('/api/annual/me'),
        canApprove ? api('/api/workflow-requests') : Promise.resolve([]),
      ]);
      const [meRes, empRes, noteRes, reqRes, payRes, annualRes, approvalRes] = results;
      const value = <T,>(result: PromiseSettledResult<T>, fallback: T): T => result.status === 'fulfilled' ? result.value : fallback;
      const failed = results.some(result => result.status === 'rejected');
      const payload = {
        meData: value(meRes, null as any),
        empRows: value(empRes, [] as any[]),
        noteRows: value(noteRes, []),
        requests: value(reqRes, { loans: [], leaves: [], grievances: [], suggestions: [] }),
        payRows: value(payRes, [] as any[]),
        annual: value(annualRes, null),
        approvalRows: value(approvalRes, [] as any[]),
      };

      // قد يبلغ WebView عن اتصال بينما الشبكة مقطوعة فعلياً؛ المعيار هو فشل الطلب نفسه.
      if (failed) {
        const snapshot = await loadOfflineSnapshot();
        if (snapshot?.payload) {
          applyPayload(snapshot.payload);
          setStale({ savedAt: snapshot.savedAt });
          return;
        }
      }

      applyPayload(payload);
      if (!failed) await saveOfflineSnapshot(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [applyPayload, canApprove, today.getMonth(), today.getFullYear()]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user) return;
    void startNativePush(notification => {
      setToast(String(notification.title || 'تنبيه جديد'));
      void load();
    });
  }, [user, load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onPrompt = (event: any) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const unread = notifications.filter(n => !n.is_read).length;
  const latestPayroll = payroll[0] || null;

  const requestItems = useMemo(() => {
    const rows: any[] = [];
    (requests.loans || []).forEach((r: any) => rows.push({
      ...r, label: 'طلب سلفة', sub: `${money(r.total_amount)} ر.س`, type: 'loan',
    }));
    (requests.leaves || []).forEach((r: any) => rows.push({
      ...r, label: 'طلب إجازة', sub: `${shortDate(r.start_date)} — ${shortDate(r.end_date)}`, type: 'leave',
    }));
    (requests.grievances || []).forEach((r: any) => rows.push({
      ...r, label: 'شكوى إدارية', sub: r.subject || r.ticket_number || '', type: 'grievance',
    }));
    (requests.suggestions || []).forEach((r: any) => rows.push({
      ...r, label: r.suggestion_type === 'workflow_improvement' ? 'مقترح تطوير سير العمل' : 'مقترح',
      sub: r.title || '', type: 'suggestion',
    }));
    return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [requests]);

  const markAllRead = async () => {
    if (!online || stale) { setToast('لا يمكن التنفيذ دون اتصال — البيانات للقراءة فقط'); return; }
    try {
      await api('/api/notifications/read-all', { method: 'PUT' });
      setNotifications(items => items.map(n => ({ ...n, is_read: 1 })));
      setToast('تم تعليم التنبيهات كمقروءة');
    } catch (e) { setToast((e as Error).message); }
  };

  const decide = async (id: number, action: 'approved' | 'rejected') => {
    if (!online || stale) { setToast('لا يمكن الاعتماد دون اتصال — البيانات للقراءة فقط'); return; }
    try {
      await api(`/api/workflow-requests/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          actor_name: employee?.name || user?.username || 'مدير معتمد',
          comments: action === 'approved' ? 'اعتمد من تطبيق الجوال' : 'رُفض من تطبيق الجوال',
        }),
      });
      setToast(action === 'approved' ? 'تم الاعتماد' : 'تم الرفض');
      await load();
    } catch (e) { setToast((e as Error).message); }
  };

  const loadPresence = useCallback(async () => {
    try { setPresenceError(''); setPresenceMe(await api('/api/presence/me')); }
    catch (e) { setPresenceError((e as Error).message); }
  }, []);

  const gatePresence = async () => {
    if (!online || stale) { setPresenceError('لا يمكن تسجيل الدخول دون اتصال — البيانات للقراءة فقط'); return; }
    setPresenceBusy(true); setPresenceError(''); setPresenceNotice('');
    try {
      const sample = await samplePresenceOnce();
      const result = await api('/api/presence/gate', {
        method: 'POST',
        body: JSON.stringify(sample),
      });
      setPresenceGate(result);
      setPresenceNotice(result?.allowed ? 'تم إصدار تصريح التواجد.' : 'خارج النطاق — لم يُصدر تصريح.');
      await loadPresence();
    } catch (e) { setPresenceError((e as Error).message); setPresenceGate(null); }
    finally { setPresenceBusy(false); }
  };

  const checkoutPresence = async () => {
    if (!online || stale) { setPresenceError('لا يمكن تسجيل الخروج دون اتصال — البيانات للقراءة فقط'); return; }
    setPresenceBusy(true); setPresenceError(''); setPresenceNotice('');
    try {
      await api('/api/presence/checkout', { method: 'POST', body: '{}' });
      setPresenceGate(null);
      setPresenceNotice('تم تسجيل الخروج من الفرع.');
      await loadPresence();
    } catch (e) { setPresenceError((e as Error).message); }
    finally { setPresenceBusy(false); }
  };

  // One fresh sample when the permit lapses. No watchPosition, no polling and
  // no coordinates are kept after the request: the server decides in memory.
  const recheckPresence = useCallback(async () => {
    setPresenceBusy(true); setPresenceError(''); setPresenceNotice('');
    try {
      const sample = await samplePresenceOnce();
      const result = await api('/api/presence/recheck', {
        method: 'POST',
        body: JSON.stringify(sample),
      });
      setPresenceGate(result);
      setPresenceNotice(result?.allowed
        ? 'تم تجديد تصريح التواجد بعيّنة واحدة.'
        : 'تم قفل التواجد — سجّل الخروج ثم عد للتسجيل داخل الفرع.');
    } catch (e) {
      setPresenceError((e as Error).message);
    } finally {
      setPresenceBusy(false);
      await loadPresence();
    }
  }, [loadPresence]);

  useEffect(() => {
    if (panel !== 'presence' || presenceMe?.locked) return;
    if (!presenceMe?.open_interval || !presenceMe.permit_expires_at) return;
    if (!isRestrictedPresencePolicy(presenceMe.policy)) return;
    const delay = presenceRecheckDelay(presenceMe.permit_expires_at);
    if (delay === null) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { if (!cancelled) void recheckPresence(); }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [panel, presenceMe?.open_interval?.id, presenceMe?.permit_expires_at, presenceMe?.locked, presenceMe?.policy, recheckPresence]);

  const submitExitRequest = async () => {
    if (!online || stale) { setPresenceError('لا يمكن رفع طلب دون اتصال — البيانات للقراءة فقط'); return; }
    if (!exitForm.starts_at || !exitForm.ends_at) return;
    setPresenceBusy(true); setPresenceError(''); setPresenceNotice('');
    try {
      await api('/api/presence/exit-request', {
        method: 'POST',
        body: JSON.stringify({
          starts_at: new Date(exitForm.starts_at).toISOString(),
          ends_at: new Date(exitForm.ends_at).toISOString(),
          reason: exitForm.reason,
        }),
      });
      setExitForm({ starts_at: '', ends_at: '', reason: '' });
      setPresenceNotice('تم رفع طلب الخروج — يُعتمد عبر مسار الاعتمادات.');
    } catch (e) { setPresenceError((e as Error).message); }
    finally { setPresenceBusy(false); }
  };

  const openPanel = (next: Panel) => {
    setPanel(next); setTab('home');
    if (next === 'presence') void loadPresence();
  };
  const goHome = () => { setPanel(null); setTab('home'); };

  const header = (
    <header className="mpwa-top">
      <button className="mpwa-brand" onClick={goHome} style={{ border: 0, background: 'transparent', color: '#fff', padding: 0, textAlign: 'right' }}>
        <span className="mpwa-mark">تمكين</span>
        <span className="mpwa-brand-text">
          <b>تمكين | EMPOWER</b>
          <small>مساحة الموظف — نسخة الجوال</small>
        </span>
      </button>
      <div className="mpwa-top-actions">
        <span className={`mpwa-online ${online ? '' : 'off'}`}>
          <i /> {online ? 'متصل' : 'دون اتصال'}
        </span>
        <button className="mpwa-icon-btn" onClick={() => openPanel('notifications')} aria-label="التنبيهات">
          <Bell size={18} />{unread > 0 && <span className="mpwa-dot" />}
        </button>
      </div>
    </header>
  );

  const tabs = (
    <nav className="mpwa-tabs" aria-label="التنقل الرئيسي">
      <button className={`mpwa-tab ${tab === 'home' && !panel ? 'active' : ''}`} onClick={goHome}>
        <Home size={19} /><span>الرئيسية</span>
      </button>
      <button className={`mpwa-tab ${tab === 'requests' && !panel ? 'active' : ''}`} onClick={() => { setPanel(null); setTab('requests'); }}>
        <FileText size={19} /><span>طلباتي</span>
      </button>
      <button className={`mpwa-tab ${tab === 'inbox' && !panel ? 'active' : ''}`} onClick={() => { setPanel(null); setTab('inbox'); }}>
        <Bell size={19} /><span>الوارد</span>{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <button className={`mpwa-tab ${tab === 'profile' && !panel ? 'active' : ''}`} onClick={() => { setPanel(null); setTab('profile'); }}>
        <User size={19} /><span>حسابي</span>
      </button>
    </nav>
  );

  if (user?.must_change_password) return <ForcePasswordChange />;

  return (
    <div className="mpwa" dir="rtl">
      <SessionIdleGuard />
      <div className="mpwa-shell">
        {header}

        <main className="mpwa-main">
          {!online && (
            <div className="mpwa-error"><WifiOff size={14} /> لا يوجد اتصال حالياً — البيانات المعروضة آخر ما تم تحميله.</div>
          )}
          {stale && (
            <div className="mpwa-error">
              بيانات غير متصلة — محفوظة بتاريخ {shortDate(stale.savedAt)}. للقراءة فقط؛ لا يمكن رفع طلبات أو اعتمادات حتى يعود الاتصال.
            </div>
          )}
          {error && <div className="mpwa-error">{error} <button className="mpwa-card-head button" onClick={() => void load()}>إعادة المحاولة</button></div>}

          {loading ? (
            <>
              <div className="mpwa-card"><div className="mpwa-skeleton" style={{ height: 76 }} /></div>
              <div className="mpwa-grid">
                {[0, 1, 2, 3].map(i => <div className="mpwa-card tight" key={i}><div className="mpwa-skeleton" style={{ height: 58 }} /></div>)}
              </div>
            </>
          ) : panel === 'presence' ? (
            <>
              <PanelTitle title="بوابة التواجد" onBack={goHome} onRefresh={() => void loadPresence()} />
              {presenceError && <div className="mpwa-error">{presenceError}</div>}
              {presenceMe?.locked && (
                <div className="mpwa-error">انتهت صلاحية التصريح — البرنامج مقفل حتى تسجّل الخروج ثم تعود للتسجيل داخل الفرع.</div>
              )}
              {presenceNotice && <div className="mpwa-card tight" style={{ color: '#0F766E' }}>{presenceNotice}</div>}
              <Card className="mpwa-hero">
                <div className="mpwa-note" style={{ color: '#C9D9F0' }}>
                  السياسة: {String(presenceMe?.policy || 'open')} · دقائق اليوم: {Number(presenceMe?.today?.inside_minutes || 0)}
                </div>
                <div className="mpwa-pills" style={{ marginTop: 8 }}>
                  <span className="mpwa-pill teal"><Fingerprint size={11} /> عيّنة موقع واحدة</span>
                  <span className="mpwa-pill">فروع: {Number(presenceMe?.branches?.length || 0)}</span>
                </div>
                <div className="mpwa-btn-row" style={{ marginTop: 12 }}>
                  <button className="mpwa-btn" disabled={presenceBusy} onClick={() => void gatePresence()}>
                    <Fingerprint size={16} /> تسجيل الدخول
                  </button>
                  <button className="mpwa-btn ghost" disabled={presenceBusy || !presenceMe?.open_interval} onClick={() => void checkoutPresence()}>
                    <Check size={16} /> تسجيل الخروج
                  </button>
                  {presenceMe?.open_interval && isRestrictedPresencePolicy(presenceMe?.policy) && (
                    <button className="mpwa-btn ghost" disabled={presenceBusy} onClick={() => void recheckPresence()}>
                      <RefreshCw size={15} /> تجديد بعيّنة
                    </button>
                  )}
                </div>
                {presenceGate?.branch_name && (
                  <p className="mpwa-note" style={{ marginTop: 10 }}>
                    {presenceGate.allowed ? 'مسموح' : 'ممنوع'} · {presenceGate.branch_name}
                    {presenceGate.distance_m != null ? ` · ${Math.round(Number(presenceGate.distance_m))} م` : ''}
                  </p>
                )}
                <p className="mpwa-note" style={{ marginTop: 8 }}>بلا بث موقع، بلا خريطة حية، وبلا تخزين إحداثيات على الجهاز.</p>
              </Card>
              <Card>
                <div className="mpwa-card-head"><h3>طلب خروج غير معتمد</h3></div>
                <div className="mpwa-list">
                  <div className="mpwa-row">
                    <span className="ico"><CalendarDays size={16} /></span>
                    <div style={{ display: 'grid', gap: 6, width: '100%' }}>
                      <input className="mpwa-input" type="datetime-local" value={exitForm.starts_at}
                        onChange={e => setExitForm({ ...exitForm, starts_at: e.target.value })} />
                      <input className="mpwa-input" type="datetime-local" value={exitForm.ends_at}
                        onChange={e => setExitForm({ ...exitForm, ends_at: e.target.value })} />
                      <input className="mpwa-input" value={exitForm.reason} placeholder="السبب (اختياري)"
                        onChange={e => setExitForm({ ...exitForm, reason: e.target.value })} />
                      <button className="mpwa-btn ghost" disabled={presenceBusy || !exitForm.starts_at || !exitForm.ends_at}
                        onClick={() => void submitExitRequest()}>رفع الطلب</button>
                    </div>
                  </div>
                </div>
              </Card>
            </>
          ) : panel === 'payslip' ? (
            <>
              <PanelTitle title="كشف الراتب" onBack={goHome} onRefresh={() => void load()} />
              {latestPayroll ? (
                <>
                  <Card className="mpwa-hero">
                    <div className="mpwa-note" style={{ color: '#C9D9F0' }}>
                      راتب {Number(latestPayroll.month)} / {Number(latestPayroll.year)} — {latestPayroll.employee_name || employee?.name || ''}
                    </div>
                    <div className="mpwa-salary" style={{ marginTop: 8 }}>
                      <b>{money(latestPayroll.net_salary)}</b><small>ر.س صافي المستحق</small>
                    </div>
                    <div className="mpwa-split">
                      <div className="mpwa-mini"><span>الراتب الأساسي</span><b>{money(latestPayroll.basic_salary)}</b></div>
                      <div className="mpwa-mini"><span>البدلات</span><b>{money(latestPayroll.allowances)}</b></div>
                      <div className="mpwa-mini"><span>الخصومات</span><b>{money(latestPayroll.deductions)}</b></div>
                      <div className="mpwa-mini"><span>التأمينات</span><b>{money(latestPayroll.insurance_emp_share)}</b></div>
                    </div>
                    <div className="mpwa-pills">
                      <span className="mpwa-pill teal"><ShieldCheck size={11} /> ضريبة 0% — امتثال سعودي</span>
                    </div>
                  </Card>
                  <p className="mpwa-note">المبالغ المعروضة هي المسجّلة فعلياً في النظام. لا تُعدّل الرواتب من تطبيق الجوال.</p>
                </>
              ) : (
                <Card><div className="mpwa-empty"><b>لا يوجد كشف راتب لهذا الشهر</b>راجع إدارة الموارد البشرية إذا كان مفترضاً وجوده.</div></Card>
              )}
            </>
          ) : panel === 'annual' ? (
            <>
              <PanelTitle title="الدورة السنوية" onBack={goHome} onRefresh={() => void load()} />
              <Card className="mpwa-hero">
                <div className="mpwa-note" style={{ color: '#C9D9F0' }}>سنة الدورة {annual?.year || today.getFullYear()}</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>
                  {annual?.anniversary ? `الذكرى القادمة: ${shortDate(annual.anniversary)}` : 'تاريخ الذكرى غير مسجّل'}
                </div>
                <div className="mpwa-pills">
                  <span className="mpwa-pill teal"><CalendarDays size={11} /> تنبيه قبل شهر: {annual?.reminder_date ? shortDate(annual.reminder_date) : 'غير محدد'}</span>
                </div>
              </Card>
              <Card>
                <div className="mpwa-card-head"><h3>حالة الاعتماد</h3></div>
                <div className="mpwa-list">
                  <div className="mpwa-row">
                    <span className="ico"><ClipboardCheck size={16} /></span>
                    <div className="mpwa-row-main"><b>قرار الزيادة</b><span>{annual?.decision ? `${money(annual.decision.amount)} ر.س — ${statusLabel(annual.decision.status)}` : 'لا يوجد قرار مسجّل لهذه السنة'}</span></div>
                    <span className={statusClass(annual?.decision?.status)}>{statusLabel(annual?.decision?.status)}</span>
                  </div>
                  <div className="mpwa-row">
                    <span className="ico"><FileText size={16} /></span>
                    <div className="mpwa-row-main"><b>التقييم السنوي</b><span>{annual?.review ? `${annual.review.total_score ?? '—'} / 25 — ${annual.review.rating || ''}` : 'لم يُدخل تقييم بعد'}</span></div>
                    <span className={statusClass(annual?.review ? 'completed' : 'pending')}>{annual?.review ? 'مكتمل' : 'بانتظار'}</span>
                  </div>
                </div>
              </Card>
            </>
          ) : panel === 'notifications' ? (
            <>
              <PanelTitle title="التنبيهات" onBack={goHome} onRefresh={() => void load()} />
              <Card>
                <div className="mpwa-card-head">
                  <h3>{unread} غير مقروء</h3>
                  <button onClick={() => void markAllRead()}>تعليم الكل كمقروء</button>
                </div>
                <NotificationList items={notifications} />
              </Card>
            </>
          ) : panel === 'approvals' && canApprove ? (
            <>
              <PanelTitle title="الاعتمادات" onBack={goHome} onRefresh={() => void load()} />
              <Card>
                <div className="mpwa-card-head"><h3>بانتظار قرارك</h3><span className="mpwa-status pending">{approvals.length}</span></div>
                {approvals.length ? (
                  <div className="mpwa-list">
                    {approvals.slice(0, 30).map((a: any) => (
                      <div className="mpwa-row" key={a.id}>
                        <span className="ico"><ClipboardCheck size={16} /></span>
                        <div className="mpwa-row-main">
                          <b>{a.request_title || a.request_type || 'طلب اعتماد'}</b>
                          <span>{a.requester_name || ''} · {a.current_approver_role || `المستوى ${a.current_level}`}</span>
                        </div>
                        <div className="mpwa-row-side">
                          <button className="mpwa-btn ghost" style={{ minHeight: 32, width: 'auto', padding: '0 10px', fontSize: 10 }} onClick={() => void decide(Number(a.id), 'approved')}>اعتماد</button>
                          <button className="mpwa-btn danger" style={{ minHeight: 32, width: 'auto', padding: '0 10px', fontSize: 10 }} onClick={() => void decide(Number(a.id), 'rejected')}>رفض</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="mpwa-empty"><b>لا توجد طلبات معلّقة</b>ستظهر هنا طلبات الموظفين التي تحتاج قرارك.</div>}
              </Card>
            </>
          ) : tab === 'requests' ? (
            <>
              <div className="mpwa-card-head" style={{ padding: '2px 2px 12px' }}>
                <h3 style={{ fontSize: 18 }}>طلباتي</h3>
                <button onClick={() => setSheet('leave')}>+ طلب جديد</button>
              </div>
              <Card>
                {requestItems.length ? (
                  <div className="mpwa-list">
                    {requestItems.map((item: any) => (
                      <div className="mpwa-row" key={`${item.type}-${item.id}`}>
                        <span className="ico">
                          {item.type === 'loan' ? <Landmark size={16} /> : item.type === 'leave' ? <CalendarDays size={16} /> : item.type === 'grievance' ? <MessageSquare size={16} /> : <Lightbulb size={16} />}
                        </span>
                        <div className="mpwa-row-main">
                          <b>{item.label}</b>
                          <span>{item.sub} · {shortDate(item.created_at)}</span>
                        </div>
                        <span className={statusClass(item.workflow_status || item.status)}>{statusLabel(item.workflow_status || item.status)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mpwa-empty"><b>لا توجد طلبات بعد</b>يمكنك رفع إجازة أو سلفة أو شكوى أو مقترح من الزر أعلاه.</div>
                )}
              </Card>
            </>
          ) : tab === 'inbox' ? (
            <>
              <div className="mpwa-card-head" style={{ padding: '2px 2px 12px' }}>
                <h3 style={{ fontSize: 18 }}>الوارد</h3>
                <button onClick={() => void markAllRead()}>تعليم الكل كمقروء</button>
              </div>
              <Card>
                <NotificationList items={notifications} />
              </Card>
              {canApprove && (
                <Card>
                  <div className="mpwa-card-head"><h3>الاعتمادات المعلّقة</h3><button onClick={() => openPanel('approvals')}>عرض الكل</button></div>
                  <p className="mpwa-note">لديك {approvals.length} طلب بانتظار القرار.</p>
                </Card>
              )}
            </>
          ) : tab === 'profile' ? (
            <>
              <Card>
                <div className="mpwa-hero-row">
                  <div className="mpwa-avatar"><User size={22} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="mpwa-hero-name">{employee?.name || user?.username || '—'}</div>
                    <div className="mpwa-hero-meta">
                      {employee?.job_title || employee?.position || '—'}<br />
                      {employee?.department_name || employee?.branch_name || '—'}
                    </div>
                  </div>
                </div>
                <div className="mpwa-pills">
                  <span className="mpwa-pill teal"><ShieldCheck size={11} /> {roleLabel(user?.role)}</span>
                  <span className="mpwa-pill">#{me?.employee_id || employee?.id || '—'}</span>
                </div>
              </Card>
              {isNativeApp && biometric.available && (
                <Card className="tight">
                  <div className="mpwa-card-head"><h3>الدخول بالبصمة</h3></div>
                  <button className={`mpwa-btn ${biometric.enabled ? 'danger' : 'ghost'}`} onClick={async () => {
                    const ok = await biometric.toggle(!biometric.enabled);
                    setToast(ok
                      ? (biometric.enabled ? 'تم إيقاف الدخول بالبصمة' : 'تم تفعيل الدخول بالبصمة')
                      : 'لم يتم تأكيد البصمة — لم يتغير الإعداد');
                  }}>
                    <Fingerprint size={16} />
                    {biometric.enabled ? 'إيقاف الدخول بالبصمة' : 'تفعيل الدخول بالبصمة'}
                  </button>
                  <p className="mpwa-note" style={{ marginTop: 10 }}>
                    البصمة تحمي الوصول إلى الجهاز فقط؛ الصلاحيات تبقى محسوبة في الخادم.
                  </p>
                </Card>
              )}
              <Card>
                <div className="mpwa-card-head"><h3>التطبيق</h3></div>
                {isNativeApp ? (
                  <p className="mpwa-note">هذا هو التطبيق الأصلي المثبّت. البيانات الحساسة محفوظة في التخزين الآمن للجهاز، ولا تُخزّن كلمة المرور.</p>
                ) : installPrompt ? (
                  <button className="mpwa-btn" onClick={async () => {
                    await installPrompt.prompt();
                    await installPrompt.userChoice;
                    setInstallPrompt(null);
                  }}><Smartphone size={16} /> تثبيت تمكين على الجوال</button>
                ) : (
                  <p className="mpwa-note">للتثبيت: افتح قائمة المتصفح واختر «إضافة إلى الشاشة الرئيسية». التطبيق يعمل بالهوية نفسها ولا يخزّن كلمة المرور.</p>
                )}
                <div className="mpwa-btn-row" style={{ marginTop: 10 }}>
                  {isNativeApp ? (
                    <button className="mpwa-btn ghost" onClick={() => void Browser.open({ url: 'https://hr.restocost.shop/' })}>
                      <BriefcaseBusiness size={15} /> النسخة الكاملة
                    </button>
                  ) : (
                    <a className="mpwa-btn ghost" href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BriefcaseBusiness size={15} /> النسخة الكاملة
                    </a>
                  )}
                  <button className="mpwa-btn ghost" onClick={() => void load()}><RefreshCw size={15} /> تحديث البيانات</button>
                </div>
              </Card>
              <button className="mpwa-btn danger" onClick={logout}><LogOut size={16} /> تسجيل الخروج</button>
            </>
          ) : (
            <>
              <div className="mpwa-greeting">
                <b>مرحباً، {employee?.name?.split(' ')[0] || user?.username || ''}</b>
                <span>{today.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>

              <Card className="mpwa-hero">
                <div className="mpwa-hero-row">
                  <div className="mpwa-avatar">{employee?.name?.[0] || 'م'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="mpwa-hero-name">{employee?.name || user?.username || '—'}</div>
                    <div className="mpwa-hero-meta">{employee?.job_title || employee?.position || 'موظف'} · {employee?.branch_name || 'الفرع الرئيسي'}</div>
                  </div>
                </div>
                <div className="mpwa-pills">
                  <span className="mpwa-pill teal">{employee?.is_saudi ? 'مواطن سعودي' : 'مقيم'}</span>
                  <span className="mpwa-pill">الرقم الوظيفي #{me?.employee_id || employee?.id || '—'}</span>
                </div>
              </Card>

              {latestPayroll && (
                <Card className="tight">
                  <div className="mpwa-card-head" style={{ marginBottom: 6 }}>
                    <h3>آخر كشف راتب</h3>
                    <button onClick={() => openPanel('payslip')}>التفاصيل</button>
                  </div>
                  <div className="mpwa-salary">
                    <b>{money(latestPayroll.net_salary)}</b><small>ر.س · {Number(latestPayroll.month)}/{Number(latestPayroll.year)}</small>
                  </div>
                </Card>
              )}

              <Card>
                <div className="mpwa-card-head"><h3>الخدمات السريعة</h3></div>
                <div className="mpwa-grid">
                  <Action icon={<Fingerprint size={18} />} label="بوابة التواجد" sub="دخول وخروج بعيّنة واحدة" tone="teal" onClick={() => openPanel('presence')} />
                  <Action icon={<Wallet size={18} />} label="كشف الراتب" sub="الشهر الحالي" onClick={() => openPanel('payslip')} />
                  <Action icon={<CalendarDays size={18} />} label="إجازة جديدة" sub="طلب سنوي أو بديل" tone="teal" onClick={() => setSheet('leave')} />
                  <Action icon={<Landmark size={18} />} label="طلب سلفة" sub="تقديم واعتماد" tone="teal" onClick={() => setSheet('loan')} />
                  <Action icon={<FileText size={18} />} label="طلباتي" sub={`${requestItems.length} طلب`} onClick={() => setTab('requests')} />
                  <Action icon={<ClipboardCheck size={18} />} label="الدورة السنوية" sub="الذكرى والزيادة" tone="coral" onClick={() => openPanel('annual')} />
                  <Action icon={<MessageSquare size={18} />} label="شكوى أو مقترح" sub="صوت الموظف" onClick={() => setSheet('grievance')} />
                  {canApprove && (
                    <Action icon={<Check size={18} />} label="الاعتمادات" sub={`${approvals.length} معلّق`} tone="coral" onClick={() => openPanel('approvals')} />
                  )}
                  <Action icon={<Bell size={18} />} label="التنبيهات" sub={`${unread} غير مقروء`} onClick={() => openPanel('notifications')} />
                </div>
              </Card>

              {annual?.anniversary && (
                <Card className="tight">
                  <div className="mpwa-card-head" style={{ marginBottom: 6 }}>
                    <h3>الدورة السنوية</h3>
                    <button onClick={() => openPanel('annual')}>عرض</button>
                  </div>
                  <p className="mpwa-note">الذكرى القادمة: {shortDate(annual.anniversary)} — تنبيه قبل شهر: {annual.reminder_date ? shortDate(annual.reminder_date) : 'غير محدد'}</p>
                </Card>
              )}

              <Card>
                <div className="mpwa-card-head">
                  <h3>آخر تنبيه</h3>
                  <button onClick={() => openPanel('notifications')}>الكل</button>
                </div>
                <NotificationList items={notifications.slice(0, 2)} compact />
              </Card>
            </>
          )}
        </main>
      </div>

      {sheet && (
        <RequestSheet
          type={sheet}
          employeeId={me?.employee_id || employee?.id}
          onClose={() => setSheet(null)}
          onDone={async message => {
            setSheet(null);
            setToast(message);
            await load();
          }}
        />
      )}
      <Toast text={toast} />
      {tabs}
    </div>
  );
}

function roleLabel(role?: string) {
  const map: Record<string, string> = {
    admin: 'مدير النظام', hr_manager: 'مدير الموارد البشرية', finance: 'المالية',
    branch_manager: 'مدير الفرع', employee_ess: 'خدمة ذاتية للموظف',
  };
  return map[String(role || '')] || role || 'مستخدم';
}

function Action({ icon, label, sub, tone, onClick }: {
  icon: ReactNode; label: string; sub: string; tone?: 'teal' | 'coral'; onClick: () => void;
}) {
  return (
    <button className={`mpwa-action ${tone || ''}`} onClick={onClick}>
      <span className="ico">{icon}</span>
      <span><b>{label}</b><small>{sub}</small></span>
    </button>
  );
}

function PanelTitle({ title, onBack, onRefresh }: { title: string; onBack: () => void; onRefresh: () => void }) {
  return (
    <div className="mpwa-card-head" style={{ padding: '2px 2px 12px' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--blue)' }}>
        <ChevronLeft size={16} /> رجوع
      </button>
      <h3 style={{ fontSize: 17 }}>{title}</h3>
      <button onClick={onRefresh} aria-label="تحديث"><RefreshCw size={15} /></button>
    </div>
  );
}

function NotificationList({ items, compact = false }: { items: any[]; compact?: boolean }) {
  if (!items.length) return <div className="mpwa-empty"><b>لا توجد تنبيهات</b>ستظهر هنا تحديثات الطلبات والاعتمادات.</div>;
  return (
    <div className="mpwa-list">
      {(compact ? items.slice(0, 3) : items).map((n: any) => (
        <div className="mpwa-row" key={n.id} style={n.is_read ? { opacity: .65 } : undefined}>
          <span className="ico"><Bell size={15} /></span>
          <div className="mpwa-row-main">
            <b>{n.title || 'تنبيه'}</b>
            <span>{n.message || ''} · {shortDate(n.created_at)}</span>
          </div>
          {!n.is_read && <span className="mpwa-status pending">جديد</span>}
        </div>
      ))}
    </div>
  );
}

const REQUEST_LABELS: Record<RequestType, string> = {
  leave: 'إجازة', loan: 'سلفة', grievance: 'شكوى إدارية',
  suggestion: 'مقترح', workflow_improvement: 'مقترح تطوير سير العمل',
};

function RequestSheet({ type, employeeId, onClose, onDone }: {
  type: RequestType; employeeId?: number; onClose: () => void; onDone: (message: string) => void;
}) {
  const [kind, setKind] = useState<RequestType>(type);
  const [form, setForm] = useState<Record<string, any>>({
    leave_type: 'annual',
    category: kind === 'grievance' ? 'work_environment' : 'operations',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload: Record<string, any> = { type: kind, title: form.title || '', details: form.details || '' };
      if (employeeId) payload.employee_id = employeeId;
      if (kind === 'leave') {
        payload.start_date = form.start_date;
        payload.end_date = form.end_date;
        payload.leave_type = form.leave_type;
      } else if (kind === 'loan') {
        payload.total_amount = Number(form.total_amount || 0);
        payload.monthly_installment = Number(form.monthly_installment || 0);
        if (form.deduction_start_month) payload.deduction_start_month = Number(form.deduction_start_month);
        if (form.deduction_start_year) payload.deduction_start_year = Number(form.deduction_start_year);
        if (form.deduction_months) payload.deduction_months = Number(form.deduction_months);
      } else if (kind === 'grievance') {
        payload.category = form.category;
        payload.is_confidential = !!form.is_confidential;
      } else {
        payload.category = form.category;
        payload.expected_impact = form.expected_impact || '';
      }
      const data = await api<any>('/api/ess/requests', { method: 'POST', body: JSON.stringify(payload) });
      onDone(data?.message || `تم رفع ${REQUEST_LABELS[kind]} بنجاح`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mpwa-sheet" role="dialog" aria-modal="true" aria-label={`طلب جديد: ${REQUEST_LABELS[kind]}`}>
      <div className="mpwa-sheet-panel">
        <div className="mpwa-sheet-head">
          <b>طلب جديد</b>
          <button onClick={onClose} aria-label="إغلاق"><X size={17} /></button>
        </div>
        <form onSubmit={submit}>
          {error && <div className="mpwa-error">{error}</div>}
          <div className="mpwa-field">
            <label>نوع الطلب</label>
            <select className="mpwa-select" value={kind} onChange={e => setKind(e.target.value as RequestType)}>
              {(Object.keys(REQUEST_LABELS) as RequestType[]).map(key => <option key={key} value={key}>{REQUEST_LABELS[key]}</option>)}
            </select>
          </div>

          {kind === 'leave' && (
            <>
              <div className="mpwa-field">
                <label>نوع الإجازة</label>
                <select className="mpwa-select" value={form.leave_type} onChange={e => set('leave_type', e.target.value)}>
                  <option value="annual">سنوية</option>
                  <option value="sick">مرضية</option>
                  <option value="unpaid">بدون راتب</option>
                  <option value="hajj">حج</option>
                  <option value="maternity">أمومة</option>
                </select>
              </div>
              <div className="mpwa-btn-row">
                <div className="mpwa-field">
                  <label>من</label>
                  <input className="mpwa-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
                </div>
                <div className="mpwa-field">
                  <label>إلى</label>
                  <input className="mpwa-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} required />
                </div>
              </div>
              <div className="mpwa-field">
                <label>السبب (اختياري)</label>
                <input className="mpwa-input" value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="مثال: زيارة عائلية" />
              </div>
            </>
          )}

          {kind === 'loan' && (
            <>
              <div className="mpwa-field">
                <label>قيمة السلفة (ر.س)</label>
                <input className="mpwa-input" type="number" min="1" value={form.total_amount || ''} onChange={e => set('total_amount', e.target.value)} required />
              </div>
              <div className="mpwa-field">
                <label>الخصم الشهري (ر.س)</label>
                <input className="mpwa-input" type="number" min="1" value={form.monthly_installment || ''} onChange={e => set('monthly_installment', e.target.value)} required />
              </div>
              <div className="mpwa-btn-row">
                <div className="mpwa-field">
                  <label>شهر البداية</label>
                  <input className="mpwa-input" type="number" min="1" max="12" value={form.deduction_start_month || ''} onChange={e => set('deduction_start_month', e.target.value)} placeholder="اختياري" />
                </div>
                <div className="mpwa-field">
                  <label>سنة البداية</label>
                  <input className="mpwa-input" type="number" min="2020" value={form.deduction_start_year || ''} onChange={e => set('deduction_start_year', e.target.value)} placeholder="اختياري" />
                </div>
              </div>
              <div className="mpwa-field">
                <label>عدد أشهر الخصم</label>
                <input className="mpwa-input" type="number" min="1" value={form.deduction_months || ''} onChange={e => set('deduction_months', e.target.value)} placeholder="اختياري" />
              </div>
            </>
          )}

          {kind === 'grievance' && (
            <>
              <div className="mpwa-field">
                <label>موضوع الشكوى</label>
                <input className="mpwa-input" value={form.title || ''} onChange={e => set('title', e.target.value)} required />
              </div>
              <div className="mpwa-field">
                <label>التصنيف</label>
                <select className="mpwa-select" value={form.category} onChange={e => set('category', e.target.value)}>
                  <option value="work_environment">بيئة العمل</option>
                  <option value="salary">الراتب</option>
                  <option value="management">الإدارة</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
              <div className="mpwa-field">
                <label>التفاصيل</label>
                <textarea className="mpwa-textarea" value={form.details || ''} onChange={e => set('details', e.target.value)} required />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 14 }}>
                <input type="checkbox" checked={!!form.is_confidential} onChange={e => set('is_confidential', e.target.checked)} />
                طلب سريّة الهوية
              </label>
            </>
          )}

          {(kind === 'suggestion' || kind === 'workflow_improvement') && (
            <>
              <div className="mpwa-field">
                <label>عنوان المقترح</label>
                <input className="mpwa-input" value={form.title || ''} onChange={e => set('title', e.target.value)} required />
              </div>
              <div className="mpwa-field">
                <label>التفاصيل</label>
                <textarea className="mpwa-textarea" value={form.details || ''} onChange={e => set('details', e.target.value)} required />
              </div>
              <div className="mpwa-field">
                <label>الأثر المتوقع (اختياري)</label>
                <input className="mpwa-input" value={form.expected_impact || ''} onChange={e => set('expected_impact', e.target.value)} />
              </div>
            </>
          )}

          <button className="mpwa-btn" type="submit" disabled={busy}>
            {busy ? <span className="mpwa-spinner" /> : <Check size={16} />}
            {busy ? 'جارٍ الرفع…' : `رفع ${REQUEST_LABELS[kind]}`}
          </button>
        </form>
      </div>
    </div>
  );
}

function MobilePwaInner() {
  const { user, isLoading } = useAuth();
  const loggedIn = !!user;

  // شاشة الدخول/التسجيل ليلية دائماً على /m؛ بعد الدخول يعود الوضع المحفوظ للمستخدم.
  useEffect(() => {
    const root = document.documentElement;
    const saved = localStorage.getItem('app_theme');
    const night = loggedIn
      ? (saved ? saved === 'night' : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
      : true;
    root.classList.toggle('dark', night);
    root.setAttribute('data-theme', night ? 'night' : 'day');
  }, [loggedIn]);

  if (isLoading) {
    return <div className="mpwa" dir="rtl"><div className="mpwa-login"><div className="mpwa-skeleton" style={{ height: 180 }} /></div></div>;
  }
  if (!user) return <MobileLogin />;
  return <MobileShell />;
}

export default function MobilePwa() {
  return (
    <NativeLock>
      <OfflineBanner />
      <MobilePwaInner />
    </NativeLock>
  );
}
