import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { resolveOrganizationScope, resolveWriteScope, ScopeError } from '../organization-scope';
import { assertTenantWriteScope, UNBOUND_ACCOUNT_MESSAGE } from '../tenant-write-scope';

let db: Database.Database;

// Entity 1 owns branch 1 and department 1; entity 2 owns branch 2 and department 2.
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE entities (id INTEGER PRIMARY KEY);
    CREATE TABLE branches (id INTEGER PRIMARY KEY, entity_id INTEGER);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, entity_id INTEGER);
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, role TEXT, entity_id INTEGER, employee_id INTEGER, status TEXT
    );
    CREATE TABLE visas (id INTEGER PRIMARY KEY, employee_id INTEGER);
    CREATE TABLE attendance_devices (id INTEGER PRIMARY KEY, branch_id INTEGER);
    CREATE TABLE employee_grievances (id INTEGER PRIMARY KEY, employee_id INTEGER);
    CREATE TABLE job_openings (id INTEGER PRIMARY KEY, department_id INTEGER);
    CREATE TABLE peer_kudos (id INTEGER PRIMARY KEY, recipient_id INTEGER);

    INSERT INTO entities VALUES (1), (2);
    INSERT INTO branches VALUES (1, 1), (2, 1), (3, 2);
    INSERT INTO departments VALUES (1, 1), (2, 2);
    INSERT INTO employees VALUES (10, 1, 1), (11, 1, 1), (12, 1, 2), (20, 2, 3);
    INSERT INTO users VALUES
      (1, 'admin', NULL, NULL, 'active'),
      (2, 'hr_manager', 1, NULL, 'active'),
      (3, 'finance', NULL, NULL, 'active'),
      (4, 'employee_ess', NULL, 10, 'active'),
      (5, 'employee_ess', NULL, NULL, 'active'),
      (6, 'branch_manager', 1, 11, 'active');
    INSERT INTO visas VALUES (1, 10), (2, 20);
    INSERT INTO attendance_devices VALUES (1, 1), (2, 3);
    INSERT INTO employee_grievances VALUES (1, 10), (2, 20);
    INSERT INTO job_openings VALUES (1, 1), (2, 2);
    INSERT INTO peer_kudos VALUES (1, 10), (2, 20);
  `);
});
afterEach(() => db.close());

const write = (url: string, body: Record<string, unknown> = {}, method = 'POST') => ({ method, url, body });

describe('write scope resolution', () => {
  it('gives an admin an unrestricted scope and honours an explicit entity filter', async () => {
    expect(await resolveWriteScope(db, 1, {})).toEqual({ entityId: null, branchId: null, employeeId: null });
    expect(await resolveWriteScope(db, 1, { entity_id: '2' })).toEqual({ entityId: 2, branchId: null, employeeId: null });
  });

  it('binds an entity role to its own entity', async () => {
    expect(await resolveWriteScope(db, 2, {})).toEqual({ entityId: 1, branchId: null, employeeId: null });
  });

  it('refuses an entity role that asks for another entity', async () => {
    await expect(resolveWriteScope(db, 2, { entity_id: '2' })).rejects.toThrow(ScopeError);
  });

  it('returns no scope for an account that carries no binding', async () => {
    expect(await resolveWriteScope(db, 3, {})).toBeNull();
    expect(await resolveWriteScope(db, 5, {})).toBeNull();
  });

  it('binds a self-service account to its own employee row', async () => {
    expect(await resolveWriteScope(db, 4, {})).toEqual({ entityId: 1, branchId: 1, employeeId: 10 });
  });

  it('binds a branch manager to the branch of their employee', async () => {
    expect(await resolveWriteScope(db, 6, {})).toEqual({ entityId: 1, branchId: 1, employeeId: null });
  });
});

describe('tenant write guard', () => {
  const entityOne = { entityId: 1, branchId: null, employeeId: null };

  it('refuses a write that names an employee of another entity', async () => {
    await expect(assertTenantWriteScope(db, entityOne, write('/api/attendance', { employee_id: 20 }))).rejects.toThrow(ScopeError);
  });

  it('allows a write that names an employee of the caller entity', async () => {
    await expect(assertTenantWriteScope(db, entityOne, write('/api/attendance', { employee_id: 10 }))).resolves.toBeUndefined();
  });

  it('refuses a write that reaches an employee of another branch', async () => {
    const branchManager = { entityId: 1, branchId: 1, employeeId: null };
    await expect(assertTenantWriteScope(db, branchManager, write('/api/attendance', { employee_id: 12 }))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, branchManager, write('/api/attendance', { employee_id: 11 }))).resolves.toBeUndefined();
  });

  it('keeps a self-service account on its own record', async () => {
    const selfService = { entityId: 1, branchId: 1, employeeId: 10 };
    await expect(assertTenantWriteScope(db, selfService, write('/api/salary-certificates', { employee_id: 11 }))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, selfService, write('/api/salary-certificates', { employee_id: 10 }))).resolves.toBeUndefined();
  });

  it('resolves the row the URL addresses without parsed route parameters', async () => {
    // The row id lives in the URL: a middleware never sees req.params.
    await expect(assertTenantWriteScope(db, entityOne, write('/api/employees/20', {}, 'PUT'))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, entityOne, write('/api/employees/10', {}, 'PUT'))).resolves.toBeUndefined();
    await expect(assertTenantWriteScope(db, entityOne, write('/api/visas/2', {}, 'PUT'))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, entityOne, write('/api/kudos/2/like', {}, 'POST'))).rejects.toThrow(ScopeError);
  });

  it('resolves a branch anchor through the device row', async () => {
    const branchManager = { entityId: 1, branchId: 1, employeeId: null };
    await expect(assertTenantWriteScope(db, branchManager, write('/api/attendance/devices/2', {}, 'PATCH'))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, branchManager, write('/api/attendance/devices/1', {}, 'PATCH'))).resolves.toBeUndefined();
  });

  it('refuses a write that names a branch of another entity', async () => {
    await expect(assertTenantWriteScope(db, entityOne, write('/api/attendance/devices', { branch_id: 3 }))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, entityOne, write('/api/attendance/devices', { branch_id: 1 }))).resolves.toBeUndefined();
  });

  it('refuses a write that names a department of another entity', async () => {
    await expect(assertTenantWriteScope(db, entityOne, write('/api/recruitment/jobs', { department_id: 2 }))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, entityOne, write('/api/recruitment/jobs', { department_id: 1 }))).resolves.toBeUndefined();
  });

  it('refuses a write that points at a row in another entity through a body field', async () => {
    await expect(assertTenantWriteScope(db, entityOne, write('/api/grievances/2/status', { grievance_id: 2 }))).rejects.toThrow(ScopeError);
    await expect(assertTenantWriteScope(db, entityOne, write('/api/grievances/1/status', { grievance_id: 1 }))).resolves.toBeUndefined();
    await expect(assertTenantWriteScope(db, entityOne, write('/api/recruitment/candidates', { job_id: 2 }))).rejects.toThrow(ScopeError);
  });

  it('refuses a record write from an account that carries no binding', async () => {
    await expect(assertTenantWriteScope(db, null, write('/api/attendance', { employee_id: 10 }))).rejects.toThrow(UNBOUND_ACCOUNT_MESSAGE);
    await expect(assertTenantWriteScope(db, null, write('/api/allowance-types', { name: 'بدل سكن' }))).resolves.toBeUndefined();
  });

  it('reports a missing branch or department instead of silently accepting it', async () => {
    await expect(assertTenantWriteScope(db, entityOne, write('/api/attendance/devices', { branch_id: 99 }))).rejects.toThrow('الفرع غير موجود');
    await expect(assertTenantWriteScope(db, entityOne, write('/api/projects', { department_id: 99 }))).rejects.toThrow('الإدارة غير موجودة');
  });
});

describe('read scope resolution is unchanged', () => {
  it('still refuses a self-service account that is not linked to an employee', async () => {
    await expect(resolveOrganizationScope(db, 5, {})).rejects.toThrow(ScopeError);
  });

  it('still refuses an entity role without an entity', async () => {
    await expect(resolveOrganizationScope(db, 3, {})).rejects.toThrow(ScopeError);
  });
});
