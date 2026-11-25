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

/**
 * One error message for every movement delete that would rewrite a closed
 * period. Returning null means the period is open and the write may proceed.
 *
 * Kept here so bonuses, loans, overtime, off-cycle lines and claims cannot
 * drift into different lock rules — a closed payslip must never change
 * silently behind the approved figures.
 */
export async function payrollLockedError(
  month: number,
  year: number,
  action = "التعديل",
): Promise<string | null> {
  if (!(await isPayrollLocked(Number(month), Number(year)))) return null;
  return `مسير ${month}/${year} مُقفل ومُعتمد — افتحه أولاً من شاشة «مسير الرواتب» قبل ${action}`;
}

/** Read a period from a date-like value (`YYYY-MM-DD` preferred). */
export function periodFromDateValue(value: unknown): { month: number; year: number } | null {
  const text = String(value ?? "");
  const iso = /^(\d{4})-(\d{1,2})/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/**
 * First closed period at or after a start period. Recurring movements (loans)
 * need this because one lock can invalidate several future instalments, not just
 * the month the user happened to mention.
 */
export async function firstLockedPeriodFrom(
  month: number,
  year: number,
): Promise<string | null> {
  const rows = (await db.prepare(`
    SELECT key FROM settings WHERE key LIKE ? AND value = '1'
  `).all("payroll_lock_%")) as any[];
  const start = Number(year) * 12 + Number(month);
  const locked = rows
    .map((row) => /^payroll_lock_(\d{4})_(\d{1,2})$/.exec(String(row.key)))
    .filter((match): match is RegExpExecArray => !!match)
    .map((match) => ({ year: Number(match[1]), month: Number(match[2]) }))
    .filter((p) => p.year * 12 + p.month >= start)
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))[0];
  return locked ? `${locked.month}/${locked.year}` : null;
}

/** Guard for writes that would land on an already approved period. */
export async function payrollWriteLockError(
  month: number | null | undefined,
  year: number | null | undefined,
  action: string,
): Promise<string | null> {
  if (month == null || year == null) return null;
  return payrollLockedError(Number(month), Number(year), action);
}
