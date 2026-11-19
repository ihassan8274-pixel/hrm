import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildDashboardStats, buildPayrollTrends, buildHeadcount } from '../dashboard-analytics';

let db: Database.Database;
const now = new Date('2026-11-10T12:00:00Z');
const all = { entityId: null, branchId: null, employeeId: null };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE branches (id INTEGER PRIMARY KEY, entity_id INTEGER, name TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, entity_id INTEGER, name TEXT);
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER, department_id INTEGER);
    CREATE TABLE payroll (employee_id INTEGER, month INTEGER, year INTEGER, net_salary REAL);
    INSERT INTO branches VALUES (1,1,'أ'), (2,1,'ب'), (3,2,'ج');
    INSERT INTO departments VALUES (1,1,'تشغيل'), (2,1,'مالية'), (3,2,'إدارة');
    INSERT INTO employees VALUES (1,1,1,1), (2,1,2,1), (3,1,1,2), (4,2,3,3);
    INSERT INTO payroll VALUES
      (1,5,2026,500), (1,6,2026,600), (1,7,2026,700), (1,8,2026,800), (1,9,2026,900), (1,10,2026,999),
      (1,11,2026,1000), (2,11,2026,2000), (4,11,2026,4000);
  `);
});
afterEach(() => db.close());

describe('dashboard stats', () => {
  it('aggregates the current month for an unrestricted admin', async () => {
    const r = await buildDashboardStats(db, all, now);
    expect(r.totalBranches).toBe(3);
    expect(r.totalEmployees).toBe(4);
    expect(r.totalMonthlyPayroll).toBe(7000);
    expect(r.payrollByDept).toEqual([
      { name: 'تشغيل', value: 3000 },
      { name: 'إدارة', value: 4000 },
    ]);
  });
  it('narrows every count to the caller entity', async () => {
    const r = await buildDashboardStats(db, { entityId: 1, branchId: null, employeeId: null }, now);
    expect(r).toMatchObject({ totalBranches: 2, totalEmployees: 3, totalMonthlyPayroll: 3000 });
    expect(r.payrollByDept).toEqual([{ name: 'تشغيل', value: 3000 }]);
  });
  it('narrows to one branch and to one self-service employee', async () => {
    const br = await buildDashboardStats(db, { entityId: 1, branchId: 1, employeeId: null }, now);
    expect(br).toMatchObject({ totalBranches: 1, totalEmployees: 2, totalMonthlyPayroll: 1000 });
    const ess = await buildDashboardStats(db, { entityId: 1, branchId: 2, employeeId: 2 }, now);
    expect(ess).toMatchObject({ totalEmployees: 1, totalMonthlyPayroll: 2000 });
  });
});

describe('payroll trends', () => {
  it('returns the latest six periods in ascending order', async () => {
    const r = await buildPayrollTrends(db, all);
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual({ period: '2026-6', total: 600 });
    expect(r[5]).toEqual({ period: '2026-11', total: 7000 });
  });
  it('scopes totals to the caller entity', async () => {
    const r = await buildPayrollTrends(db, { entityId: 1, branchId: null, employeeId: null });
    expect(r[r.length - 1]).toEqual({ period: '2026-11', total: 3000 });
  });
});

describe('headcount', () => {
  it('counts employees per department and per branch', async () => {
    const r = await buildHeadcount(db, all);
    expect(r.byDept).toEqual([
      { name: 'تشغيل', count: 2 }, { name: 'مالية', count: 1 }, { name: 'إدارة', count: 1 },
    ]);
    expect(r.byBranch).toEqual([
      { name: 'أ', count: 2 }, { name: 'ب', count: 1 }, { name: 'ج', count: 1 },
    ]);
  });
  it('keeps zero-count departments and branches visible under a branch scope', async () => {
    const r = await buildHeadcount(db, { entityId: 1, branchId: 2, employeeId: null });
    expect(r.byDept).toEqual([{ name: 'تشغيل', count: 1 }, { name: 'مالية', count: 0 }]);
    expect(r.byBranch).toEqual([{ name: 'ب', count: 1 }]);
  });
  it('shows a self-service account only its own row', async () => {
    const r = await buildHeadcount(db, { entityId: 1, branchId: 1, employeeId: 1 });
    expect(r.byDept).toEqual([{ name: 'تشغيل', count: 1 }, { name: 'مالية', count: 0 }]);
    expect(r.byBranch).toEqual([{ name: 'أ', count: 1 }]);
  });
});