import { describe, expect, it } from 'vitest';
import {
  countPresentWorkingDays,
  isWeekendDay,
  parseLocalDate,
  workingDaysInMonth,
} from '../working-days';
import type { WorkTimeRules } from '../payroll-types';

const SA: WorkTimeRules = { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [5, 6], overtimeRate: 1.5 };
const EG: WorkTimeRules = { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [5], overtimeRate: 1.5 };
const AE: WorkTimeRules = { hoursPerDay: 8, daysPerWeek: 5, weekendDays: [5, 6], overtimeRate: 1.5 };
const NO_WEEKEND: WorkTimeRules = { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [], overtimeRate: 1.5 };

describe('parseLocalDate', () => {
  it('reads a date in local time, not UTC', () => {
    const date = parseLocalDate('2026-10-01');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(9);
    expect(date!.getDate()).toBe(1);
  });

  it('rejects what is not a date', () => {
    for (const value of ['', 'not-a-date', '2026-13-01', '2026-10-32', '2026-02-30']) {
      expect(parseLocalDate(value), value).toBeNull();
    }
  });
});

describe('isWeekendDay', () => {
  it('follows the weekend list of the country', () => {
    // 2026-10-02 is a Friday, 2026-10-03 a Saturday, 2026-10-04 a Sunday.
    expect(isWeekendDay(new Date(2026, 9, 2), SA.weekendDays)).toBe(true);
    expect(isWeekendDay(new Date(2026, 9, 3), SA.weekendDays)).toBe(true);
    expect(isWeekendDay(new Date(2026, 9, 4), SA.weekendDays)).toBe(false);
    // Egypt works Saturday to Thursday, so its weekend is Friday alone.
    expect(isWeekendDay(new Date(2026, 9, 2), EG.weekendDays)).toBe(true);
    expect(isWeekendDay(new Date(2026, 9, 3), EG.weekendDays)).toBe(false);
  });
});

describe('workingDaysInMonth', () => {
  it('counts the working days of October 2026 for Saudi Arabia', () => {
    // October 2026 has 31 calendar days, ten of them Friday or Saturday.
    expect(workingDaysInMonth(10, 2026, SA)).toBe(21);
  });

  it('counts a six-day working week for Egypt', () => {
    // October 2026 has five Fridays.
    expect(workingDaysInMonth(10, 2026, EG)).toBe(26);
  });

  it('counts a five-day working week for the UAE', () => {
    expect(workingDaysInMonth(10, 2026, AE)).toBe(21);
  });

  it('never counts more days than the month has', () => {
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const days = new Date(2026, month, 0).getDate();
      expect(workingDaysInMonth(month, 2026, SA)).toBeLessThanOrEqual(days);
      expect(workingDaysInMonth(month, 2026, EG)).toBeLessThanOrEqual(days);
    }
  });

  it('caps the count by the working week when the weekend list is missing', () => {
    // Without a weekend list every calendar day would count as a working day.
    expect(workingDaysInMonth(10, 2026, NO_WEEKEND)).toBe(27);
    expect(workingDaysInMonth(10, 2026, NO_WEEKEND)).toBeLessThan(31);
  });

  it('handles a leap February', () => {
    expect(workingDaysInMonth(2, 2028, SA)).toBe(21);
  });
});

describe('countPresentWorkingDays', () => {
  /** The working days of a month, as 'YYYY-MM-DD'. */
  const workingDates = (month: number, year: number, workTime: WorkTimeRules) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      if (isWeekendDay(date, workTime.weekendDays)) continue;
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return dates;
  };

  it('counts every working day once, whatever the order', () => {
    const dates = workingDates(10, 2026, SA);
    expect(dates).toHaveLength(21);
    expect(countPresentWorkingDays(dates, SA)).toBe(21);
    expect(countPresentWorkingDays([...dates].reverse(), SA)).toBe(21);
  });

  it('ignores a sign-in on a weekend day', () => {
    // Friday and Saturday are weekend days in Saudi Arabia; in Egypt only
    // Friday is.
    expect(countPresentWorkingDays(['2026-10-02'], SA)).toBe(0);
    expect(countPresentWorkingDays(['2026-10-02'], EG)).toBe(0);
    expect(countPresentWorkingDays(['2026-10-03'], SA)).toBe(0);
    expect(countPresentWorkingDays(['2026-10-03'], EG)).toBe(1);
  });

  it('ignores duplicates and unparseable values', () => {
    expect(countPresentWorkingDays(['2026-10-04', '2026-10-04', 'rubbish'], SA)).toBe(1);
  });

  it('leaves a fully present employee with no absence', () => {
    const workingDays = workingDaysInMonth(10, 2026, SA);
    const presentWorkingDays = countPresentWorkingDays(workingDates(10, 2026, SA), SA);
    expect(Math.max(0, workingDays - presentWorkingDays)).toBe(0);
  });

  it('counts one absence for every working day missed', () => {
    const dates = workingDates(10, 2026, SA);
    const presentWorkingDays = countPresentWorkingDays(dates.slice(0, -3), SA);
    expect(workingDaysInMonth(10, 2026, SA) - presentWorkingDays).toBe(3);
  });
});
