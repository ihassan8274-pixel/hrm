import { countPresentWorkingDays, workingDaysInMonth, workingDaysUpTo } from "../../src/lib/payroll/working-days";
import type { WorkTimeRules } from "../../src/lib/payroll/payroll-types";

/**
 * The absence of an employee for a period.
 *
 * The absence is the working days of the period that the employee neither
 * worked on nor was on approved leave for.
 *
 * A leave day is not an absence. The annual leave the law grants is paid
 * (نظام العمل, Article 109: «وتكون الإجازة بأجر يدفع مقدمًا»), and the sick
 * leave is paid in full for the first thirty days of the year and at three
 * quarters for the next sixty (Article 117). Charging those days as absence
 * as well would take the same days twice: once as leave, and once as
 * absence.
 *
 * The leave is counted from the dates of the request, not from its `days`
 * column, and only the days that fall on a working day of the period count —
 * a leave that covers a weekend does not shorten the month.
 */

export interface AbsenceBreakdown {
  /** The working days of the period. */
  workingDays: number;
  /** The working days the employee signed in on. */
  presentWorkingDays: number;
  /** The working days the employee was on approved leave for. */
  leaveWorkingDays: number;
  /** The working days the employee was absent for. */
  absenceDays: number;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/**
 * The working days of the approved leaves that fall inside the period.
 *
 * `upToDay` limits the count to the days that have already gone by, for a
 * period that is still running.
 */
export async function leaveWorkingDaysInPeriod(
  db: any,
  employeeId: number,
  month: number,
  year: number,
  workTime: WorkTimeRules,
  upToDay?: number,
): Promise<number> {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastIso = `${year}-${String(month).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  // The leaves that could overlap the period: they start before it ends and
  // end after it starts. The comparison is on the text of the dates so that
  // the statement reads the same on both engines — an ISO date sorts
  // correctly as text.
  const rows = (await db.prepare(`
    SELECT substr(CAST(start_date AS TEXT), 1, 10) AS from_date,
           substr(CAST(end_date AS TEXT), 1, 10) AS to_date
      FROM leaves
     WHERE employee_id = ? AND status = 'approved'
       AND substr(CAST(start_date AS TEXT), 1, 10) <= ?
       AND substr(CAST(end_date AS TEXT), 1, 10) >= ?
  `).all(employeeId, lastIso, firstIso)) as { from_date: string; to_date: string }[];

  if (!rows.length) return 0;

  const seen = new Set<string>();
  let count = 0;

  for (const row of rows) {
    const start = parseDate(row.from_date);
    const end = parseDate(row.to_date);
    if (!start || !end) continue;
    // The overlap with the period.
    const from = start < firstDay ? firstDay : start;
    const to = end > lastDay ? lastDay : end;
    for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      if (upToDay !== undefined && day.getDate() > upToDay) break;
      if (workTime.weekendDays.includes(day.getDay())) continue;
      const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      count++;
    }
  }
  return count;
}

/** The absence of an employee for a period, from the device records and the leave. */
export async function absenceFor(
  db: any,
  employeeId: number,
  month: number,
  year: number,
  workTime: WorkTimeRules,
  upToDay?: number,
): Promise<AbsenceBreakdown> {
  const workingDays = upToDay === undefined
    ? workingDaysInMonth(month, year, workTime)
    : workingDaysUpTo(month, year, upToDay, workTime);

  const signIns = (await db.prepare(`
    SELECT DISTINCT substr(CAST(check_in_time AS TEXT), 1, 10) AS d FROM attendance_logs
     WHERE employee_id = ? AND substr(CAST(check_in_time AS TEXT), 1, 7) = ?
  `).all(employeeId, `${year}-${String(month).padStart(2, "0")}`)) as { d: string }[];

  const presentWorkingDays = countPresentWorkingDays(signIns.map((row) => String(row.d)), workTime);
  const leaveWorkingDays = await leaveWorkingDaysInPeriod(db, employeeId, month, year, workTime, upToDay);

  return {
    workingDays,
    presentWorkingDays,
    leaveWorkingDays,
    absenceDays: Math.max(0, workingDays - presentWorkingDays - leaveWorkingDays),
  };
}
