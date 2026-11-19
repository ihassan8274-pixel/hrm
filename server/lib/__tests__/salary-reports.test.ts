import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { ScopeError } from '../organization-scope';
import {
  reportPeriod, buildCompanySalaryReport, buildBranchSalaryReport,
  buildPayrollStatement, buildProvisionsReport,
} from '../salary-reports';

let db: Database.Database;
const now = new Date('2026-11-10T12:00:00Z');
const all = { entityId: null, branchId: null, employeeId: null };
const period = { month: '10', year: '2026' };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE branches (id INTEGER PRIMARY KEY, entity_id INTEGER, name TEXT);
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER, name TEXT,
      basic_salary REAL, housing_allowance REAL, transport_allowance REAL, payment_method TEXT);
    CREATE TABLE payroll (id INTEGER PRIMARY KEY, employee_id INTEGER, month INTEGER, year INTEGER,
      basic_salary REAL, allowances REAL, deductions REAL, net_salary REAL, payment_method TEXT, processed_at TEXT);
    CREATE TABLE attendance_logs (employee_id INTEGER, branch_id INTEGER, check_in_time TEXT);
    INSERT INTO branches VALUES (1,1,'الدمام'), (2,1,'الخبر'), (3,2,'فرع ب');
    INSERT INTO employees VALUES (1,1,1,'أحمد',3000,0,0,'bank'), (2,1,2,'باسم',1500,300,200,'cash'), (3,2,3,'خالد',6000,0,0,'cash');
    INSERT INTO payroll VALUES (1,1,10,2026,3000,0,0,3000,'cash','2026-10-28'), (2,2,10,2026,1500,500,0,2000,'bank','2026-10-28'),
      (3,3,10,2026,6000,0,0,6000,'cash','2026-10-28'), (4,1,9,2026,3000,0,100,2900,'cash','2026-09-28');
    INSERT INTO attendance_logs VALUES
      (1,1,'2026-10-01 08:00'), (1,1,'2026-10-01 17:00'), (1,1,'2026-10-02 08:00'),
      (1,2,'2026-10-05 08:00'), (2,2,'2026-10-03 08:00'), (3,3,'2026-10-04 08:00'),
      (1,1,'2026-09-30 08:00');
  `);
});
afterEach(() => db.close());

describe('reportPeriod', () => {
  it('defaults to the current period and builds month boundaries', () => {
    expect(reportPeriod({}, now)).toEqual({ month: 11, year: 2026, start: '2026-11-01', end: '2026-11-30' });
    expect(reportPeriod({ month: '2', year: '2026' }, now).end).toBe('2026-02-28');
    expect(reportPeriod({ month: '2', year: '2024' }, now).end).toBe('2024-02-29');
  });
  it.each([{ month: '13' }, { year: '1899' }, { year: '10000' }, { month: '1.5' }, { month: '' }, { year: '1 OR 1=1' }])('rejects malformed period %s', async (query) => {
    await expect(buildCompanySalaryReport(db, all, query, now)).rejects.toBeInstanceOf(ScopeError);
  });
});

describe('company salary report', () => {
  it('splits cash and bank totals from the payroll register only', async () => {
    const r = await buildCompanySalaryReport(db, all, period, now);
    expect(r).toEqual({ month: 10, year: 2026, cash_total: 9000, bank_total: 2000, total: 11000, cash_count: 2, bank_count: 1 });
  });
  it('honors entity and employee scope', async () => {
    const e1 = await buildCompanySalaryReport(db, { entityId: 1, branchId: null, employeeId: null }, period, now);
    expect(e1.total).toBe(5000);
    const ess = await buildCompanySalaryReport(db, { entityId: 1, branchId: 1, employeeId: 1 }, period, now);
    expect(ess).toMatchObject({ cash_total: 3000, bank_total: 0, cash_count: 1, bank_count: 0 });
  });
  it('returns zeros for a month with no payroll', async () => {
    const r = await buildCompanySalaryReport(db, all, { month: '1', year: '2026' }, now);
    expect(r.total).toBe(0);
  });
});

describe('branch salary report (regression: unawaited promises returned zero totals)', () => {
  it('returns real totals and populated detail rows', async () => {
    const r = await buildBranchSalaryReport(db, all, period, now);
    const [b1, b2, b3] = r.branches;
    expect(b1).toMatchObject({ branch_id: 1, branch_name: 'الدمام', total_cost: 200 });
    expect(b1.details).toEqual([{ employee_id: 1, days: 2, monthly: 3000, cost: 200 }]);
    expect(b2.total_cost).toBe(167);
    expect(b2.details).toEqual([
      { employee_id: 1, days: 1, monthly: 3000, cost: 100 },
      { employee_id: 2, days: 1, monthly: 2000, cost: 67 },
    ]);
    expect(b3.total_cost).toBe(200);
  });
  it('attributes cost to the logged branch, dedupes same-day punches and excludes other months', async () => {
    const r = await buildBranchSalaryReport(db, all, period, now);
    const b1 = r.branches.find(b => b.branch_id === 1)!;
    expect(b1.details[0].days).toBe(2);
    const b2 = r.branches.find(b => b.branch_id === 2)!;
    expect(b2.details.some(d => d.employee_id === 1)).toBe(true);
  });
  it('scopes branches by entity and by branch', async () => {
    const ent = await buildBranchSalaryReport(db, { entityId: 1, branchId: null, employeeId: null }, period, now);
    expect(ent.branches.map(b => b.branch_id)).toEqual([1, 2]);
    const br = await buildBranchSalaryReport(db, { entityId: 1, branchId: 2, employeeId: null }, period, now);
    expect(br.branches.map(b => b.branch_id)).toEqual([2]);
    expect(br.branches[0].total_cost).toBe(167);
    const ess = await buildBranchSalaryReport(db, { entityId: 1, branchId: null, employeeId: 1 }, period, now);
    expect(ess.branches.flatMap(b => b.details).every(d => d.employee_id === 1)).toBe(true);
  });
});

describe('payroll statement', () => {
  it('takes payment_method from the payroll row, not the employee record', async () => {
    const rows = await buildPayrollStatement(db, all, period, now);
    expect(rows).toHaveLength(3);
    const ahmed = rows.find(r => r.employee_id === 1);
    expect(ahmed).toMatchObject({ employee_name: 'أحمد', branch_name: 'الدمام', payment_method: 'cash', net_salary: 3000 });
    const basem = rows.find(r => r.employee_id === 2);
    expect(basem.payment_method).toBe('bank');
  });
  it('filters by month and scope', async () => {
    const sep = await buildPayrollStatement(db, all, { month: '9', year: '2026' }, now);
    expect(sep).toHaveLength(1);
    expect(sep[0].net_salary).toBe(2900);
    const ess = await buildPayrollStatement(db, { entityId: 1, branchId: 1, employeeId: 1 }, period, now);
    expect(ess.map(r => r.employee_id)).toEqual([1]);
  });
});

describe('provisions report', () => {
  it('accrues over logged days and falls back to the full month without logs', async () => {
    db.prepare('DELETE FROM attendance_logs WHERE employee_id = 3').run();
    const r = await buildProvisionsReport(db, all, period, now);
    const ahmed = r.employees.find(e => e.employee_id === 1)!;
    expect(ahmed).toEqual({ employee_id: 1, name: 'أحمد', monthly_wage: 3000, days: 3, eosb_provision: 13, leave_provision: 175, total_provision: 188 });
    const khaled = r.employees.find(e => e.employee_id === 3)!;
    expect(khaled.days).toBe(31);
    expect(khaled.eosb_provision).toBe(258);
    expect(khaled.leave_provision).toBe(350);
  });
  it('sums rows into totals and ratios against the wage base', async () => {
    const r = await buildProvisionsReport(db, all, period, now);
    expect(r.payroll_base).toBe(11000);
    expect(r.total_eosb).toBe(r.employees.reduce((s, e) => s + e.eosb_provision, 0));
    expect(r.total_leave).toBe(r.employees.reduce((s, e) => s + e.leave_provision, 0));
    expect(r.total_provision).toBe(r.employees.reduce((s, e) => s + e.total_provision, 0));
    expect(r.eosb_ratio).toBe(0.2);
    expect(r.leave_ratio).toBe(5.8);
  });
  it('scopes employees and reports zero ratios when none match', async () => {
    const ent = await buildProvisionsReport(db, { entityId: 1, branchId: null, employeeId: null }, period, now);
    expect(ent.employees.map(e => e.employee_id)).toEqual([1, 2]);
    const none = await buildProvisionsReport(db, { entityId: 99, branchId: null, employeeId: null }, period, now);
    expect(none.employees).toEqual([]);
    expect(none.total_ratio).toBe(0);
  });
});