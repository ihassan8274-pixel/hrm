import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Search, ShieldCheck, UserCog, X, Copy, Check, AlertTriangle, Inbox } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Btn, inputCls } from './ui';

interface AccountRow {
  id: number;
  username: string;
  role: string;
  status: string;
  email: string | null;
  entity_id: number | null;
  employee_id: number | null;
  must_change_password: number;
  entity_name: string | null;
  employee_name: string | null;
}

interface EntityOption { id: number; name_ar: string }
interface EmployeeOption { id: number; name: string }

interface SignupRequestRow {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  username: string;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface PasswordResetRequestRow {
  id: number;
  user_id: number;
  username: string;
  contact_email: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  account_status: string | null;
}

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'مدير النظام' },
  { value: 'hr_manager', label: 'مدير موارد بشرية' },
  { value: 'finance', label: 'مالية' },
  { value: 'branch_manager', label: 'مدير فرع' },
  { value: 'employee_ess', label: 'موظف — خدمة ذاتية' },
];

const roleLabel = (value: string) => ROLES.find((r) => r.value === value)?.label ?? value;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const suggestPassword = () => {
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
};

const emptyDraft = { username: '', password: '', role: 'employee_ess', entity_id: '', employee_id: '', email: '' };

export default function UsersView() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ role: '', status: '', entity_id: '', employee_id: '', email: '' });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState<SignupRequestRow[]>([]);
  const [requestRole, setRequestRole] = useState<Record<number, string>>({});
  const [requestBusy, setRequestBusy] = useState<number | null>(null);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequestRow[]>([]);
  const [resetBusy, setResetBusy] = useState<number | null>(null);

  const loadRequests = () => {
    fetch('/api/auth/signup-requests')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRequests(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const loadResetRequests = () => {
    fetch('/api/auth/password-reset-requests')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setResetRequests(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const load = () => {
    fetch('/api/auth/users')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setNotice({ kind: 'err', text: 'تعذّر تحميل الحسابات' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    loadRequests();
    loadResetRequests();
    fetch('/api/entities').then((r) => (r.ok ? r.json() : [])).then((d) => setEntities(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/employees').then((r) => (r.ok ? r.json() : [])).then((d) => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.username, r.employee_name, r.email, roleLabel(r.role)].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    suspended: rows.filter((r) => r.status !== 'active').length,
    admins: rows.filter((r) => r.role === 'admin' && r.status === 'active').length,
    pending: rows.filter((r) => r.must_change_password === 1).length,
  }), [rows]);

  const send = async (url: string, method: string, body: unknown) => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'تعذّر تنفيذ الطلب');
    return data;
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId(-1);
    setNotice(null);
    try {
      await send('/api/auth/register', 'POST', {
        username: draft.username.trim(),
        password: draft.password,
        role: draft.role,
        entity_id: draft.entity_id ? Number(draft.entity_id) : undefined,
        employee_id: draft.employee_id ? Number(draft.employee_id) : undefined,
        email: draft.email.trim() || undefined,
      });
      setNotice({ kind: 'ok', text: `تم إنشاء الحساب «${draft.username.trim()}» — سيُطلب منه تغيير كلمة المرور عند أول دخول` });
      setIssued({ username: draft.username.trim(), password: draft.password });
      setDraft({ ...emptyDraft });
      setCreating(false);
      load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (row: AccountRow) => {
    setEditingId(row.id);
    setEdit({
      role: row.role,
      status: row.status,
      entity_id: row.entity_id ? String(row.entity_id) : '',
      employee_id: row.employee_id ? String(row.employee_id) : '',
      email: row.email || '',
    });
  };

  const saveEdit = async (id: number) => {
    setBusyId(id);
    setNotice(null);
    try {
      await send(`/api/auth/users/${id}`, 'PUT', {
        role: edit.role,
        status: edit.status,
        entity_id: edit.entity_id ? Number(edit.entity_id) : null,
        employee_id: edit.employee_id ? Number(edit.employee_id) : null,
      });
      await send(`/api/auth/users/${id}/email`, 'PUT', { email: edit.email.trim() });
      setNotice({ kind: 'ok', text: 'تم حفظ بيانات الحساب' });
      setEditingId(null);
      load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (row: AccountRow) => {
    if (!confirm(`إعادة تعيين كلمة مرور «${row.username}»؟ الجلسة الحالية للحساب هتتقفل وهيضطر يغيّرها عند أول دخول.`)) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      const data = await send(`/api/auth/users/${row.id}/password`, 'PUT', {});
      setIssued({ username: row.username, password: data.password });
      setCopied(false);
      setNotice({ kind: 'ok', text: 'تمت إعادة التعيين — سلّم القيمة التالية لصاحب الحساب مرة واحدة' });
      load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (row: AccountRow) => {
    const next = row.status === 'active' ? 'suspended' : 'active';
    setBusyId(row.id);
    setNotice(null);
    try {
      await send(`/api/auth/users/${row.id}`, 'PUT', { status: next });
      setNotice({ kind: 'ok', text: next === 'active' ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب — لن يستطيع الدخول' });
      load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const copyIssued = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(`${issued.username}\n${issued.password}`);
      setCopied(true);
    } catch {
      setNotice({ kind: 'err', text: 'المتصفح منع النسخ — انسخ القيمة يدويًا' });
    }
  };

  const decideRequest = async (row: SignupRequestRow, action: 'approve' | 'reject') => {
    if (action === 'reject' && !confirm(`رفض طلب التسجيل لـ «${row.full_name}»؟`)) return;
    if (action === 'approve' && !confirm(`اعتماد طلب «${row.full_name}» وإنشاء حساب بصلاحية ${roleLabel(requestRole[row.id] || 'employee_ess')}؟`)) return;
    setRequestBusy(row.id);
    setNotice(null);
    try {
      await send(`/api/auth/signup-requests/${row.id}/${action}`, 'POST',
        action === 'approve' ? { role: requestRole[row.id] || 'employee_ess' } : {});
      setNotice({
        kind: 'ok',
        text: action === 'approve'
          ? `تم اعتماد الطلب وإنشاء حساب «${row.username}» — سيُطلب تغيير كلمة المرور عند أول دخول`
          : `تم رفض طلب «${row.full_name}»`,
      });
      loadRequests();
      if (action === 'approve') load();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setRequestBusy(null);
    }
  };

  const issueResetPassword = async (row: PasswordResetRequestRow) => {
    const message = `إصدار كلمة مرور مؤقتة للمستخدم «${row.username}»؟ سيُطلب منه تغييرها عند أول دخول، وتُبطل جلساته الحالية.`;
    if (!confirm(message)) return;
    setResetBusy(row.id);
    setNotice(null);
    try {
      // The existing admin-only route is the single place that hashes a new
      // credential, revokes sessions and forces a password change. Closing the
      // request here only records the decision — it never invents a credential.
      const result = await send(`/api/auth/users/${row.user_id}/password`, 'PUT', {});
      await send(`/api/auth/password-reset-requests/${row.id}/resolve`, 'POST', {
        review_note: 'تم إصدار كلمة مرور مؤقتة وتسليمها للمدير',
      });
      setIssued({ username: row.username, password: String(result?.password || '') });
      setCopied(false);
      setNotice({ kind: 'ok', text: `تم إصدار كلمة مرور مؤقتة لـ «${row.username}» — انسخها الآن، لا ستظهر مرة أخرى.` });
      loadResetRequests();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setResetBusy(null);
    }
  };

  const rejectResetRequest = async (row: PasswordResetRequestRow) => {
    if (!confirm(`رفض طلب استعادة كلمة المرور للمستخدم «${row.username}»؟`)) return;
    setResetBusy(row.id);
    setNotice(null);
    try {
      await send(`/api/auth/password-reset-requests/${row.id}/reject`, 'POST', { review_note: 'مرفوض من المدير' });
      setNotice({ kind: 'ok', text: `تم رفض طلب «${row.username}» دون تغيير كلمة المرور.` });
      loadResetRequests();
    } catch (err) {
      setNotice({ kind: 'err', text: (err as Error).message });
    } finally {
      setResetBusy(null);
    }
  };

  const labelCls = 'block text-xs font-black text-slate-600 mb-1';
  const thCls = 'px-3 py-3 text-right text-xs font-black text-slate-500 whitespace-nowrap';
  const tdCls = 'px-3 py-3 text-sm text-slate-700 align-middle';

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-black text-navy-800 flex items-center gap-2">
            <UserCog className="w-7 h-7 text-brand-600" />
            إدارة المستخدمين
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            حسابات الدخول للنظام: الدور، الحالة، الربط بالكيان والموظف، وكلمة المرور.
          </p>
        </div>
        <Btn onClick={() => { setCreating((v) => !v); setNotice(null); }}>
          {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {creating ? 'إلغاء' : 'حساب جديد'}
        </Btn>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: 'إجمالي الحسابات', value: stats.total },
          { label: 'نشط', value: stats.active },
          { label: 'موقوف', value: stats.suspended },
          { label: 'مدير نشط', value: stats.admins },
          { label: 'بانتظار تغيير كلمة المرور', value: stats.pending },
        ].map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            {s.label}
            <b className="text-navy-800 text-sm">{s.value}</b>
          </span>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-start gap-2 ${
            notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {notice.kind === 'ok' ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {issued && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <KeyRound className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              <div>
                <p className="font-black text-amber-900">بيانات دخول «{issued.username}»</p>
                <p className="text-xs text-amber-800 mt-1">
                  تُعرض مرة واحدة فقط. سلّمها لصاحب الحساب عبر قناة آمنة، وهيُطلب منه تغييرها عند أول دخول.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setIssued(null); setCopied(false); }}
              className="text-amber-700 hover:text-amber-900 rounded-lg p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
              aria-label="إغلاق بيانات الدخول"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="flex-1 min-w-48 rounded-xl border border-amber-300 bg-white px-3 py-2 font-mono text-sm text-navy-800 select-all">
              {issued.password}
            </code>
            <Btn variant="secondary" onClick={copyIssued}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'تم النسخ' : 'نسخ'}
            </Btn>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <Inbox className="w-5 h-5 text-brand-600" />
          <h2 className="font-black text-navy-800">طلبات التسجيل</h2>
          <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">
            {requests.filter((r) => r.status === 'pending').length} بانتظار المراجعة
          </span>
          <span className="text-xs text-slate-500">الطلب لا ينشئ حساباً إلا بعد اعتمادك — الدور الافتراضي: خدمة ذاتية.</span>
        </div>
        {requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">لا توجد طلبات تسجيل حالياً.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-shell-100">
                <tr>
                  <th className={thCls}>مقدم الطلب</th>
                  <th className={thCls}>اسم المستخدم</th>
                  <th className={thCls}>البريد / الجوال</th>
                  <th className={thCls}>التاريخ</th>
                  <th className={thCls}>الحالة</th>
                  <th className={thCls}>الدور عند الاعتماد</th>
                  <th className={thCls}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => {
                  const pending = row.status === 'pending';
                  const busy = requestBusy === row.id;
                  return (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-shell-50">
                      <td className={tdCls}>
                        <span className="font-bold text-navy-800 block">{row.full_name}</span>
                        <span className="text-[11px] text-slate-400">#{row.id}</span>
                      </td>
                      <td className={tdCls}><span dir="ltr" className="font-mono text-xs">{row.username}</span></td>
                      <td className={tdCls}>
                        <span dir="ltr" className="text-xs block">{row.email}</span>
                        <span dir="ltr" className="text-[11px] text-slate-500">{row.phone}</span>
                      </td>
                      <td className={tdCls}><span className="text-[11px] text-slate-500">{new Date(row.created_at).toLocaleDateString('ar-SA')}</span></td>
                      <td className={tdCls}>
                        <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                          pending ? 'bg-amber-50 text-amber-700' : row.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {pending ? 'قيد المراجعة' : row.status === 'approved' ? 'معتمد' : 'مرفوض'}
                        </span>
                        {row.review_note && <span className="block text-[10px] text-slate-500 mt-1">{row.review_note}</span>}
                      </td>
                      <td className={tdCls}>
                        {pending ? (
                          <select
                            className={inputCls}
                            aria-label={`دور اعتماد ${row.username}`}
                            value={requestRole[row.id] || 'employee_ess'}
                            onChange={(e) => setRequestRole((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          >
                            {ROLES.filter((r) => r.value !== 'admin').map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className={tdCls}>
                        {pending ? (
                          <div className="flex gap-2">
                            <Btn loading={busy} loadingText="..." onClick={() => decideRequest(row, 'approve')}>اعتماد</Btn>
                            <Btn variant="ghost" disabled={busy} onClick={() => decideRequest(row, 'reject')}>رفض</Btn>
                          </div>
                        ) : <span className="text-xs text-slate-400">تمت المراجعة</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <KeyRound className="w-5 h-5 text-brand-600" />
          <h2 className="font-black text-navy-800">طلبات استعادة كلمة المرور</h2>
          <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">
            {resetRequests.filter((r) => r.status === 'pending').length} بانتظار المراجعة
          </span>
          <span className="text-xs text-slate-500">الطلب لا يكشف وجود الحساب ولا يمنح جلسة — أنت من يصدر كلمة المرور المؤقتة.</span>
        </div>
        {resetRequests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">لا توجد طلبات استعادة حالياً.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-shell-100">
                <tr>
                  <th className={thCls}>اسم المستخدم</th>
                  <th className={thCls}>البريد المسجل</th>
                  <th className={thCls}>حالة الحساب</th>
                  <th className={thCls}>التاريخ</th>
                  <th className={thCls}>الحالة</th>
                  <th className={thCls}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {resetRequests.map((row) => {
                  const pending = row.status === 'pending';
                  const busy = resetBusy === row.id;
                  return (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-shell-50">
                      <td className={tdCls}>
                        <span dir="ltr" className="font-mono text-xs">{row.username}</span>
                        <span className="block text-[11px] text-slate-400">#{row.id} · مستخدم #{row.user_id}</span>
                      </td>
                      <td className={tdCls}><span dir="ltr" className="text-xs">{row.contact_email}</span></td>
                      <td className={tdCls}>
                        <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                          row.account_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {row.account_status === 'active' ? 'نشط' : row.account_status || 'غير معروف'}
                        </span>
                      </td>
                      <td className={tdCls}><span className="text-[11px] text-slate-500">{new Date(row.created_at).toLocaleDateString('ar-SA')}</span></td>
                      <td className={tdCls}>
                        <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                          pending ? 'bg-amber-50 text-amber-700' : row.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {pending ? 'قيد المراجعة' : row.status === 'resolved' ? 'تمت الاستعادة' : 'مرفوض'}
                        </span>
                        {row.review_note && <span className="mt-1 block text-[10px] text-slate-500">{row.review_note}</span>}
                      </td>
                      <td className={tdCls}>
                        {pending ? (
                          <div className="flex gap-2">
                            <Btn loading={busy} loadingText="..." onClick={() => issueResetPassword(row)}>إصدار مؤقتة</Btn>
                            <Btn variant="ghost" disabled={busy} onClick={() => rejectResetRequest(row)}>رفض</Btn>
                          </div>
                        ) : <span className="text-xs text-slate-400">تمت المراجعة</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <form onSubmit={createAccount} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-black text-navy-800">حساب جديد</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="new-username" className={labelCls}>اسم المستخدم</label>
              <input id="new-username" dir="ltr" className={inputCls} value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })} required minLength={3} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="new-password" className={labelCls}>كلمة المرور المؤقتة</label>
              <div className="flex gap-2">
                <input id="new-password" dir="ltr" className={inputCls} value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })} required minLength={8} autoComplete="new-password" />
                <Btn type="button" variant="secondary" onClick={() => setDraft({ ...draft, password: suggestPassword() })}>
                  توليد
                </Btn>
              </div>
            </div>
            <div>
              <label htmlFor="new-role" className={labelCls}>الدور</label>
              <select id="new-role" className={inputCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="new-entity" className={labelCls}>الكيان (اختياري)</label>
              <select id="new-entity" className={inputCls} value={draft.entity_id} onChange={(e) => setDraft({ ...draft, entity_id: e.target.value })}>
                <option value="">بدون ربط</option>
                {entities.map((en) => <option key={en.id} value={en.id}>{en.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="new-employee" className={labelCls}>الموظف (اختياري)</label>
              <select id="new-employee" className={inputCls} value={draft.employee_id} onChange={(e) => setDraft({ ...draft, employee_id: e.target.value })}>
                <option value="">بدون ربط</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="new-email" className={labelCls}>البريد الإلكتروني (اختياري)</label>
              <input id="new-email" dir="ltr" type="email" className={inputCls} value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })} autoComplete="off" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            الحساب الجديد هيبدأ بكلمة مرور مؤقتة، والنظام هيطلب منه تغييرها فور أول دخول.
          </p>
          <div className="flex gap-2">
            <Btn type="submit" loading={busyId === -1} loadingText="جارٍ الإنشاء">إنشاء الحساب</Btn>
            <Btn type="button" variant="ghost" onClick={() => { setCreating(false); setDraft({ ...emptyDraft }); }}>إلغاء</Btn>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className={`${inputCls} pr-10`}
              placeholder="ابحث باسم المستخدم أو الموظف أو البريد"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="بحث في الحسابات"
            />
          </div>
          <span className="text-xs font-bold text-slate-500">{visible.length} من {rows.length}</span>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-500">جارٍ تحميل الحسابات…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">مفيش حسابات مطابقة للبحث.</p>
        ) : (
          <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="bg-shell-100 sticky top-0 z-10">
                <tr>
                  <th className={thCls}>الحساب</th>
                  <th className={thCls}>الدور</th>
                  <th className={thCls}>الحالة</th>
                  <th className={thCls}>الكيان</th>
                  <th className={thCls}>الموظف</th>
                  <th className={thCls}>البريد</th>
                  <th className={thCls}>كلمة المرور</th>
                  <th className={thCls}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isSelf = row.id === user?.id;
                  const isEditing = editingId === row.id;
                  return (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-shell-50">
                      <td className={tdCls}>
                        <span dir="ltr" className="font-bold text-navy-800 block">{row.username}</span>
                        {isSelf && <span className="text-[11px] text-brand-700 font-bold">حسابك الحالي</span>}
                      </td>
                      <td className={tdCls}>
                        {isEditing ? (
                          <select className={inputCls} value={edit.role} aria-label={`دور ${row.username}`}
                            onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">
                            {row.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5" />}
                            {roleLabel(row.role)}
                          </span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {isEditing ? (
                          <select className={inputCls} value={edit.status} aria-label={`حالة ${row.username}`}
                            onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                            <option value="active">نشط</option>
                            <option value="suspended">موقوف</option>
                          </select>
                        ) : (
                          <span className={`rounded-lg px-2 py-1 text-xs font-bold ${
                            row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {row.status === 'active' ? 'نشط' : 'موقوف'}
                          </span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {isEditing ? (
                          <select className={inputCls} value={edit.entity_id} aria-label={`كيان ${row.username}`}
                            onChange={(e) => setEdit({ ...edit, entity_id: e.target.value })}>
                            <option value="">بدون ربط</option>
                            {entities.map((en) => <option key={en.id} value={en.id}>{en.name_ar}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs">{row.entity_name || '—'}</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {isEditing ? (
                          <select className={inputCls} value={edit.employee_id} aria-label={`موظف ${row.username}`}
                            onChange={(e) => setEdit({ ...edit, employee_id: e.target.value })}>
                            <option value="">بدون ربط</option>
                            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs">{row.employee_name || '—'}</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {isEditing ? (
                          <input dir="ltr" type="email" className={inputCls} value={edit.email}
                            aria-label={`بريد ${row.username}`} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                        ) : (
                          <span dir="ltr" className="text-xs text-slate-500 block max-w-44 truncate">{row.email || '—'}</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {row.must_change_password === 1
                          ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">مؤقتة</span>
                          : <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">مُغيّرة</span>}
                      </td>
                      <td className={tdCls}>
                        <div className="flex flex-wrap gap-1.5">
                          {isEditing ? (
                            <>
                              <Btn className="px-3 py-1.5 text-xs" loading={busyId === row.id} loadingText="جارٍ الحفظ"
                                onClick={() => saveEdit(row.id)}>حفظ</Btn>
                              <Btn variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditingId(null)}>إلغاء</Btn>
                            </>
                          ) : (
                            <>
                              <Btn variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => startEdit(row)}>تعديل</Btn>
                              <Btn variant="secondary" className="px-3 py-1.5 text-xs" loading={busyId === row.id}
                                onClick={() => resetPassword(row)}>
                                <KeyRound className="w-3.5 h-3.5" />
                                كلمة المرور
                              </Btn>
                              <Btn
                                variant={row.status === 'active' ? 'danger' : 'secondary'}
                                className="px-3 py-1.5 text-xs"
                                disabled={isSelf}
                                title={isSelf ? 'لا يمكنك إيقاف حسابك الحالي' : undefined}
                                onClick={() => toggleStatus(row)}
                              >
                                {row.status === 'active' ? 'إيقاف' : 'تفعيل'}
                              </Btn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        الإيقاف بيمنع الدخول فورًا لأن كل طلب بيتحقق من حالة الحساب. إعادة تعيين كلمة المرور بتقفل جلسات الحساب
        وبتفعّل التغيير الإجباري عند أول دخول. تعديل دورك أو إيقاف حسابك الحالي غير مسموح، ولازم يفضل حساب مدير نشط واحد على الأقل.
      </p>
    </div>
  );
}