import { useEffect, useState } from 'react';
import { ArrowUpLeft, Building2, LockKeyhole, ShieldCheck, PackageCheck, Network, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AccountRow {
  id: number;
  username: string;
  role: string;
  status: string;
  email: string | null;
}

export default function SystemsHubView({ onOpenReports }: { onOpenReports: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const localBrowser = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const [ssoEnabled, setSsoEnabled] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/sso-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSsoEnabled(Boolean(d?.enabled)))
      .catch(() => setSsoEnabled(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/auth/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        setAccounts(rows);
        setDrafts(Object.fromEntries(rows.map((r: AccountRow) => [r.id, r.email || ''])));
      })
      .catch(() => setAccounts([]));
  }, [isAdmin]);

  const bindEmail = async (id: number) => {
    setSavingId(id);
    setNotice(null);
    try {
      const response = await fetch(`/api/auth/users/${id}/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: drafts[id] ?? '' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice({ kind: 'err', text: body?.error || 'تعذّر حفظ البريد' });
        return;
      }
      setAccounts((rows) => rows.map((r) => (r.id === id ? { ...r, email: body.email } : r)));
      setNotice({ kind: 'ok', text: body.email ? 'تم ربط البريد بالحساب' : 'تم فصل البريد عن الحساب' });
    } catch {
      setNotice({ kind: 'err', text: 'تعذّر الاتصال بالخادم' });
    } finally {
      setSavingId(null);
    }
  };

  const boundCount = accounts.filter((a) => a.email).length;
  const linkStyle = 'inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600';
  return (
    <section dir="rtl" className="space-y-6 pb-10">
      <header className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3"><Network className="text-indigo-600" aria-hidden="true" /><h1 className="text-2xl font-black text-slate-800">بوابة أنظمة معصوب حليب</h1></div>
        <p className="mt-3 max-w-3xl leading-7 text-slate-600">انتقل بين الرواتب والجودة والاستلام من مكان واحد. يحتفظ كل نظام بحساباته وصلاحياته وقاعدة بياناته.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-3">
        <article className="flex flex-col rounded-3xl border border-indigo-200 bg-white p-6">
          <Building2 className="text-indigo-600" size={28} aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-slate-800">الموظفون والرواتب</h2>
          <p className="mt-2 grow leading-7 text-slate-600">العقود والشهادات الصحية ومسير الرواتب، مع تجميع النتائج حسب الكيان والفرع.</p>
          <p className="my-5 text-sm font-bold text-indigo-700">داخل النظام الحالي</p>
          <button type="button" onClick={onOpenReports} className={linkStyle}>افتح تقارير الفروع <ArrowUpLeft size={16} aria-hidden="true" /></button>
        </article>
        <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6">
          <ShieldCheck className="text-emerald-700" size={28} aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-slate-800">الجودة وسلامة الغذاء</h2>
          <p className="mt-2 grow leading-7 text-slate-600">نظام HACCP المستقل: القراءات الحرجة، النظافة والتطهير، الفحص الصحي، والانحرافات.</p>
          <p className="my-5 text-sm text-slate-500">خدمة محلية على هذا الجهاز؛ يجب تشغيلها أولًا. حساب الجودة مستقل.</p>
          {localBrowser ? <a href="http://127.0.0.1:8780/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={linkStyle}>افتح نظام الجودة <ArrowUpLeft size={16} aria-hidden="true" /><span className="sr-only">في نافذة جديدة</span></a>
            : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">افتح البوابة من جهاز تشغيل الجودة؛ عنوان الخدمة المحلي لا يشير إلى الخادم من جهاز آخر.</p>}
        </article>
        <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6">
          <PackageCheck className="text-sky-700" size={28} aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-slate-800">استلام التوريدات</h2>
          <p className="mt-2 grow leading-7 text-slate-600">الموقع المستقل لسجلات الاستلام والأصناف والموردين، بحساب الاستلام وصلاحياته الحالية.</p>
          <p className="my-5 text-sm text-slate-500">موقع منشور — تسجيل دخول مستقل</p>
          <a href="https://reciveing.restocost.shop/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={linkStyle}>افتح نظام الاستلام <ArrowUpLeft size={16} aria-hidden="true" /><span className="sr-only">في نافذة جديدة</span></a>
        </article>
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <KeyRound className="text-indigo-600" size={24} aria-hidden="true" />
          <h2 className="text-xl font-black text-slate-800">ربط الهوية والدخول الموحد</h2>
        </div>
        <p className="mt-3 max-w-3xl leading-7 text-slate-600">
          جهة الهوية هي Cloudflare Access: تسجّل دخول الشخص مرة واحدة عند البوابة، ثم يتحقق كل نظام من بطاقته الموقّعة ويطابق بريده بحساب محلي لديه. لا تُنقل كلمات المرور ولا جلسات الرواتب إلى أي نظام آخر.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {ssoEnabled === null ? (
            <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">جارٍ فحص حالة الدخول الموحد…</span>
          ) : ssoEnabled ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 size={16} aria-hidden="true" /> الدخول الموحد مفعّل على هذا الخادم
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">
              <AlertTriangle size={16} aria-hidden="true" /> الدخول الموحد غير مفعّل — الدخول بكلمة المرور هو المسار الحالي
            </span>
          )}
          {isAdmin && accounts.length > 0 && (
            <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
              حسابات مرتبطة ببريد: {boundCount} من {accounts.length}
            </span>
          )}
        </div>

        {isAdmin ? (
          <div className="mt-6">
            <h3 className="font-black text-slate-800">مطابقة الحسابات بالبريد</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              البطاقة الموقّعة تحمل بريدًا إلكترونيًا، وحساب الرواتب يُعرَّف باسم المستخدم. اربط بريد كل حساب هنا ليصل إليه الدخول الموحد. الحساب غير المرتبط يبقى الدخول إليه بكلمة المرور فقط.
            </p>
            {notice && (
              <p role="status" className={`mt-4 rounded-xl p-3 text-sm font-bold ${notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>
            )}
            <div className="mt-4 max-h-96 overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="p-3 font-bold">الحساب</th>
                    <th scope="col" className="p-3 font-bold">الدور</th>
                    <th scope="col" className="p-3 font-bold">البريد المرتبط</th>
                    <th scope="col" className="p-3 font-bold"><span className="sr-only">حفظ</span></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-t border-slate-100">
                      <td className="p-3 font-bold text-slate-800">
                        {account.username}
                        {account.status !== 'active' && <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">موقوف</span>}
                      </td>
                      <td className="p-3 text-slate-600">{account.role}</td>
                      <td className="p-3">
                        <label className="sr-only" htmlFor={`email-${account.id}`}>البريد الإلكتروني للحساب {account.username}</label>
                        <input
                          id={`email-${account.id}`}
                          type="email"
                          dir="ltr"
                          value={drafts[account.id] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [account.id]: e.target.value }))}
                          placeholder="name@example.com"
                          className="w-full min-w-52 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        />
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => bindEmail(account.id)}
                          disabled={savingId === account.id}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                          {savingId === account.id ? 'جارٍ الحفظ…' : 'حفظ'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            مطابقة الحسابات بالبريد يجريها مسؤول النظام. إن كان دخولك الموحد لا يعمل، اطلب من المسؤول ربط بريدك بحسابك.
          </p>
        )}
      </section>

      <aside className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <LockKeyhole className="mt-1 shrink-0" size={22} aria-hidden="true" />
        <div><h2 className="font-black">حدود الربط الحالي</h2><p className="mt-2 leading-7">الدخول الموحد يطابق الهوية فقط؛ لا يزامن البيانات ولا ينقل الصلاحيات بين الأنظمة. كل نظام يبقى صاحب حساباته وقراراته. نظام الجودة خدمة محلية لم تُنشر بعد، ونظام الاستلام موقع منفصل بحساباته الخاصة.</p></div>
      </aside>
    </section>
  );
}
