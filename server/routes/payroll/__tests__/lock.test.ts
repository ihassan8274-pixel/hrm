import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), all: vi.fn() }));
vi.mock('../../../config/postgres', () => ({
  default: { prepare: () => ({ get: mocks.get, all: mocks.all }) },
}));

import { firstLockedPeriodFrom, isPayrollLocked, payrollLockKey, payrollLockedError, periodFromDateValue } from '../lock';

beforeEach(() => { mocks.get.mockReset(); mocks.all.mockReset(); mocks.all.mockResolvedValue([]); });

describe('payroll period lock guard', () => {
  it('uses one stable settings key per period', () => {
    expect(payrollLockKey(3, 2027)).toBe('payroll_lock_2027_3');
  });

  it('allows a write when the period is open', async () => {
    mocks.get.mockResolvedValue(undefined);
    expect(await isPayrollLocked(3, 2027)).toBe(false);
    expect(await payrollLockedError(3, 2027, 'حذف الدفعة')).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith(payrollLockKey(3, 2027));
  });

  it('blocks a write with an actionable message when the period is closed', async () => {
    mocks.get.mockResolvedValue({ value: '1' });
    expect(await isPayrollLocked(3, 2027)).toBe(true);
    await expect(payrollLockedError(3, 2027, 'حذف الدفعة')).resolves.toContain('3/2027');
    await expect(payrollLockedError(3, 2027, 'حذف الدفعة')).resolves.toContain('حذف الدفعة');
  });

  it('reads a claim period from an ISO date without depending on local time', () => {
    expect(periodFromDateValue('2026-11-15')).toEqual({ month: 11, year: 2026 });
    expect(periodFromDateValue('')).toBeNull();
  });

  it('finds the earliest closed period at or after a recurring movement starts', async () => {
    mocks.all.mockResolvedValue([
      { key: 'payroll_lock_2027_5' },
      { key: 'payroll_lock_2026_9' },
      { key: 'payroll_lock_2026_11' },
    ]);
    await expect(firstLockedPeriodFrom(10, 2026)).resolves.toBe('11/2026');
    await expect(firstLockedPeriodFrom(12, 2026)).resolves.toBe('5/2027');
  });

  it('allows a recurring movement when no future period is closed', async () => {
    mocks.all.mockResolvedValue([{ key: 'payroll_lock_2026_9' }]);
    await expect(firstLockedPeriodFrom(10, 2026)).resolves.toBeNull();
  });
});
