import { describe, expect, it } from 'vitest';
import { PERM, ROUTE_PERMISSIONS } from '../auth';

const ruleFor = (method: string, url: string) =>
  ROUTE_PERMISSIONS.find(rule =>
    (rule.method === '*' || rule.method === method) && rule.pattern.test(url)
  );

describe('annual cycle route permissions', () => {
  it('keeps the audit export in the same read permission as the other annual lists', () => {
    expect(ruleFor('GET', '/api/annual/audit')?.perm).toBe(PERM.ANNUAL_CYCLE_VIEW);
    expect(ruleFor('GET', '/api/annual/increases')?.perm).toBe(PERM.ANNUAL_CYCLE_VIEW);
  });

  it('keeps the approval chain behind the dedicated approve permission', () => {
    expect(ruleFor('POST', '/api/annual/increases/12/approve')?.perm).toBe(PERM.ANNUAL_CYCLE_APPROVE);
    expect(ruleFor('POST', '/api/annual/reviews')?.perm).toBe(PERM.ANNUAL_CYCLE_MANAGE);
  });

  it('does not expose the annual audit endpoint to unauthenticated callers', () => {
    const rule = ruleFor('GET', '/api/annual/audit');
    expect(rule).toBeDefined();
    expect(rule?.perm).not.toBeUndefined();
  });
});
