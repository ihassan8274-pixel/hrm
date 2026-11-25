import { describe, expect, it } from 'vitest';
import { loanDeductionForPeriod } from '../loan-schedule';

describe('loan deduction schedule', () => {
  it('keeps legacy loans deducting on every period', () => {
    const state = loanDeductionForPeriod({ monthly_installment: 500, remaining_amount: 1500 }, 11, 2026);
    expect(state).toMatchObject({ due: true, deduction: 500, appliedMonths: 1, completed: false });
  });

  it('does not deduct before the configured start month', () => {
    const loan = {
      monthly_installment: 500, remaining_amount: 1500,
      deduction_start_month: 1, deduction_start_year: 2027,
    };
    expect(loanDeductionForPeriod(loan, 11, 2026).deduction).toBe(0);
    expect(loanDeductionForPeriod(loan, 1, 2027).deduction).toBe(500);
  });

  it('deducts for exactly the requested number of months, not forever', () => {
    const base = {
      monthly_installment: 500, remaining_amount: 6000,
      deduction_start_month: 11, deduction_start_year: 2026, deduction_months: 3,
    };
    expect(loanDeductionForPeriod(base, 11, 2026)).toMatchObject({ deduction: 500, appliedMonths: 1, completed: false });
    expect(loanDeductionForPeriod({ ...base, deduction_applied_months: 1 }, 12, 2026)).toMatchObject({ deduction: 500, appliedMonths: 2, completed: false });
    expect(loanDeductionForPeriod({ ...base, deduction_applied_months: 2 }, 1, 2027)).toMatchObject({ deduction: 500, appliedMonths: 3, completed: true });
    expect(loanDeductionForPeriod({ ...base, deduction_applied_months: 3 }, 2, 2027).deduction).toBe(0);
  });

  it('does not silently catch up a start month that was missed', () => {
    const loan = {
      monthly_installment: 500, remaining_amount: 1500,
      deduction_start_month: 10, deduction_start_year: 2026,
    };
    expect(loanDeductionForPeriod(loan, 11, 2026).due).toBe(false);
  });

  it('stops at the remaining balance', () => {
    const loan = {
      monthly_installment: 500, remaining_amount: 300,
      deduction_start_month: 11, deduction_start_year: 2026,
    };
    expect(loanDeductionForPeriod(loan, 11, 2026)).toMatchObject({ deduction: 300, completed: true });
  });
});
