import { useEffect, useState } from 'react';
import { Fingerprint, ScanFace, LogIn, LogOut, MapPin, ShieldCheck, XCircle, Smartphone } from 'lucide-react';
import { assertPlatformBiometric, webauthnSupported } from '../lib/webauthn-client';

interface Props { token: string }

export default function BranchMobileKiosk({ token }: Props) {
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoOk, setGeoOk] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [method, setMethod] = useState<'face' | 'fingerprint'>('face');
  const [pin, setPin] = useState('');
  const [paired, setPaired] = useState(false);

  const deviceFingerprint = (() => {
    const key = `branch-phone-${token}`;
    let fp = localStorage.getItem(key);
    if (!fp) {
      fp = `fp-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(key, fp);
    }
    return fp;
  })();

  const getLocation = (): Promise<{ lat: number; lng: number }> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('الموقع الجغرافي غير مدعوم'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error('فعّل الموقع على هاتف الفرع: ' + err.message)),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  useEffect(() => {
    fetch(`/api/kiosk/${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else {
          setInfo(d);
          setPaired(!!d.phone_bound);
        }
      })
      .catch(() => setError('تعذر الاتصال بالخادم'));
  }, [token]);

  const pairPhone = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const pos = await getLocation();
      setCoords(pos);
      const res = await fetch('/api/attendance/pair-phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_token: token,
          pairing_pin: pin,
          latitude: pos.lat,
          longitude: pos.lng,
          device_fingerprint: deviceFingerprint,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التفعيل');
      setPaired(true);
      setGeoOk(true);
      setMsg(data.message || 'تم ربط هذا الهاتف بالفرع');
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  const validateGeo = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const pos = await getLocation();
      setCoords(pos);
      const res = await fetch('/api/attendance/geo-validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: token, latitude: pos.lat, longitude: pos.lng, device_fingerprint: deviceFingerprint })
      });
      const data = await res.json();
      setGeoOk(!!data.allowed);
      if (!data.allowed) setError(data.error || 'الهاتف خارج نطاق الفرع');
      else setMsg(`داخل نطاق ${data.branch_name} — ${data.distance_m}م`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  const punch = async (action: 'in' | 'out') => {
    if (!geoOk) return setError('تحقق من موقع هاتف الفرع أولاً');
    if (!webauthnSupported()) return setError('هذا الهاتف لا يدعم بصمة الوجه/الإصبع (WebAuthn). استخدم HTTPS.');
    setLoading(true); setError(''); setMsg('');
    try {
      const optRes = await fetch('/api/webauthn/login/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: token })
      });
      const opts = await optRes.json();
      if (!optRes.ok) throw new Error(opts.error || 'فشل بدء التحقق');
      const assertion = await assertPlatformBiometric({
        challenge: opts.challenge,
        rpId: opts.rpId,
      });
      const ver = await fetch('/api/webauthn/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: token, ...assertion })
      });
      const ident = await ver.json();
      if (!ver.ok) throw new Error(ident.error || 'البصمة غير مسجلة');
      let lat = coords?.lat, lng = coords?.lng;
      try { const p = await getLocation(); lat = p.lat; lng = p.lng; } catch {}
      const endpoint = action === 'in' ? '/api/attendance/check-in' : '/api/attendance/check-out';
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_token: token,
          employee_id: ident.employee.id,
          method,
          latitude: lat,
          longitude: lng,
          device_fingerprint: deviceFingerprint,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التسجيل');
      setMsg(`${data.message} — ${ident.employee.name}`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  if (error && !info) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6" dir="rtl">
        <p className="text-red-300 font-bold text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950 text-white p-5 flex flex-col" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
          <Smartphone className="w-6 h-6 text-emerald-300" />
        </div>
        <div>
          <p className="text-[11px] text-emerald-300/80 font-bold">هاتف حضور الفرع</p>
          <h1 className="text-lg font-black">{info?.branch_name || '...'}</h1>
        </div>
      </div>

      <p className="text-sm text-slate-300 mb-4">
        {paired ? 'الهاتف مفعّل لهذا الفرع فقط. التسجيل يعمل داخل موقع الفرع.' : 'فعّل هذا الهاتف مرة واحدة داخل موقع الفرع برقم التفعيل من الإدارة.'}
      </p>

      {msg && <div className="mb-3 flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/30 rounded-2xl px-4 py-3 text-sm font-bold text-emerald-200"><ShieldCheck className="w-5 h-5" />{msg}</div>}
      {error && <div className="mb-3 flex items-center gap-2 bg-red-500/15 border border-red-400/30 rounded-2xl px-4 py-3 text-sm font-bold text-red-200"><XCircle className="w-5 h-5" />{error}</div>}

      {!paired && (
        <div className="mb-5 space-y-3 bg-white/5 border border-amber-400/30 rounded-2xl p-4">
          <p className="text-amber-200 text-sm font-bold">التفعيل لأول مرة — يجب أن تكون داخل الفرع الآن</p>
          <input
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="رقم التفعيل المكوّن من 6 أرقام"
            inputMode="numeric"
            className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/20 text-center text-2xl tracking-[0.4em] font-mono"
          />
          <button onClick={pairPhone} disabled={loading || pin.length !== 6} className="w-full py-4 rounded-2xl bg-amber-500 text-slate-900 font-black disabled:opacity-40">
            تفعيل هذا الهاتف داخل الفرع
          </button>
        </div>
      )}

      {paired && (
      <button onClick={validateGeo} disabled={loading} className="w-full mb-5 py-4 rounded-2xl bg-brand-600 font-black flex items-center justify-center gap-2 disabled:opacity-50">
        <MapPin className="w-5 h-5" /> {geoOk ? 'الموقع مؤكد — أعد التحقق' : 'تأكيد موقع هاتف الفرع'}
      </button>
      )}

      {paired && (
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMethod('face')} className={`flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'face' ? 'bg-brand-600 border-brand-400' : 'bg-white/5 border-white/10'}`}>
          <ScanFace className="w-5 h-5" /> بصمة الوجه
        </button>
        <button onClick={() => setMethod('fingerprint')} className={`flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border ${method === 'fingerprint' ? 'bg-brand-600 border-brand-400' : 'bg-white/5 border-white/10'}`}>
          <Fingerprint className="w-5 h-5" /> بصمة الإصبع
        </button>
      </div>
      )}

      {paired && (
      <div className="grid grid-cols-2 gap-3 mt-auto pb-8">
        <button onClick={() => punch('in')} disabled={loading || !geoOk} className="py-6 rounded-3xl bg-brand-500 font-black text-lg disabled:opacity-40 flex flex-col items-center gap-2">
          <LogIn className="w-8 h-8" /> حضور
        </button>
        <button onClick={() => punch('out')} disabled={loading || !geoOk} className="py-6 rounded-3xl bg-rose-600 font-black text-lg disabled:opacity-40 flex flex-col items-center gap-2">
          <LogOut className="w-8 h-8" /> انصراف
        </button>
      </div>
      )}
      <button
        onClick={() => {
          const el = document.documentElement as any;
          if (document.fullscreenElement) document.exitFullscreen();
          else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
        }}
        className="text-center text-[11px] text-emerald-300/80 py-2"
      >
        وضع ملء الشاشة (قفل كiosk)
      </button>
      {!window.isSecureContext && (
        <p className="text-center text-amber-300 text-xs font-bold">البصمة تحتاج HTTPS. الموقع الحالي غير آمن.</p>
      )}
      <p className="text-center text-[11px] text-slate-500">يتطلب HTTPS (أو localhost) لتفعيل Face ID / Touch ID. الرابط يُربط بهذا الهاتف فقط.</p>
    </div>
  );
}
