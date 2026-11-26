import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, ShieldCheck, RefreshCw, MapPin } from 'lucide-react';
import {
  isRestrictedPresencePolicy, minutesLabel, policyLabel, presenceRecheckDelay,
  presenceRequest, samplePresenceOnce, type GateResponse, type PresenceMe,
} from '../lib/presence';

const panelCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm';
const btnCls = 'px-5 py-2.5 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition';
const ghostCls = 'px-5 py-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition';

export default function PresenceGateView() {
  const [me, setMe] = useState<PresenceMe | null>(null);
  const [gate, setGate] = useState<GateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState('');
  const recheckingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setMe(await presenceRequest<PresenceMe>('/api/presence/me'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // At expiry the app takes exactly one fresh GPS sample to renew the permit.
  // A restricted user without a renewed sample is locked server-side with 403.
  const recheck = useCallback(async () => {
    if (recheckingRef.current) return;
    recheckingRef.current = true;
    setRechecking(true);
    setError('');
    try {
      const sample = await samplePresenceOnce();
      const result = await presenceRequest<GateResponse>('/api/presence/recheck', {
        method: 'POST',
        body: JSON.stringify(sample),
      });
      setGate(result);
      if (result.locked) setError('تم قفل التواجد — سجّل الخروج ثم عد للتسجيل داخل الفرع.');
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      recheckingRef.current = false;
      setRechecking(false);
    }
  }, [load]);

  useEffect(() => {
    if (!me?.open_interval || !me.permit_expires_at) return;
    if (!isRestrictedPresencePolicy(me.policy)) return;
    const delay = presenceRecheckDelay(me.permit_expires_at);
    if (delay === null) return;
    const timer = window.setTimeout(() => void recheck(), delay);
    return () => window.clearTimeout(timer);
  }, [me?.open_interval?.id, me?.permit_expires_at, me?.policy, recheck]);

  const openGate = async () => {
    setBusy(true);
    setError('');
    try {
      const sample = await samplePresenceOnce();
      const result = await presenceRequest<GateResponse>('/api/presence/gate', {
        method: 'POST',
        body: JSON.stringify(sample),
      });
      setGate(result);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setGate(null);
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    setBusy(true);
    setError('');
    try {
      await presenceRequest('/api/presence/checkout', { method: 'POST', body: '{}' });
      setGate(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const today = me?.today || {};
  const open = !!me?.open_interval;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">بوابة التواجد</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          عيّنة موقع واحدة فقط عند الدخول — بلا بث، بلا خريطة حية، وبلا تخزين إحداثيات على الجهاز.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {me?.locked && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl px-4 py-3 text-sm">
          انتهت صلاحية تصريح التواجد — البرنامج مقفل حتى تسجّل الخروج ثم تعود للتسجيل داخل الفرع.
        </div>
      )}
      {rechecking && (
        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          جارٍ تجديد التصريح بعيّنة موقع واحدة...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={panelCls}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100">تصريح الدخول</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            السياسة الحالية: <b className="text-slate-700 dark:text-slate-200">{policyLabel(me?.policy)}</b>
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void openGate()} disabled={busy} className={btnCls}>
              {busy ? '...' : 'تسجيل الدخول بعيّنة موقع'}
            </button>
            <button onClick={() => void checkout()} disabled={busy || !open} className={ghostCls}>
              تسجيل الخروج من الفرع
            </button>
            {open && isRestrictedPresencePolicy(me?.policy) && (
              <button onClick={() => void recheck()} disabled={busy || rechecking} className={ghostCls}>
                تجديد بعيّنة واحدة
              </button>
            )}
            <button onClick={() => void load()} className={ghostCls} aria-label="تحديث">
              <RefreshCw className="w-4 h-4 inline" /> تحديث
            </button>
          </div>
          {gate && (
            <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${gate.allowed
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
              <b>{gate.allowed ? 'مسموح بالتواجد' : 'ممنوع خارج النطاق'}</b>
              {gate.branch_name && <div>الفرع: {gate.branch_name}</div>}
              {gate.distance_m != null && <div>البُعد عن المركز: {Math.round(gate.distance_m)} متر</div>}
              {gate.expires_at && <div>ينتهي التصريح: {new Date(gate.expires_at).toLocaleTimeString('ar-SA')}</div>}
              {gate.reason && <div>السبب: {gate.reason}</div>}
              {gate.locked && <div>تم قفل التواجد — سجّل الخروج ثم عد للتسجيل داخل الفرع.</div>}
            </div>
          )}
          {me?.permit_expires_at && !gate && (
            <p className="mt-4 text-xs text-slate-400">آخر تصريح صالح حتى {new Date(me.permit_expires_at).toLocaleTimeString('ar-SA')}</p>
          )}
        </div>

        <div className={panelCls}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100">ملخص اليوم</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4">
              <div className="text-slate-500 dark:text-slate-400 text-xs">دقائق التواجد</div>
              <div className="font-bold text-lg text-slate-800 dark:text-slate-100">{minutesLabel(today.inside_minutes)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4">
              <div className="text-slate-500 dark:text-slate-400 text-xs">عدد الفروع</div>
              <div className="font-bold text-lg text-slate-800 dark:text-slate-100">{Number(today.branches_count || 0)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4">
              <div className="text-slate-500 dark:text-slate-400 text-xs">دقائق مصرّح بها</div>
              <div className="font-bold text-slate-800 dark:text-slate-100">{minutesLabel(today.approved_out_minutes)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4">
              <div className="text-slate-500 dark:text-slate-400 text-xs">دقائق غير مصرّح بها</div>
              <div className="font-bold text-slate-800 dark:text-slate-100">{minutesLabel(today.unapproved_out_minutes)}</div>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            أول دخول: {today.first_in ? new Date(today.first_in).toLocaleTimeString('ar-SA') : '—'} ·
            آخر خروج: {today.last_out ? new Date(today.last_out).toLocaleTimeString('ar-SA') : '—'}
          </p>
        </div>

        <div className={panelCls}>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100">الفروع المرتبطة</h2>
          </div>
          {me?.branches?.length ? (
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {me.branches.map(id => <li key={id} className="rounded-lg bg-slate-50 dark:bg-slate-900/50 px-3 py-2">فرع #{id}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              لا توجد فروع مقيدة — السياسة مفتوحة افتراضياً (fail-open).
            </p>
          )}
          <p className="mt-4 text-xs text-slate-400">
            قاعدة القفل: 10 دقائق خارج النطاق أو 100 متر من المركز — أيهما أولاً. لا خصم راتب تلقائي.
          </p>
        </div>
      </div>
    </div>
  );
}
