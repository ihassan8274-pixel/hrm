import { describe, expect, it } from 'vitest';
import { PERM, ROUTE_PERMISSIONS } from '../auth';

const ruleFor = (method: string, url: string) =>
  ROUTE_PERMISSIONS.find(rule =>
    (rule.method === '*' || rule.method === method) && rule.pattern.test(url)
  );

describe('loan movement permissions', () => {
  const writes: Array<[string, string]> = [
    ['POST', '/api/loans'],
    ['PUT', '/api/loans/7/status'],
    ['DELETE', '/api/loans/7'],
  ];

  it.each(writes)('%s %s requires loans management', (method, url) => {
    expect(ruleFor(method, url)?.perm).toBe(PERM.LOANS_MANAGE);
  });

  it('does not place the delete route in the ESS allowlists', () => {
    expect(ruleFor('DELETE', '/api/loans/7')?.perm).toBe(PERM.LOANS_MANAGE);
  });
});
