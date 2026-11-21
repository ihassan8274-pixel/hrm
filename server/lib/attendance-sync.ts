import { workingDaysInMonth, workingDaysUpTo } from "../../src/lib/payroll/working-days";
import { absenceFor } from "./attendance-absence";
import type { WorkTimeRules } from "../../src/lib/payroll/payroll-types";

type AttendanceLog = { check_in_time: string; check_out_time: string | null };

/**
 * Resolves the working-time rules of the entity an employee belongs to.
 *
 * The working days of a month are the country's own — the weekend list says
 * which days are not worked. A fixed Friday-and-Saturday weekend was wrong
 * for every country with a different week: in Egypt, where only Friday is
 * off, it made five working days a week disappear from every summary.
 */
export type WorkTimeResolver = (entityId: number | null) => Promise<WorkTimeRules>;

/**
 * Copies the device records into the monthly attendance summary.
 *
 * The absence is the working days of the month the employee did not work on,
 * counted with the country's weekend: a sign-in on a weekend is not a day of
 * work, and a missing device record is not evidence that the manual summary
 * is wrong.
 */
export async function syncAttendanceFromLogs(
  db: any,
  month: number,
  year: number,
  now: Date,
  employeeIds: number[] | null,
  workTimeFor: WorkTimeResolver,
): Promise<{ workdays: number; expected: number }> {
  const current = now.getFullYear() === year && now.getMonth() + 1 === month;
  const employees = await db.prepare('SELECT id, entity_id FROM employees').all() as {
    id: number; entity_id: number | null;
  }[];
  // An explicit list is the caller's scope. An empty list means "nobody is in
  // scope" — it must not fall back to every employee.
  const allowed = Array.isArray(employeeIds) ? new Set(employeeIds) : null;

  // The days of the month depend on the country, so they are worked out per
  // entity rather than once for everybody.
  const rulesByEntity = new Map<string, WorkTimeRules>();
  const rulesFor = async (entityId: number | null) => {
    const key = entityId === null ? "none" : String(entityId);
    const cached = rulesByEntity.get(key);
    if (cached) return cached;
    const rules = await workTimeFor(entityId);
    rulesByEntity.set(key, rules);
    return rules;
  };

  let workdays = 0;
  let expected = 0;
  let scopeWorkdays = 0;
  let scopeExpected = 0;

  for (const employee of employees) {
    if (allowed && !allowed.has(employee.id)) continue;
    const workTime = await rulesFor(employee.entity_id);
    const monthWorkdays = workingDaysInMonth(month, year, workTime);
    const monthExpected = current
      ? workingDaysUpTo(month, year, now.getDate(), workTime)
      : monthWorkdays;

    const logs = await db.prepare(`
      SELECT check_in_time, check_out_time FROM attendance_logs
      WHERE employee_id = ? AND substr(CAST(check_in_time AS TEXT), 1, 7) = ?
    `).all(employee.id, `${year}-${String(month).padStart(2, '0')}`) as AttendanceLog[];

    // The figures the caller reports are the ones of the scope it asked for.
    if (scopeWorkdays === 0) {
      scopeWorkdays = monthWorkdays;
      scopeExpected = monthExpected;
    }

    // Missing device records are not evidence that a manual summary is wrong.
    if (logs.length === 0) continue;

    // The absence: the working days the employee neither worked on nor was on
    // approved leave for. A leave day is not an absence — it is paid leave,
    // and so is a day off.
    const breakdown = await absenceFor(
      db, employee.id, month, year, workTime,
      current ? now.getDate() : undefined,
    );
    const absence = breakdown.absenceDays;

    let overtime = 0;
    for (const log of logs) {
      if (log.check_out_time) {
        const hours = (new Date(log.check_out_time).getTime() - new Date(log.check_in_time).getTime()) / 3600000;
        if (hours > 8) overtime += hours - 8;
      }
    }
    const existing = await db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND month = ? AND year = ?')
      .get(employee.id, month, year) as { id: number } | undefined;
    if (existing) {
      await db.prepare('UPDATE attendance SET absence_days = ?, overtime_hours = ? WHERE id = ?')
        .run(absence, Math.round(overtime), existing.id);
    } else {
      await db.prepare('INSERT INTO attendance (employee_id, month, year, absence_days, overtime_hours) VALUES (?, ?, ?, ?, ?)')
        .run(employee.id, month, year, absence, Math.round(overtime));
    }
  }

  // The legacy shape: the working days of the period and how many of them
  // have gone by. They are the ones of the scope the caller asked for.
  workdays = scopeWorkdays;
  expected = scopeExpected;
  return { workdays, expected };
}
