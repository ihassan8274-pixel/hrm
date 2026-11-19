import db from "../../config/postgres";

/**
 * The payroll period lock.
 *
 * A closed period is a single flag for the whole entity/branch set, so it
 * lives in `settings` under one key per period. Both the lock routes and the
 * correction route need to read it, so the key format and the read live here
 * instead of being written twice.
 */
export const payrollLockKey = (m: number, y: number) => `payroll_lock_${y}_${m}`;

export async function isPayrollLocked(m: number, y: number): Promise<boolean> {
  const row = (await db.prepare("SELECT value FROM settings WHERE key = ?").get(payrollLockKey(m, y))) as any;
  return row?.value === "1";
}
