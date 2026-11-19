import { describe, it, expect } from 'vitest';
import { countActiveAdminsAfter } from '../account-guards';

/** The service must never leave the system without an active administrator. */
describe('countActiveAdminsAfter', () => {
  it('refuses to demote the only active admin', () => {
    expect(countActiveAdminsAfter(1, 'admin', 'active', 'finance', 'active')).toBe(0);
  });

  it('refuses to suspend the only active admin', () => {
    expect(countActiveAdminsAfter(1, 'admin', 'active', 'admin', 'suspended')).toBe(0);
  });

  it('preserves another active admin', () => {
    expect(countActiveAdminsAfter(2, 'admin', 'active', 'hr_manager', 'active')).toBe(1);
  });

  it('does not count a suspended admin', () => {
    expect(countActiveAdminsAfter(0, 'admin', 'suspended', 'finance', 'active')).toBe(0);
  });

  it('leaves the count alone when the target is not an admin', () => {
    expect(countActiveAdminsAfter(1, 'finance', 'active', 'employee_ess', 'suspended')).toBe(1);
  });

  it('counts a promotion to active admin', () => {
    expect(countActiveAdminsAfter(1, 'finance', 'active', 'admin', 'active')).toBe(2);
  });

  it('handles an empty user table', () => {
    expect(countActiveAdminsAfter(0, 'finance', 'active', 'admin', 'active')).toBe(1);
    expect(countActiveAdminsAfter(0, 'finance', 'active', 'finance', 'active')).toBe(0);
  });
});
