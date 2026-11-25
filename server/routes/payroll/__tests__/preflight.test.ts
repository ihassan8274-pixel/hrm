import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), all: vi.fn() }));
vi.mock('../../../config/postgres', () => ({
  default: { prepare: () => ({ get: mocks.get, all: mocks.all }) },
}));

import { runPayrollPreflight } from '../preflight';

const scope = { entityId: null, branchId: null, employeeId: null };

const employee = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  name: 'موظف اختبار',
  basic_salary: 5000,
  payment_method: 'bank',
  saudi_iban: 'SA0000000000000000000000',
  gosi_number: 'G123',
  is_saudi: 1,
  gosi_exempt: 0,
  hire_date: '2024-05-01',
  hire_month: 5,
  housing_allowance: 1000,
  transport_allowance: 500,
  ...overrides,
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.all.mockReset();
  // The first get() is the existing payroll row, the second is attendance.
  mocks.get.mockImplementation(async () =>
    mocks.get.mock.calls.length % 2 === 0 ? { id: 1 } : undefined
  );
  mocks.all.mockResolvedValue([]);
});

describe('payroll preflight', () => {
  it('blocks a period that contains an unpayable employee', async () => {
    mocks.all
      .mockResolvedValueOnce([employee({ basic_salary: 0, saudi_iban: '', gosi_number: '', hire_date: null, hire_month: 1, housing_allowance: 0, transport_allowance: 0 })])
      .mockResolvedValueOnce([]);
    mocks.get.mockResolvedValue(undefined);

    const report = await runPayrollPreflight(11, 2026, scope);
    expect(report.ready).toBe(false);
    expect(report.checked).toBe(1);
    expect(report.blockers.map((i) => i.code)).toContain('BASIC_SALARY_ZERO');
    expect(report.blockers.map((i) => i.code)).toContain('BANK_ACCOUNT_MISSING');
    expect(report.warnings.map((i) => i.code)).toEqual(expect.arrayContaining([
      'GOSI_NUMBER_MISSING', 'HIRE_DATE_DEFAULT', 'ALLOWANCES_ZERO', 'ATTENDANCE_MISSING',
    ]));
  });

  it('passes a period whose employees can be paid', async () => {
    mocks.all.mockResolvedValueOnce([employee()]).mockResolvedValueOnce([]);
    const report = await runPayrollPreflight(11, 2026, scope);
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('surfaces approved unpaid claims without adding them to salary', async () => {
    mocks.all
      .mockResolvedValueOnce([employee()])
      .mockResolvedValueOnce([{ employee_id: 7, c: 2, total: 350 }]);
    const report = await runPayrollPreflight(11, 2026, scope);
    expect(report.ready).toBe(true);
    expect(report.warnings.map((i) => i.code)).toContain('EXPENSE_CLAIMS_UNPAID');
    expect(report.warnings[0].message).toContain('خارج المسير');
  });
});
