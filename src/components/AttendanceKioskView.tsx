import { useState, useEffect } from 'react';
import { MapPin, ScanFace, Fingerprint, LogIn, LogOut, CheckCircle2, XCircle, RefreshCw, Building2, ShieldCheck, QrCode, Copy } from 'lucide-react';
import { registerPlatformBiometric, webauthnSupported } from '../lib/webauthn-client';

interface Device { id: number; branch_id: number; branch_name: string; device_name: string; device_token: string; status: string; last_verified_at?: string; }
interface Employee { id: number; name: string; position: string; branch_id: number; }

export default function AttendanceKioskView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [deviceToken, setDeviceToken] = useState('');
  const [newDevice, setNewDevice] = useState({ branch_id: '', device_name: '' });
  const [selectedEmp, setSelectedEmp] = useState('');
  const [method, setMethod] = useState('face');
  const [geoStatus, setGeoStatus] = useState<null | { allowed: boolean; distance_m: number; radius_m: number; branch_name: string }>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [kioskLinks, setKioskLinks] = useState<Record<string, string>>({});

  const load = async () => {
    const [d, e, b] = await Promise.all([
      fetch('/api/attendance/devices').then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/branches').then(r => r.json()),
    ]);
    setDevices(d);
    setEmployees(e);
    setBranches(b);
  };

  useEffect(() => { load(); }, []);

  const getLocation = (): Promise<{ lat: number; lng: number }> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('الموقع الجغرافي غير مدعوم'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error('تعذر الحصول على الموقع: ' + err.message)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  const registerDevice = async () => {
    if (!newDevice.branch_id) return setMessage({ type: 'error', text: 'اختر الفرع' });
    const res = await fetch('/api/attendance/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: Number(newDevice.branch_id), device_name: newDevice.device_name })
    });
    const data = await res.json();
    if (data.device_token) {
      setDeviceToken(data.device_token);
      setMessage({ type: 'success', text: `تم إنشاء رابط الفرع. رقم التفعيل: ${data.pairing_pin} — افتح الرابط على هاتف الفرع وهو داخل الموقع` });
      load();
    } else setMessage({ type: 'error', text: data.error || 'فشل التسجيل' });
  };

  const validateGeo = async () => {
    if (!deviceToken) return setMessage({ type: 'error', text: 'أدخل رمز الجهاز أولاً' });
    setLoading(true);
    try {
      const pos = await getLocation();
      setCoords(pos);
      const res = await fetch('/api/attendance/geo-validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: deviceToken, latitude: pos.lat, longitude: pos.lng })
      });
      const data = await res.json();
      setGeoStatus(data);
      if (!data.allowed) setMessage({ type: 'error', text: data.error || 'الجهاز خارج نطاق الفرع' });
      else setMessage({ type: 'success', text: `الجهاز داخل نطاق ${data.branch_name} (${data.distance_m}م من المركز)` });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally { setLoading(false); }
  };

  const checkIn = async () => {
    if (!deviceToken || !selectedEmp) return setMessage({ type: 'error', text: 'أدخل رمز الجهاز واختر الموظف' });
    setLoading(true);
    try {
      let lat: number | undefined, lng: number | undefined;
      try { const p = await getLocation(); lat = p.lat; lng = p.lng; } catch {}
      const res = await fetch('/api/attendance/check-in', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: deviceToken, employee_id: Number(selectedEmp), method, latitude: lat, longitude: lng })
      });
      const data = await res.json();
      setMessage(data.success ? { type: 'success', text: data.message } : { type: 'error', text: data.error });
    } catch (e) { setMessage({ type: 'error', text: (e as Error).message }); }
    finally { setLoading(false); }
  };

  const enrollBiometric = async () => {
    if (!selectedEmp) return setMessage({ type: 'error', text: 'اختر الموظف لتسجيل بصمته على هذا الهاتف' });
    if (!webauthnSupported()) return setMessage({ type: 'error', text: 'البصمة غير مدعومة — استخدم HTTPS على هاتف الفرع' });
    setLoading(true);
    try {
      const optRes = await fetch('/api/webauthn/register/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: Number(selectedEmp) })
      });
      const opts = await optRes.json();
      if (!optRes.ok) throw new Error(opts.error || 'فشل بدء التسجيل');
      const cred = await registerPlatformBiometric(opts);
      const save = await fetch('/api/webauthn/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: Number(selectedEmp), method, ...cred })
      });
      const data = await save.json();
      if (!save.ok) throw new Error(data.error || 'فشل حفظ البصمة');
      setMessage({ type: 'success', text: 'تم ربط بصمة الوجه/الإصبع بالموظف على هذا الجهاز' });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally { setLoading(false); }
  };

  const branchKioskUrl = (tok: string) => `${window.location.origin}/kiosk/${encodeURIComponent(tok)}`;

  const copyLink = async (tok: string) => {
    const url = branchKioskUrl(tok);
    await navigator.clipboard.writeText(url);
    setMessage({ type: 'success', text: 'تم نسخ رابط هاتف الفرع' });
  };

  const showQr = async (tok: string) => {
    const QR = await import('qrcode');
    const url = branchKioskUrl(tok);
    const dataUrl = await QR.toDataURL(url, { width: 280, margin: 1 });
    setKioskLinks(prev => ({ ...prev, [tok]: dataUrl }));
  };

  const checkOut = async () => {
    if (!deviceToken || !selectedEmp) return setMessage({ type: 'error', text: 'أدخل رمز الجهاز واختر الموظف' });
    setLoading(true);
    try {
      let lat: number | undefined, lng: number | undefined;
      try { const p = await getLocation(); lat = p.lat; lng = p.lng; } catch {}
      const res = await fetch('/api/attendance/check-out', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: deviceToken, employee_id: Number(selectedEmp), latitude: lat, longitude: lng })
      });
      const data = await res.json();
      setMessage(data.success ? { type: 'success', text: data.message } : { type: 'error', text: data.error });
    } catch (e) { setMessage({ type: 'error', text: (e as Error).message }); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800">جهاز الحضور والانصراف (Kiosk)</h2>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><Building2 className="w-5 h-5 text-blue-600" /><h3 className="font-black text-slate-800">تسجيل جهاز حضور</h3></div>
          <div className="space-y-3">
            <select value={newDevice.branch_id} onChange={e => setNewDevice({ ...newDevice, branch_id: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50">
              <option value="">اختر الفرع</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input value={newDevice.device_name} onChange={e => setNewDevice({ ...newDevice, device_name: e.target.value })} placeholder="اسم الجهاز (مثال: هاتف الفرع)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            <button onClick={registerDevice} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700">تسجيل الجهاز</button>
          </div>
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500">رمز الجهاز (Device Token)</label>
            <input value={deviceToken} onChange={e => setDeviceToken(e.target.value)} placeholder="ألصق رمز الجهاز هنا" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono mt-1" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><MapPin className="w-5 h-5 text-emerald-600" /><h3 className="font-black text-slate-800">التحقق من الموقع الجغرافي</h3></div>
          <button onClick={validateGeo} disabled={loading} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'جارٍ التحقق...' : 'التحقق أن الجهاز داخل نطاق الفرع'}
          </button>
          {geoStatus && (
            <div className={`mt-4 p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${geoStatus.allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {geoStatus.allowed ? <ShieldCheck className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {geoStatus.allowed ? `داخل نطاق ${geoStatus.branch_name}` : 'خارج النطاق'} — المسافة {geoStatus.distance_m}م / الشعاع {geoStatus.radius_m}م
            </div>
          )}
          {coords && <p className="mt-3 text-[11px] text-slate-400 font-mono">lat: {coords.lat.toFixed(5)} , lng: {coords.lng.toFixed(5)}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><ScanFace className="w-5 h-5 text-indigo-600" /><h3 className="font-black text-slate-800">تسجيل الموظف</h3></div>
          <div className="space-y-3">
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50">
              <option value="">اختر الموظف</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
            </select>
            <div className="flex gap-2">
              {[{ v: 'face', l: 'بصمة الوجه', i: ScanFace }, { v: 'fingerprint', l: 'بصمة الإصبع', i: Fingerprint }].map(o => (
                <button key={o.v} onClick={() => setMethod(o.v)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border ${method === o.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  <o.i className="w-4 h-4" /> {o.l}
                </button>
              ))}
            </div>
            <button onClick={enrollBiometric} disabled={loading} className="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-100">
              تسجيل بصمة الوجه/الإصبع للموظف على هذا الجهاز
            </button>
            <div className="flex gap-2">
              <button onClick={checkIn} disabled={loading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"><LogIn className="w-4 h-4" /> دخول</button>
              <button onClick={checkOut} disabled={loading} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> انصراف</button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-slate-800 mb-4">الأجهزة المسجلة — افتح الرابط على هاتف الفرع</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-slate-400 text-xs border-b border-slate-100">
              <th className="py-2">الجهاز</th><th className="py-2">الفرع</th><th className="py-2">رقم التفعيل</th><th className="py-2">حالة الربط</th><th className="py-2">رابط هاتف الفرع</th>
            </tr></thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} className="border-b border-slate-50">
                  <td className="py-2 font-bold text-slate-700">{d.device_name}</td>
                  <td className="py-2 text-slate-600">{d.branch_name}</td>
                  <td className="py-2 font-mono text-lg font-black tracking-widest text-amber-700">{(d as any).pairing_pin || '—'}</td>
                  <td className="py-2 text-xs">
                    {(d as any).phone_bound
                      ? <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold">مربوط بهاتف الفرع</span>
                      : <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg font-bold">بانتظار التفعيل في الموقع</span>}
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/attendance/devices/${d.id}/reset-pair`, { method: 'POST' });
                        const data = await res.json();
                        setMessage({ type: 'success', text: `أُعيد التفعيل. الرقم الجديد: ${data.pairing_pin}` });
                        load();
                      }}
                      className="block mt-1 text-[10px] text-slate-500 underline"
                    >إعادة ربط هاتف جديد</button>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1 items-center">
                      <button onClick={() => copyLink(d.device_token)} className="px-2 py-1 bg-slate-100 rounded-lg text-[11px] font-bold flex items-center gap-1"><Copy className="w-3 h-3" /> نسخ الرابط</button>
                      <button onClick={() => showQr(d.device_token)} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-bold flex items-center gap-1"><QrCode className="w-3 h-3" /> QR</button>
                    </div>
                    {kioskLinks[d.device_token] && (
                      <div className="mt-2">
                        <img src={kioskLinks[d.device_token]} alt="QR" className="w-28 h-28" />
                        <p className="text-[10px] font-mono text-slate-400 break-all mt-1">{branchKioskUrl(d.device_token)}</p>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {devices.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">لا توجد أجهزة مسجلة</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
