import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertEmployeeWritableScope,
  assertWritableScope,
  listScopedEmployees,
  ScopeError,
  type OrganizationScope,
} from '../organization-scope';

let db: Database.Database;

const adminScope: OrganizationScope = { entityId: null, branchId: null, employeeId: null };
const entityScope: OrganizationScope = { entityId: 1, branchId: null, employeeId: null };
const branchScope: OrganizationScope = { entityId: 1, branchId: 10, employeeId: null };
const selfScope: OrganizationScope = { entityId: 1, branchId: 10, employeeId: 1 };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE employees (id INTEGER PRIMARY KEY, entity_id INTEGER, branch_id INTEGER);
    INSERT INTO employees VALUES
      (1, 1, 10),
      (2, 1, 10),
      (3, 1, 11),
      (4, 2, 10),
      (5, NULL, NULL);
  `);
});
afterEach(() => db.close());

describe('listing the employees a caller may act on', () => {
  it('returns everyone for an admin without an entity filter', async () => {
    expect((await listScopedEmployees(db, adminScope)).map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns only the entity for an entity-bound caller', async () => {
    expect((await listScopedEmployees(db, entityScope)).map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('returns only the branch for a branch manager', async () => {
    expect((await listScopedEmployees(db, branchScope)).map((e) => e.id)).toEqual([1, 2]);
  });

  it('returns only the linked record for a self-service account', async () => {
    expect((await listScopedEmployees(db, selfScope)).map((e) => e.id)).toEqual([1]);
  });
});

describe('write scope for employee-linked records', () => {
  it('lets an admin reach an employee outside every entity', async () => {
    await expect(assertEmployeeWritableScope(db, adminScope, 5)).resolves.toMatchObject({ id: 5 });
  });

  it('refuses an employee in another entity', async () => {
    await expect(assertEmployeeWritableScope(db, entityScope, 4)).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an employee with no entity at all', async () => {
    await expect(assertEmployeeWritableScope(db, entityScope, 5)).rejects.toThrow(/خارج نطاق حسابك/);
  });

  it('refuses an employee in another branch', async () => {
    await expect(assertEmployeeWritableScope(db, branchScope, 3)).rejects.toThrow(/خارج نطاق فرعك/);
  });

  it('refuses a record that does not exist', async () => {
    try {
      await assertEmployeeWritableScope(db, entityScope, 999);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as ScopeError).status).toBe(404);
    }
  });

  it('returns the employee row it allowed', async () => {
    expect(await assertEmployeeWritableScope(db, entityScope, 2)).toEqual({ id: 2, entity_id: 1, branch_id: 10 });
  });
});

describe('write scope for records that hang off a branch', () => {
  it('allows an admin without an entity filter', () => {
    expect(() => assertWritableScope(adminScope, { entityId: 2, branchId: 20 })).not.toThrow();
  });

  it('refuses a branch from another entity', () => {
    expect(() => assertWritableScope(entityScope, { entityId: 2, branchId: 20 })).toThrow(ScopeError);
  });

  it('refuses a branch the caller is not bound to', () => {
    expect(() => assertWritableScope(branchScope, { entityId: 1, branchId: 11 })).toThrow(/خارج نطاق فرعك/);
  });
});
