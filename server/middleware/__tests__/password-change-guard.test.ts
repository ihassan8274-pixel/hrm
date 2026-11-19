import { describe, it, expect } from 'vitest';
import { PASSWORD_CHANGE_ALLOWLIST } from '../auth';

/**
 * The bootstrap admin is seeded with a documented password (ADMIN123) so an
 * installer can reach a fresh on-premise install without mail configured.
 *
 * That is only acceptable while the account is provably unable to do anything
 * else. These tests pin the allowlist that defines "everything else": the list
 * is the security boundary, so shrinking it silently would re-expose the
 * default password to real data.
 */
describe('password-change allowlist', () => {
  it('lets the account change its own password', () => {
    expect(PASSWORD_CHANGE_ALLOWLIST).toContain('/api/auth/change-password');
  });

  it('lets the account inspect and end its own session', () => {
    expect(PASSWORD_CHANGE_ALLOWLIST).toContain('/api/auth/me');
    expect(PASSWORD_CHANGE_ALLOWLIST).toContain('/api/auth/logout');
  });

  // Every one of these would otherwise expose payroll or employee data while
  // the well-known default password is still in play.
  it('does not expose any data endpoint', () => {
    const dataEndpoints = [
      '/api/employees',
      '/api/payroll',
      '/api/settings',
      '/api/saudi/compliance-summary',
      '/api/audit-logs',
      '/api/backup',
      '/api/attendance',
      '/api/sessions',
      '/api/admin',
    ];
    for (const path of dataEndpoints) {
      expect(PASSWORD_CHANGE_ALLOWLIST, `${path} must stay blocked`).not.toContain(path);
    }
  });

  it('does not expose the admin self-service registration endpoint', () => {
    // Otherwise the default-password holder could mint a second privileged
    // account and the forced change would be bypassable.
    expect(PASSWORD_CHANGE_ALLOWLIST).not.toContain('/api/auth/register');
  });

  it('stays a short, explicit list', () => {
    // A growing allowlist is the failure mode this guard exists to catch.
    expect(PASSWORD_CHANGE_ALLOWLIST.length).toBeLessThanOrEqual(5);
    expect(PASSWORD_CHANGE_ALLOWLIST.every((p) => p.startsWith('/api/auth/'))).toBe(true);
  });
});
