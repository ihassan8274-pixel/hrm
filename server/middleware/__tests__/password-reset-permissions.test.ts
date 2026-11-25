import { describe, expect, it } from 'vitest';
import { openApi, PERM, ROUTE_PERMISSIONS } from '../auth';

const ruleFor = (method: string, url: string) =>
  ROUTE_PERMISSIONS.find(rule =>
    (rule.method === '*' || rule.method === method) && rule.pattern.test(url)
  );

describe('password reset route exposure', () => {
  it('lets only the request endpoint pass the global gate anonymously', () => {
    expect(openApi).toContain('/api/auth/password-reset-request');
    expect(openApi).not.toContain('/api/auth/password-reset-requests');
    expect(ruleFor('POST', '/api/auth/password-reset-request')?.perm).toBeUndefined();
  });

  it.each([
    ['GET', '/api/auth/password-reset-requests'],
    ['POST', '/api/auth/password-reset-requests/7/resolve'],
    ['POST', '/api/auth/password-reset-requests/7/reject'],
  ])('%s %s requires administrator management', (method, url) => {
    expect(ruleFor(method, url)?.perm).toBe(PERM.ADMIN_MANAGE);
  });
});
