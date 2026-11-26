// Pure helpers for the branch-presence module.
//
// Nothing in this file opens a database or reads a request: it holds the two
// calculations the rest of the module relies on, plus the geofence primitive.
// Keeping them separate makes the "no double counting" and "no negative money"
// rules directly testable.

export const DEFAULT_PRESENCE_RADIUS_M = 200;
/** A restricted user must be at least this close to the branch centre. */
export const RESTRICTED_CENTRE_LIMIT_M = 100;
/** Grace window before a stale permit locks the programme (10 minutes). */
export const PRESENCE_LOCK_GRACE_MS = 10 * 60_000;

export interface IntervalLike {
  in_at: string | Date | number;
  out_at?: string | Date | number | null;
}

export interface MergedInterval {
  /** Epoch milliseconds, inclusive start. */
  start: number;
  /** Epoch milliseconds, inclusive end. */
  end: number;
}

export function intervalTime(value: string | Date | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  // PostgreSQL 1184 values are returned as ISO strings with an offset; SQLite
  // returns "YYYY-MM-DD HH:MM:SS". Both are unambiguously parseable as UTC.
  const raw = String(value).trim().replace(" ", "T");
  const ms = Date.parse(/[Zz]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Collapses overlapping and touching intervals into a single timeline.
 *
 * Adjacent intervals (one ends exactly when the next begins) are merged so a
 * checkout closely followed by a re-entry cannot be counted twice. Invalid or
 * backwards intervals are dropped rather than contributing negative minutes.
 */
export function mergeIntervals(intervals: IntervalLike[]): MergedInterval[] {
  const spans: MergedInterval[] = [];
  for (const interval of intervals) {
    const start = intervalTime(interval.in_at);
    const end = intervalTime(interval.out_at);
    if (start === null || end === null || end < start) continue;
    spans.push({ start, end });
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: MergedInterval[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      if (span.end > last.end) last.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** Total minutes covered by a merged timeline. */
export function mergedMinutes(merged: MergedInterval[]): number {
  return merged.reduce((sum, span) => sum + (span.end - span.start) / 60_000, 0);
}

/**
 * Monetary value of an amount of time at a pro-rated salary.
 *
 * zero salary -> zero value; zero/negative denominator -> zero value; negative
 * inputs are clamped so a bad row can never produce a negative deduction.
 */
export function minuteValue(
  totalSalary: number,
  workingDays: number,
  dailyHours: number,
  minutes: number,
): number {
  const salary = Number.isFinite(totalSalary) ? Math.max(0, totalSalary) : 0;
  const days = Number.isFinite(workingDays) ? Math.max(0, workingDays) : 0;
  const hours = Number.isFinite(dailyHours) ? Math.max(0, dailyHours) : 0;
  const value = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const denominator = days * hours * 60;
  if (salary === 0 || denominator === 0 || value === 0) return 0;
  return Math.round((salary / denominator) * value * 100) / 100;
}

/** Great-circle distance in metres. Coordinates are used in memory only. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

/** Only an explicit restriction can lock a user; absence of policy is open. */
export function isRestrictedPolicy(value: unknown): boolean {
  const policy = String(value || "open");
  return policy === "branch_bound" || policy === "branch_scoped";
}

/**
 * A branch-restricted permit never lives longer than the 10-minute grace
 * window, even if an administrator configured a longer TTL. Open policies keep
 * the configured TTL (default ten minutes) for reporting only — they are never
 * locked by it.
 */
export function presencePermitMinutes(policy: unknown, ttl: unknown): number {
  const minutes = Number(ttl);
  const base = Number.isFinite(minutes) && minutes >= 1
    ? Math.min(1440, Math.floor(minutes))
    : PRESENCE_LOCK_GRACE_MS / 60_000;
  return isRestrictedPolicy(policy)
    ? Math.min(base, PRESENCE_LOCK_GRACE_MS / 60_000)
    : base;
}

/**
 * Permits are self-describing: `nonce = random.expiryEpochMs`. That lets a
 * fresh process — and the lock middleware, which has no session state — decide
 * whether the permit has lapsed without storing coordinates anywhere.
 */
export function permitExpiry(nonce: unknown): number | null {
  if (!nonce) return null;
  const raw = String(nonce).split(".").pop() || "";
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function isPermitExpired(nonce: unknown, now = Date.now()): boolean {
  const expiry = permitExpiry(nonce);
  return expiry !== null && now >= expiry;
}

/**
 * The two locking triggers, in order: being outside the centre at sample time
 * is rejected at the gate; staying without a fresh sample for 10 minutes is
 * the timeout trigger. `open`/`system_admin`/`finance` are never locked.
 */
export function presenceLock(policy: unknown, nonce: unknown, now = Date.now()) {
  if (!isRestrictedPolicy(policy)) return { locked: false, expires_at: null as number | null };
  const expiry = permitExpiry(nonce);
  return {
    locked: expiry !== null && now >= expiry,
    expires_at: expiry,
  };
}
