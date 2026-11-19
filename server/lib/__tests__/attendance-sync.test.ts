import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncAttendanceFromLogs } from '../attendance-sync';

let db: Database.Database;
const now = new Date(2026, 10, 10);
const sync = () => syncAttendanceFromLogs(db, 10, 2026, now);
const rows = () => db.prepare('SELECT * FROM attendance ORDER BY employee_id').all();
const manual = (employeeId = 1) => db.prepare('INSERT INTO attendance (employee_id, month, year, absence_days, overtime_hours) VALUES (?, 10, 2026, 2, 7)').run(employeeId);
const log = (employeeId: number, day = '2026-10-01') => db.prepare('INSERT INTO attendance_logs (employee_id, check_in_time, check_out_time) VALUES (?, ?, ?)').run(employeeId, `${day}T08:00:00`, `${day}T18:00:00`);

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE employees (id INTEGER PRIMARY KEY);
    CREATE TABLE attendance_logs (employee_id INTEGER, check_in_time TEXT, check_out_time TEXT);
    CREATE TABLE attendance (id INTEGER PRIMARY KEY, employee_id INTEGER, month INTEGER, year INTEGER, absence_days REAL, overtime_hours REAL);
    INSERT INTO employees VALUES (1), (2), (3);
  `);
});
afterEach(() => db.close());

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
    const summary = await syncAttendanceFromLogs(db, 11, 2026, now);
    expect(summary).toEqual({ workdays: 22, expected: 8 });
    expect(rows()).toEqual([]);
  });
});

describe('attendance synchronization restricted to a scope', () => {
  it('syncs only the employees in the given list', async () => {
    log(1);
    log(2);
    await syncAttendanceFromLogs(db, 10, 2026, now, [2]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM attendance').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT employee_id FROM attendance').get()).toEqual({ employee_id: 2 });
  });

  it('treats an empty list as "nobody is in scope" instead of everybody', async () => {
    log(1);
    log(2);
    await syncAttendanceFromLogs(db, 10, 2026, now, []);
    expect(rows()).toEqual([]);
  });

  it('syncs everyone when no list is supplied', async () => {
    log(1);
    log(2);
    await syncAttendanceFromLogs(db, 10, 2026, now, null);
    // Employee 3 has no device logs, so no summary is manufactured for them.
    expect(db.prepare('SELECT COUNT(*) AS count FROM attendance').get()).toEqual({ count: 2 });
    expect(db.prepare('SELECT employee_id FROM attendance ORDER BY employee_id').all()).toEqual([
      { employee_id: 1 },
      { employee_id: 2 },
    ]);
  });
});
