import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncAttendanceFromLogs } from '../attendance-sync';
import type { WorkTimeRules } from '../../../src/lib/payroll/payroll-types';

let db: Database.Database;
const now = new Date(2026, 10, 10);

// Saudi Arabia works Sunday to Thursday: Friday and Saturday are the weekend.
const SA: WorkTimeRules = { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [5, 6], overtimeRate: 1.5 };
// Egypt works Saturday to Thursday: only Friday is off.
const EG: WorkTimeRules = { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [5], overtimeRate: 1.5 };

const rules = (workTime: WorkTimeRules) => async () => workTime;

const sync = (workTime: WorkTimeRules = SA) =>
  syncAttendanceFromLogs(db, 10, 2026, now, null, rules(workTime));
const rows = () => db.prepare('SELECT * FROM attendance ORDER BY employee_id').all();
const manual = (employeeId = 1) => db.prepare('INSERT INTO attendance (employee_id, month, year, absence_days, overtime_hours) VALUES (?, 10, 2026, 2, 7)').run(employeeId);
const log = (employeeId: number, day = '2026-10-01') => db.prepare('INSERT INTO attendance_logs (employee_id, check_in_time, check_out_time) VALUES (?, ?, ?)').run(employeeId, `${day}T08:00:00`, `${day}T18:00:00`);

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER);
    CREATE TABLE attendance_logs (employee_id INTEGER, check_in_time TEXT, check_out_time TEXT);
    CREATE TABLE attendance (id INTEGER PRIMARY KEY, employee_id INTEGER, month INTEGER, year INTEGER, absence_days REAL, overtime_hours REAL);
    CREATE TABLE leaves (employee_id INTEGER, start_date TEXT, end_date TEXT, type TEXT, status TEXT);
    INSERT INTO employees VALUES (1, 1), (2, 1), (3, 1);
  `);
});
afterEach(() => db.close());

const leave = (
  employeeId: number,
  from: string,
  to: string,
  status = 'approved',
  type = 'annual',
) => db.prepare('INSERT INTO leaves (employee_id, start_date, end_date, type, status) VALUES (?, ?, ?, ?, ?)')
  .run(employeeId, from, to, type, status);

describe('attendance synchronization with missing device evidence', () => {
  it('preserves manual absence and overtime when the month has no logs', async () => {
    manual();
    const before = rows();
    await sync();
    expect(rows()).toEqual(before);
  });
  it('does not manufacture monthly attendance summaries without logs', async () => {
    expect(await sync()).toEqual({ workdays: 21, expected: 21 });
    expect(rows()).toEqual([]);
  });
  it('preserves employees without logs even when another employee has records', async () => {
    manual();
    log(2);
    await sync();
    expect(db.prepare('SELECT absence_days, overtime_hours FROM attendance WHERE employee_id = 1').get()).toEqual({ absence_days: 2, overtime_hours: 7 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM attendance WHERE employee_id = 3').get()).toEqual({ count: 0 });
  });
  it('does not use another month as evidence for overwriting a manual summary', async () => {
    manual();
    log(1, '2026-09-01');
    const before = rows();
    await sync();
    expect(rows()).toEqual(before);
  });
  it('retains log-based absence and overtime calculation and updates the same row', async () => {
    log(1);
    await sync();
    expect(db.prepare('SELECT absence_days, overtime_hours FROM attendance WHERE employee_id = 1').get()).toEqual({ absence_days: 20, overtime_hours: 2 });
    const before = rows();
    await sync();
    expect(rows()).toEqual(before);
  });
  it('counts only elapsed workdays in the current month', async () => {
    const summary = await syncAttendanceFromLogs(db, 11, 2026, now, null, rules(SA));
    expect(summary).toEqual({ workdays: 22, expected: 8 });
    expect(rows()).toEqual([]);
  });
});

describe('attendance synchronization restricted to a scope', () => {
  it('syncs only the employees in the given list', async () => {
    log(1);
    log(2);
    await syncAttendanceFromLogs(db, 10, 2026, now, [2], rules(SA));
    expect(db.prepare('SELECT COUNT(*) AS count FROM attendance').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT employee_id FROM attendance').get()).toEqual({ employee_id: 2 });
  });

  it('treats an empty list as "nobody is in scope" instead of everybody', async () => {
    log(1);
    log(2);
    await syncAttendanceFromLogs(db, 10, 2026, now, [], rules(SA));
    expect(rows()).toEqual([]);
  });

  it('syncs everyone when no list is supplied', async () => {
    log(1);
    log(2);
    await syncAttendanceFromLogs(db, 10, 2026, now, null, rules(SA));
    // Employee 3 has no device logs, so no summary is manufactured for them.
    expect(db.prepare('SELECT COUNT(*) AS count FROM attendance').get()).toEqual({ count: 2 });
    expect(db.prepare('SELECT employee_id FROM attendance ORDER BY employee_id').all()).toEqual([
      { employee_id: 1 },
      { employee_id: 2 },
    ]);
  });
});

describe('a leave day is not an absence', () => {
  it('does not charge the days of an approved leave', async () => {
    // The law pays the annual leave (نظام العمل, Article 109) and the sick
    // leave (Article 117), so those days cannot be charged as absence as
    // well — that would take the same days twice.
    //
    // October 2026 has 21 working days for Saudi Arabia. The employee
    // signed in on 2026-10-01 (a Thursday) and was on approved leave from
    // 2026-10-05 to 2026-10-07, which are three working days.
    log(1, '2026-10-01');
    leave(1, '2026-10-05', '2026-10-07');
    await sync();
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    // 21 working days − 1 day worked − 3 days of leave = 17
    expect(summary).toEqual({ absence_days: 17 });
  });

  it('still charges a leave that has not been approved yet', async () => {
    log(1, '2026-10-01');
    leave(1, '2026-10-05', '2026-10-07', 'pending');
    await sync();
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    expect(summary).toEqual({ absence_days: 20 });
  });

  it('does not shorten the month for a leave that covers the weekend', async () => {
    // 2026-10-02 is a Friday and 2026-10-03 a Saturday: the Saudi weekend.
    // A leave over the weekend covers no working day, so it does not reduce
    // the absence. (A Sunday is a working day, so a leave over a Saturday
    // and a Sunday would cover one working day.)
    log(1, '2026-10-01');
    leave(1, '2026-10-02', '2026-10-03');
    await sync();
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    expect(summary).toEqual({ absence_days: 20 });
  });

  it('counts the working days inside a leave that covers a Sunday', async () => {
    // 2026-10-04 is a Sunday, and it is a working day in Saudi Arabia, so a
    // leave over it covers one working day.
    log(1, '2026-10-01');
    leave(1, '2026-10-04', '2026-10-04');
    await sync();
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    expect(summary).toEqual({ absence_days: 19 });
  });

  it('counts a leave between two absence days once, and not the days around it', async () => {
    // Absence on the 1st, approved leave on the 5th to the 7th, absence on
    // the 8th. The leave day is paid leave and is not charged; the absence
    // on either side of it is.
    log(1, '2026-10-01');
    leave(1, '2026-10-05', '2026-10-07');
    await sync();
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    // 21 working days − 1 worked − 3 of leave = 17
    expect(summary).toEqual({ absence_days: 17 });
  });
});

describe('the working week comes from the country', () => {
  it('counts a six-day week for Egypt, where only Friday is off', async () => {
    // October 2026 has 31 days and five Fridays, so Egypt works 26 of them.
    expect(await sync(EG)).toEqual({ workdays: 26, expected: 26 });
  });

  it('does not charge a Friday as absence for an Egyptian employee', async () => {
    // Egypt works Saturday to Thursday, so Friday is the weekend. A Saturday
    // sign-in IS a day of work and has to reduce the absence; with a fixed
    // Friday-and-Saturday weekend the Saturday would have been counted as a
    // day off and the absence would have been understated.
    log(1, '2026-10-03');
    await sync(EG);
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    expect(summary).toEqual({ absence_days: 25 });
  });

  it('counts a six-day week for Egypt, where only Friday is off', async () => {
    // October 2026 has 31 days and five Fridays, so Egypt works 26 of them.
    expect(await sync(EG)).toEqual({ workdays: 26, expected: 26 });
  });

  it('does not count a weekend sign-in as a day of work', async () => {
    // 2026-10-03 is a Saturday: signing in then is not a day worked, so it
    // must not reduce the absence.
    log(1, '2026-10-03');
    await sync(SA);
    const summary = db.prepare('SELECT absence_days FROM attendance WHERE employee_id = 1').get();
    expect(summary).toEqual({ absence_days: 21 });
  });
});
