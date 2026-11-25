import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { resolveOrganizationScope, ScopeError } from '../organization-scope';
import { buildConsolidatedReport } from '../consolidated-report';

let db: Database.Database;
const now = new Date('2026-11-10T12:00:00Z');
const all = { entityId: null, branchId: null, employeeId: null };
const period = { month: '10', year: '2026' };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE entities (id INTEGER PRIMARY KEY, name_ar TEXT, name_en TEXT, currency TEXT);
    CREATE TABLE branches (id INTEGER PRIMARY KEY, entity_id INTEGER, name TEXT, location TEXT, is_active INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, entity_id INTEGER, employee_id INTEGER, status TEXT);
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER, is_saudi INTEGER, nationality TEXT, health_cert_required INTEGER DEFAULT 0);
    CREATE TABLE payroll (employee_id INTEGER, month INTEGER, year INTEGER, basic_salary REAL, allowances REAL, deductions REAL, net_salary REAL, insurance_comp_share REAL);
    CREATE TABLE attendance (employee_id INTEGER, month INTEGER, year INTEGER, absence_days REAL);
    CREATE TABLE attendance_logs (employee_id INTEGER, check_in_time TEXT);
    CREATE TABLE leaves (employee_id INTEGER, status TEXT, start_date TEXT, end_date TEXT);
    CREATE TABLE qiwa_contracts (employee_id INTEGER, end_date TEXT);
    CREATE TABLE health_certificates (employee_id INTEGER, expiry_date TEXT, status TEXT);
    CREATE TABLE hse_inspections (branch_id INTEGER, inspection_date TEXT);
    INSERT INTO entities VALUES (1, 'كيان أ', NULL, 'SAR'), (2, 'كيان ب', NULL, 'SAR');
    INSERT INTO branches VALUES (1, 1, 'الدمام', NULL, 1), (2, 1, 'غير نشط', NULL, 0), (3, 2, 'فرع ب', NULL, 1);
    INSERT INTO employees VALUES (1,1,1,1,'سعودي',1), (2,1,2,0,'وافد',0), (3,1,NULL,0,'وافد',0), (4,2,3,0,'وافد',0), (5,1,3,0,'وافد',0);
    INSERT INTO users VALUES (1,'admin',1,NULL,'active'), (2,'hr_manager',1,NULL,'active'),
      (3,'branch_manager',1,1,'active'), (4,'employee_ess',1,1,'active'), (5,'employee_ess',1,NULL,'active'),
      (6,'branch_manager',1,NULL,'active'), (7,'finance',NULL,NULL,'active'), (8,'admin',NULL,NULL,'disabled');
    INSERT INTO payroll VALUES (1,10,2026,1000,100,90.25,1009.75,117.5), (2,10,2026,1000,0,0,1000,20.25),
      (3,10,2026,500,0,0,500,10.25), (4,10,2026,600,0,0,600,12), (5,10,2026,200,0,0,200,4);
    INSERT INTO attendance VALUES (1,10,2026,0), (3,10,2026,1.5);
    INSERT INTO leaves VALUES (1,'approved','2026-10-31','2026-11-02'), (1,'pending','2026-10-01','2026-10-02'), (2,'approved','2026-11-01','2026-11-02');
    INSERT INTO qiwa_contracts VALUES (1,'2026-12-01'), (3,'2026-11-11'), (4,'2026-12-05');
    INSERT INTO health_certificates VALUES (1,'2026-11-20','active'), (1,'2026-11-15','replaced');
    INSERT INTO hse_inspections VALUES (1,'2026-10-31'), (1,'2026-11-01'), (2,'2026-10-04');
  `);
});
afterEach(() => db.close());

async function report(query = period, scope = all, allowed = all) {
  return buildConsolidatedReport(db, scope, allowed, query, now);
}

describe('organization scope', () => {
  it('lets administrators filter or aggregate all entities', async () => {
    expect(await resolveOrganizationScope(db, 1, {})).toEqual(all);
    expect(await resolveOrganizationScope(db, 1, { entity_id: '2', branch_id: '3' })).toEqual({ entityId: 2, branchId: 3, employeeId: null });
  });
  it('does not let a query override an assigned entity', async () => {
    expect((await resolveOrganizationScope(db, 2, {})).entityId).toBe(1);
    await expect(resolveOrganizationScope(db, 2, { entity_id: '2' })).rejects.toBeInstanceOf(ScopeError);
  });
  it('binds managers to the current employee branch, including when no filter is sent', async () => {
    expect((await resolveOrganizationScope(db, 3, {})).branchId).toBe(1);
    await expect(resolveOrganizationScope(db, 3, { branch_id: '2' })).rejects.toBeInstanceOf(ScopeError);
  });
  it('uses a live assignment instead of stale token data', async () => {
    db.prepare('UPDATE employees SET branch_id = 2 WHERE id = 1').run();
    expect((await resolveOrganizationScope(db, 3, {})).branchId).toBe(2);
  });
  it('retains the ESS employee restriction with arbitrary filters', async () => {
    expect(await resolveOrganizationScope(db, 4, { branch_id: '2' })).toEqual({ entityId: 1, branchId: 2, employeeId: 1 });
  });
  it.each([5, 6, 7, 8, 99])('fails closed for missing assignments or inactive accounts (%s)', async (id) => {
    await expect(resolveOrganizationScope(db, id, {})).rejects.toBeInstanceOf(ScopeError);
  });
  it.each(['0', '-1', 'NaN', '1.1', '1 OR 1=1', '', ['1', '2'], { id: 1 }])('rejects malformed ID %s', async (value) => {
    await expect(resolveOrganizationScope(db, 1, { entity_id: value })).rejects.toBeInstanceOf(ScopeError);
  });
});

describe('consolidated report', () => {
  it('reconciles cents, disabled branches and every unassigned employee without duplicate payroll', async () => {
    const r = await report();
    expect(r.grand.employee_count).toBe(5);
    expect(r.grand.gross).toBe(3400);
    expect(r.grand.net).toBe(3309.75);
    expect(r.grand.gosi_comp).toBe(164);
    const a = r.entities.find(e => e.id === 1)!;
    expect(a.branches.find(b => b.id === 2)?.net).toBe(1000);
    expect(a.branches.find(b => b.id === null)?.net).toBe(700);
    expect(a.totals.net).toBe(2709.75);
    expect(r.entities.find(e => e.id === 2)?.totals.net).toBe(600);
  });
  it('applies entity restrictions also to selector options and latest payroll', async () => {
    db.exec('INSERT INTO payroll VALUES (4,12,2026,900,0,0,900,18)');
    const scoped = await resolveOrganizationScope(db, 2, {});
    const r = await buildConsolidatedReport(db, scoped, scoped, {}, now);
    expect(r.month).toBe(10);
    expect(r.options.entities.map(e => e.id)).toEqual([1]);
    expect(r.options.branches.map(b => b.id)).toEqual([1,2]);
    expect(r.grand.employee_count).toBe(4);
  });
  it('filters a selected branch and returns no payroll for an unknown branch', async () => {
    expect((await report(period, { ...all, branchId: 1 })).grand.net).toBe(1009.75);
    expect((await report(period, { ...all, branchId: 999 })).grand.payroll_count).toBe(0);
  });
  it('keeps an empty payroll month distinct from missing employees or attendance', async () => {
    const r = await report({ month: '2', year: '2026' });
    expect(r.grand.payroll_count).toBe(0);
    expect(r.grand.employee_count).toBe(5);
    expect(r.grand.attendance_log_count).toBe(0);
  });
  it('counts only selected-period leaves and inspections and current active certificates', async () => {
    const r = await report();
    expect(r.grand.leaves_approved).toBe(1);
    expect(r.grand.hse_inspections).toBe(2);
    expect(r.grand.contracts_expiring_90d).toBe(3);
    expect(r.grand.health_certs_expiring_60d).toBe(1);
  });
  it('uses the actual last day of February', async () => {
    db.exec("INSERT INTO leaves VALUES (1,'approved','2026-03-01','2026-03-02')");
    expect((await report({ month: '2', year: '2026' })).grand.leaves_approved).toBe(0);
  });
  it('does not sum unrelated currencies', async () => {
    db.exec("UPDATE entities SET currency = 'USD' WHERE id = 2");
    const r = await report();
    expect(r.currency).toBeNull();
    expect(r.grand.net).toBeNull();
    expect(r.entities.find(e => e.id === 2)?.totals.net).toBe(600);
  });
  it('keeps employees with no entity visible in an explicit group', async () => {
    db.exec("INSERT INTO employees VALUES (6,NULL,NULL,0,'وافد',0); INSERT INTO payroll VALUES (6,10,2026,800,0,0,800,16)");
    const r = await report();
    expect(r.grand.employee_count).toBe(6);
    expect(r.entities.find(e => e.id === null)?.totals.net).toBe(800);
  });
  it.each([{ month: '13', year: '2026' }, { month: '1', year: 'abc' }, { month: '1' }])('rejects invalid or incomplete periods', async (query) => {
    await expect(buildConsolidatedReport(db, all, all, query, now)).rejects.toBeInstanceOf(ScopeError);
  });
});
