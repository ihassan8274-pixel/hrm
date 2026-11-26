/**
 * Helpers للواجهة فقط. لا تُخزَّن أي إحداثيات خام هنا؛
 * الموقع يُقرأ مرة واحدة عند البوابة ويُرسل للخادم فوراً.
 */

export type GateResponse = {
  allowed: boolean;
  locked?: boolean;
  permit?: string;
  expires_at?: string;
  branch_id?: number | null;
  branch_name?: string;
  distance_m?: number;
  reason?: string;
};

export type PresenceMe = {
  policy: string;
  branches: number[];
  today: {
    inside_minutes?: number;
    approved_out_minutes?: number;
    unapproved_out_minutes?: number;
    deducted_minutes?: number;
    violations_count?: number;
    branches_count?: number;
    first_in?: string | null;
    last_out?: string | null;
  };
  open_interval: any | null;
  permit_expires_at?: string | null;
  locked?: boolean;
  lock_reason?: string | null;
};

/** Only an explicit branch policy may be locked; everything else fails open. */
export function isRestrictedPresencePolicy(policy: unknown): boolean {
  return policy === 'branch_bound' || policy === 'branch_scoped';
}

/**
 * Delay until the next single GPS sample. No interval polling, no watchPosition
 * and no coordinate caching: the sample is taken once when this timer fires.
 */
export function presenceRecheckDelay(expiresAt: unknown, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const expiry = Date.parse(String(expiresAt));
  if (!Number.isFinite(expiry)) return null;
  return Math.max(0, expiry - now);
}

/** One fresh sample, kept only in memory until the request is sent. */
export async function samplePresenceOnce(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) throw new Error('هذا الجهاز لا يدعم تحديد الموقع.');
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
    });
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

export async function presenceRequest<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || data?.message || `فشل الطلب (${response.status})`));
  }
  return data as T;
}

/** Some older endpoints return a bare array; newer ones return { rows: [...] }. */
export function rowsOf<T = any>(data: any, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const value = data?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

export function minutesLabel(value: unknown): string {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ساعة و${rest} دقيقة` : `${hours} ساعة`;
}

export function policyLabel(policy: unknown): string {
  const map: Record<string, string> = {
    open: 'مفتوح',
    branch_bound: 'مقيد بفرع واحد',
    branch_scoped: 'مقيد بنطاق مدير الفرع',
    system_admin: 'إداري — مفتوح',
  };
  const key = String(policy || 'open');
  return map[key] || key;
}

/**
 * يقرأ الإحداثيات من رابط Google Maps دون خريطة حية أو طلب شبكة إضافي.
 * يدعم روابط !3d/!4d و @lat,lng و q=lat,lng و ll=lat,lng والإحداثيات المباشرة.
 */
export function parseGoogleMapsCoordinates(raw: string): { latitude: number; longitude: number } | null {
  const input = String(raw || '').trim();
  if (!input) return null;
  let decoded = input;
  try { decoded = decodeURIComponent(input); } catch { /* keep original */ }

  const candidates: Array<[string, string]> = [];
  const push = (match: RegExpMatchArray | null) => {
    if (match?.[1] != null && match?.[2] != null) candidates.push([match[1], match[2]]);
  };
  push(decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i));
  push(decoded.match(/@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/));
  push(decoded.match(/[?&](?:q|ll)=\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/i));
  push(decoded.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/));

  for (const [latText, lngText] of candidates) {
    const latitude = Number(latText);
    const longitude = Number(lngText);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}
