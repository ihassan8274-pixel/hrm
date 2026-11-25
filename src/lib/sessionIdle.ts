/**
 * Shared idle-session policy for the browser shell.
 *
 * The clock is driven by *user* input, not by API traffic: several screens poll
 * in the background (notifications, live attendance, audit logs) and must not
 * keep a departed operator signed in.
 */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;
export const LAST_ACTIVITY_KEY = 'auth_last_activity';

/** Milliseconds left before the session is ended, never below zero. */
export function idleRemainingMs(lastActivityAt: number, now: number, timeoutMs = IDLE_TIMEOUT_MS): number {
  return Math.max(0, timeoutMs - Math.max(0, now - lastActivityAt));
}

/**
 * A stored timestamp from an older tab/window is trustworthy only after we
 * confirm the local session still exists. A missing value means "fresh start".
 */
export function readLastActivity(now: number): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 && value <= now ? value : now;
  } catch {
    return now;
  }
}

export function writeLastActivity(at: number): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Private mode / full storage — the in-memory timer still works.
  }
}

export function clearLastActivity(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Nothing to clear.
  }
}
