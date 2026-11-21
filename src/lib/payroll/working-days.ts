import type { WorkTimeRules } from './payroll-types';

/**
 * The working days of a month, and which of a set of days were working days.
 *
 * Why this exists
 * ---------------
 * A month has more calendar days than working days, and the difference is the
 * weekend. Counting absence as "the days in the month minus the days the
 * employee signed in" charges every weekend day as unpaid absence: an
 * employee who signed in on every working day of October 2026 — 21 days —
 * was charged for 31, which is ten days of pay for days they did work.
 *
 * The country's own rules decide which days are working days. They carry two
 * pieces of information and both are used here:
 *
 *   - `weekendDays` (weekend_days_json) says *which* days are not worked;
 *   - `daysPerWeek` (working_days_per_week) says *how many* days a week are
 *     worked, and caps the count.
 *
 * The weekend list governs, because it is also what decides whether a
 * sign-in happened on a working day at all. The cap only binds when the list
 * is missing or shorter than the working week — an empty list would otherwise
 * make every day of the month a working day.
 *
 * Note that the *daily rate* is a separate matter: it stays on the
 * application's own basis (the monthly wage over 30 days, or 26 for a
 * five-day week). This module only says how many days may be charged.
 */

/** Parses a 'YYYY-MM-DD' string into a local date. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Constructed in local time on purpose: `new Date('2026-10-01')` is parsed
  // as UTC, and in a timezone behind UTC that lands on the previous day.
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** True when the day falls on one of the country's weekend days. */
export function isWeekendDay(day: Date, weekendDays: number[]): boolean {
  return weekendDays.includes(day.getDay());
}

/**
 * The working days of a month.
 *
 * `month` is 1 for January. The count is the smaller of the two sources the
 * rules offer: the calendar days that are not weekend days, and the weekly
 * rule scaled to the length of the month.
 */
export function workingDaysInMonth(month: number, year: number, workTime: WorkTimeRules): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let calendarWorkingDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (!isWeekendDay(date, workTime.weekendDays)) calendarWorkingDays++;
  }
  const weeklyCap = Math.round((daysInMonth * workTime.daysPerWeek) / 7);
  return Math.min(calendarWorkingDays, weeklyCap);
}

/**
 * How many of the given 'YYYY-MM-DD' dates fall on a working day.
 *
 * A sign-in on a weekend is not a day of work, so it does not reduce the
 * absence. Unparseable dates are ignored.
 */
export function countPresentWorkingDays(dates: string[], workTime: WorkTimeRules): number {
  const seen = new Set<string>();
  for (const value of dates) {
    const date = parseLocalDate(value);
    if (!date) continue;
    if (isWeekendDay(date, workTime.weekendDays)) continue;
    seen.add(value.trim());
  }
  return seen.size;
}

/**
 * The working days of a month up to and including a day of it.
 *
 * Used for the days of a period that have already gone by, so that a month
 * that is still running is not compared against days that have not happened.
 */
export function workingDaysUpTo(month: number, year: number, upToDay: number, workTime: WorkTimeRules): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  const limit = Math.min(Math.max(1, upToDay), daysInMonth);
  let count = 0;
  for (let day = 1; day <= limit; day++) {
    if (!isWeekendDay(new Date(year, month - 1, day), workTime.weekendDays)) count++;
  }
  return count;
}

/**
 * The most working days a month can have for this country.
 *
 * It is the bound the absence cannot pass: an employee cannot be absent for
 * more days than there are working days in the longest month of the year.
 */
export function maxWorkingDaysInMonth(workTime: WorkTimeRules): number {
  let max = 0;
  for (const year of [2026, 2027]) {
    for (let month = 1; month <= 12; month++) {
      const count = workingDaysInMonth(month, year, workTime);
      if (count > max) max = count;
    }
  }
  return max;
}

/**
 * The number of days a month is paid for — the divisor of the daily rate.
 *
 * A monthly wage is paid for the days the employee is expected to work, so a
 * day of absence costs that much and a day of leave is worth that much. With
 * a five-day week (Friday and Saturday off) that is 21 days; with a six-day
 * week (Friday off) it is 26.
 *
 * The weekend list decides which of the two it is. `daysPerWeek` is the
 * fallback for a country whose weekend list is empty.
 */
export function dailyBasisFor(workTime: WorkTimeRules): number {
  const workingDaysPerWeek = workTime.weekendDays.length > 0
    ? 7 - workTime.weekendDays.length
    : workTime.daysPerWeek;
  return Math.round((30 * workingDaysPerWeek) / 7);
}
