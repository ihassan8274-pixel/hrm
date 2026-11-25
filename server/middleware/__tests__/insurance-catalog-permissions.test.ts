import { describe, expect, it } from 'vitest';
import { PERM, ROUTE_PERMISSIONS } from '../auth';

const ruleFor = (method: string, url: string) =>
  ROUTE_PERMISSIONS.find(rule =>
    (rule.method === '*' || rule.method === method) && rule.pattern.test(url)
  );

describe('insurance catalog route permissions', () => {
  const writes: Array<[string, string]> = [
    ['POST', '/api/medical/insurance-companies'],
    ['PUT', '/api/medical/insurance-companies/7'],
    ['DELETE', '/api/medical/insurance-companies/7'],
    ['POST', '/api/medical/coverage-categories'],
    ['PUT', '/api/medical/coverage-categories/7'],
    ['DELETE', '/api/medical/coverage-categories/7']
  ];

  it.each(writes)('%s %s requires HR operations management', (method, url) => {
    expect(ruleFor(method, url)?.perm).toBe(PERM.HR_OPERATIONS_MANAGE);
  });

  it('keeps the catalog reads open to authenticated readers', () => {
    expect(ruleFor('GET', '/api/medical/insurance-companies')?.perm).toBeUndefined();
    expect(ruleFor('GET', '/api/medical/coverage-categories')?.perm).toBeUndefined();
  });
});
