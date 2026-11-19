import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildExecutiveAnalytics } from '../executive-analytics';

let db: Database.Database;
const now = new Date('2026-11-10T12:00:00Z');
const all = { entityId: null, branchId: null, employeeId: null };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE departments (id INTEGER PRIMARY KEY, entity_id INTEGER, name TEXT);
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER, department_id INTEGER,
      is_saudi INTEGER, status TEXT, contract_start_date TEXT,
      basic_salary REAL, housing_allowance REAL, transport_allowance REAL, other_allowances REAL);
    CREATE TABLE payroll (employee_id INTEGER, month INTEGER, year INTEGER, net_salary REAL);
    CREATE TABLE qiwa_contracts (employee_id INTEGER, end_date TEXT);
    INSERT INTO departments VALUES (1,1,'التشغيل'), (2,1,'المالية');
    INSERT INTO employees VALUES
      (1,1,1,1,1,'active','2024-11-10',3000,0,0,0),
      (2,1,1,1,0,'active','2025-11-10',1500,300,200,0),
      (3,1,2,2,0,'inactive',NULL,1000,0,0,0),
      (4,2,3,NULL,1,'active','2020-01-01',4000,0,0,0);
    INSERT INTO payroll VALUES
      (1,12,2025,5000),
      (1,5,2026,1000),
      (1,8,2026,1200), (2,9,2026,800),
      (1,10,2026,900);
    INSERT INTO qiwa_contracts VALUES (1,'2027-01-01'), (2,'2026-01-01'), (4,NULL);
  `);
});
afterEach(() => db.close());

describe('executive analytics honesty', () => {
  it('returns null for every metric without a data source', async () => {
    const r = await buildExecutiveAnalytics(db, all, now);
    expect(r.estimatedRevenue).toBeNull();
    expect(r.humanCapitalRoi).toBeNull();
    expect(r.turnoverRateAnnual).toBeNull();
    expect(r.complianceSummary.gosi_compliant).toBeNull();
    expect(r.complianceSummary.wps_compliant).toBeNull();
    expect(r.complianceSummary.cchi_compliant).toBeNull();
  });
  it('computes wage bill, saudization and cost per employee from real rows', async () => {
    const r = await buildExecutiveAnalytics(db, all, now);
    expect(r.totalEmployees).toBe(4);
    expect(r.saudizationRate).toBe(50);
    expect(r.totalMonthlyPayroll).toBe(10000);
    expect(r.annualizedWageBill).toBe(120000);
    expect(r.costPerEmployee).toBe(30000);
  });
  it('builds quarterly trends from the payroll register with real growth', async () => {
    const r = await buildExecutiveAnalytics(db, all, now);
    expect(r.quarterlyTrends).toEqual([
      { quarter: 'Q2-2026', payroll_cost: 1000, headcount: 1, growth_pct: null },
      { quarter: 'Q3-2026', payroll_cost: 2000, headcount: 2, growth_pct: 100 },
      { quarter: 'Q4-2026', payroll_cost: 900, headcount: 1, growth_pct: -55 },
    ]);
  });
  it('averages tenure only over recorded contract start dates', async () => {
    const r = await buildExecutiveAnalytics(db, all, now);
    expect(r.averageTenureYears).toBe(3.3);
  });
  it('reports qiwa coverage of active employees only', async () => {
    const r = await buildExecutiveAnalytics(db, all, now);
    expect(r.complianceSummary.qiwa_contracts_rate).toBe(67);
  });
  it('breaks departments down with a fallback bucket for unassigned employees', async () => {
    const r = await buildExecutiveAnalytics(db, all, now);
    const ops = r.departmentsBreakdown.find(d => d.department_name === 'التشغيل')!;
    expect(ops).toMatchObject({ employee_count: 2, total_salary: 5000, avg_salary: 2500, saudization_rate: 50 });
    const general = r.departmentsBreakdown.find(d => d.department_name === 'عام / الإدارة')!;
    expect(general).toMatchObject({ employee_count: 1, total_salary: 4000, saudization_rate: 100 });
  });
  it('honors entity and employee scope', async () => {
    const ent = await buildExecutiveAnalytics(db, { entityId: 1, branchId: null, employeeId: null }, now);
    expect(ent.totalEmployees).toBe(3);
    expect(ent.complianceSummary.qiwa_contracts_rate).toBe(50);
    const ess = await buildExecutiveAnalytics(db, { entityId: 1, branchId: 1, employeeId: 1 }, now);
    expect(ess.totalEmployees).toBe(1);
    expect(ess.saudizationRate).toBe(100);
    expect(ess.complianceSummary.qiwa_contracts_rate).toBe(100);
    expect(ess.quarterlyTrends.map(q => q.payroll_cost)).toEqual([1000, 1200, 900]);
  });
  it('degrades to zeros and nulls when nothing matches the scope', async () => {
    const r = await buildExecutiveAnalytics(db, { entityId: 99, branchId: null, employeeId: null }, now);
    expect(r.totalEmployees).toBe(0);
    expect(r.saudizationRate).toBe(0);
    expect(r.costPerEmployee).toBe(0);
    expect(r.averageTenureYears).toBeNull();
    expect(r.complianceSummary.qiwa_contracts_rate).toBeNull();
    expect(r.quarterlyTrends).toEqual([]);
  });
});