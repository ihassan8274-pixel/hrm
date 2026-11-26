import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Network } from 'lucide-react';
import { policyLabel, presenceRequest, rowsOf } from '../lib/presence';

const panelCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm';
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm';
const btnCls = 'px-4 py-2 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50';

type UserRow = { id: number; username?: string; name?: string; role?: string; employee_id?: number | null };
type BranchRow = { id: number; name: string };
type PolicyRow = { user_id: number; username?: string; name?: string; policy: string; ttl_minutes?: number; updated_at?: string };
type ScopeRow = { user_id: number; branch_id: number; username?: string; name?: string; branch_name?: string; is_primary?: boolean | number };

const POLICIES = ['open', 'branch_bound', 'branch_scoped', 'system_admin'];

export default function PresencePoliciesView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [policy, setPolicy] = useState({ user_id: '', policy: 'open', ttl_minutes: '10' });
  const [scopeUser, setScopeUser] = useState('');
  const [scopeBranches, setScopeBranches] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const [u, b, p, s] = await Promise.all([
        presenceRequest<any>('/api/presence/users'),
        presenceRequest<any>('/api/branches'),
        presenceRequest<any>('/api/presence/policies'),
        presenceRequest<any>('/api/presence/scopes'),
      ]);
      setUsers(rowsOf<UserRow>(u, 'users'));
      setBranches(rowsOf<BranchRow>(b, 'branches'));
      setPolicies(rowsOf<PolicyRow>(p, 'policies'));
      setScopes(rowsOf<ScopeRow>(s, 'scopes'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const userName = (id: number) => {
    const u = users.find(x => Number(x.id) === Number(id));
    return u?.name || u?.username || `#${id}`;
  };

  const savePolicy = async () => {
    if (!policy.user_id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await presenceRequest('/api/presence/policies', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(policy.user_id),
          policy: policy.policy,
          ttl_minutes: Number(policy.ttl_minutes) || 10,
        }),
      });
      setNotice('تم حفظ السياسة.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const saveScopes = async () => {
    if (!scopeUser) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await presenceRequest('/api/presence/scopes', {
        method: 'POST',
        body: JSON.stringify({ user_id: Number(scopeUser), branch_ids: scopeBranches }),
      });
      setNotice('تم تحديث نطاق الفروع.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const toggleBranch = (id: number) => setScopeBranches(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">سياسات التواجد ونطاق الفروع</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            الافتراض مفتوح (fail-open). التقييد استثناء صريح: <b>branch_bound</b> و<b>branch_scoped</b> فقط.
          </p>
        </div>
        <button onClick={() => void load()} className={btnCls}><RefreshCw className="w-4 h-4 inline" /> تحديث</button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={panelCls}>
          <div className="flex items-center gap-2 mb-5"><ShieldCheck className="w-5 h-5 text-brand-600" /><h2 className="font-bold">إسناد سياسة</h2></div>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500">المستخدم</label>
            <select className={inputCls} value={policy.user_id} onChange={e => setPolicy({ ...policy, user_id: e.target.value })}>
              <option value="">— اختر مستخدماً —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name || u.username} · {u.role || ''}</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-500">السياسة</label>
            <select className={inputCls} value={policy.policy} onChange={e => setPolicy({ ...policy, policy: e.target.value })}>
              {POLICIES.map(p => <option key={p} value={p}>{policyLabel(p)} ({p})</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-500">مدة التصريح (دقائق)</label>
            <input type="number" min="1" max="60" className={inputCls} value={policy.ttl_minutes}
              onChange={e => setPolicy({ ...policy, ttl_minutes: e.target.value })} />
            <button onClick={() => void savePolicy()} disabled={busy || !policy.user_id} className={btnCls}>حفظ السياسة</button>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs border-b dark:border-slate-700">
                <th className="py-2 text-right">المستخدم</th><th>السياسة</th><th>TTL</th>
              </tr></thead>
              <tbody>
                {policies.map((p, i) => <tr key={`${p.user_id}-${i}`} className="border-b border-slate-100 dark:border-slate-700/60">
                  <td className="py-2">{p.name || p.username || userName(p.user_id)}</td>
                  <td>{policyLabel(p.policy)}</td><td dir="ltr">{p.ttl_minutes ?? 10}</td>
                </tr>)}
                {!policies.length && <tr><td colSpan={3} className="py-6 text-center text-slate-400">لا توجد سياسات صريحة — الجميع مفتوح.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className={panelCls}>
          <div className="flex items-center gap-2 mb-5"><Network className="w-5 h-5 text-brand-600" /><h2 className="font-bold">نطاق الفروع للمستخدم</h2></div>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500">المستخدم</label>
            <select className={inputCls} value={scopeUser} onChange={e => setScopeUser(e.target.value)}>
              <option value="">— اختر مستخدماً —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name || u.username} · {u.role || ''}</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-500">الفروع المسموحة (يُستبدل النطاق الحالي)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50">
              {branches.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={scopeBranches.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                  {b.name}
                </label>
              ))}
              {!branches.length && <span className="text-xs text-slate-400">لا توجد فروع.</span>}
            </div>
            <button onClick={() => void saveScopes()} disabled={busy || !scopeUser} className={btnCls}>حفظ النطاق</button>
            <p className="text-xs text-slate-400">مديرو الفروع يُصنَّفون `branch_scoped`؛ الإداريون والمالية مفتوحون بلا قفل فرعي.</p>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs border-b dark:border-slate-700">
                <th className="py-2 text-right">المستخدم</th><th>الفرع</th><th>أساسي</th>
              </tr></thead>
              <tbody>
                {scopes.map((s, i) => <tr key={`${s.user_id}-${s.branch_id}-${i}`} className="border-b border-slate-100 dark:border-slate-700/60">
                  <td className="py-2">{s.name || s.username || userName(s.user_id)}</td>
                  <td>{s.branch_name || `#${s.branch_id}`}</td>
                  <td>{s.is_primary ? 'نعم' : '—'}</td>
                </tr>)}
                {!scopes.length && <tr><td colSpan={3} className="py-6 text-center text-slate-400">لا توجد نطاقات مقيدة.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
