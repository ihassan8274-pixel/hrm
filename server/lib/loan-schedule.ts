/**
 * Salary-deduction schedule for employee loans.
 *
 * The UI asks for "start month" and "number of months", not an instalment
 * plan. A loan with no explicit schedule keeps the legacy behaviour (deduct
 * on every payroll until the balance is zero) so existing data is untouched.
 */
export interface LoanScheduleInput {
  monthly_installment: number | string | null | undefined;
  remaining_amount: number | string | null | undefined;
  deduction_start_month?: number | string | null;
  deduction_start_year?: number | string | null;
  deduction_months?: number | string | null;
  deduction_applied_months?: number | string | null;
}

export interface LoanScheduleState {
  due: boolean;
  deduction: number;
  appliedMonths: number;
  completed: boolean;
}

const asNumber = (value: number | string | null | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Decide whether a loan is due in the given payroll period and how much to
 * deduct. `appliedMonths` is advanced only when the period is generated, so a
 * failed/rolled-back payroll never consumes a deduction month.
 */
export function loanDeductionForPeriod(
  loan: LoanScheduleInput,
  month: number,
  year: number,
): LoanScheduleState {
  const installment = asNumber(loan.monthly_installment);
  const remaining = asNumber(loan.remaining_amount);
  const startMonth = loan.deduction_start_month == null ? null : Number(loan.deduction_start_month);
  const startYear = loan.deduction_start_year == null ? null : Number(loan.deduction_start_year);
  const maxMonths = loan.deduction_months == null ? null : Number(loan.deduction_months);
  const applied = Math.max(0, Number(loan.deduction_applied_months) || 0);

  const hasSchedule = startMonth != null || startYear != null || maxMonths != null;
  const position = year * 12 + month;
  const startPosition = startYear != null && startMonth != null ? startYear * 12 + startMonth : null;

  // Before the configured start month nothing is deducted, but the counter
  // is also not advanced — even if a payroll was mistakenly generated early.
  if (hasSchedule && startPosition != null && position < startPosition) {
    return { due: false, deduction: 0, appliedMonths: applied, completed: false };
  }
  // A past month is never deducted after the fact. A period generated for an
  // earlier month than the loan's schedule must stay unchanged.
  if (hasSchedule && startPosition != null && position > startPosition && applied === 0) {
    // The start month may have been missed because the period was locked. Do
    // not silently catch up; the user must move the start date forward.
    return { due: false, deduction: 0, appliedMonths: applied, completed: false };
  }
  if (maxMonths != null && applied >= maxMonths) {
    return { due: false, deduction: 0, appliedMonths: applied, completed: true };
  }
  if (installment <= 0 || remaining <= 0) {
    return { due: false, deduction: 0, appliedMonths: applied, completed: remaining <= 0 };
  }

  const deduction = Math.min(installment, remaining);
  const nextApplied = applied + 1;
  const exhausted = maxMonths != null && nextApplied >= maxMonths;
  const completed = remaining - deduction <= 0 || exhausted;
  return { due: true, deduction, appliedMonths: nextApplied, completed };
}
