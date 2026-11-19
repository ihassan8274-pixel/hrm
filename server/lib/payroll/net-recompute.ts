/**
 * Re-derives a payroll row's net from its components.
 *
 * The stored run comes from POST /api/payroll/generate, which folds the month
 * bonus into the allowance total, the month penalty into the deduction total,
 * and the GOSI employee share into the deduction total as well. A correction
 * that recomputed the net as
 *   basic + allowances + bonuses - deductions - tax - insurance
 * therefore counted the bonus and the insurance share twice, ignored the tax
 * exemptions, and left the cash/bank split describing the old net.
 *
 * These helpers mirror the generation formula exactly, so a corrected row stays
 * comparable with the run it came from and with what the bank file exports.
 */

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface PayrollNetInput {
  basicSalary: number;
  allowances: number;
  deductions: number;
  taxExemptions: number;
  /** Fraction, not percent: 0.15 means 15%. */
  taxRate: number;
}

export interface PayrollNetResult {
  taxableIncome: number;
  taxAmount: number;
  netSalary: number;
}

export function recomputePayrollNet(input: PayrollNetInput): PayrollNetResult {
  const taxable = Math.max(
    0,
    num(input.basicSalary) + num(input.allowances) - num(input.deductions) - num(input.taxExemptions)
  );
  const tax = Math.max(0, taxable * num(input.taxRate));
  return {
    taxableIncome: round2(taxable),
    taxAmount: round2(tax),
    netSalary: round2(Math.max(0, taxable - tax)),
  };
}

export interface PaymentSplit {
  cashAmount: number;
  bankAmount: number;
}

/**
 * Splits a net salary into cash and bank exactly like the generation run does:
 * "cash" pays everything in cash, "split" pays the cash percentage in cash and
 * the rest to the bank, anything else pays the whole net to the bank.
 */
export function splitPayment(
  netSalary: number,
  paymentMethod: string | null | undefined,
  cashPercentage: number
): PaymentSplit {
  const net = round2(num(netSalary));
  const method = String(paymentMethod || "bank");
  const pct = num(cashPercentage);
  if (method === "cash") {
    return { cashAmount: net, bankAmount: 0 };
  }
  if (method === "split") {
    const cash = round2((net * pct) / 100);
    return { cashAmount: cash, bankAmount: round2(net - cash) };
  }
  return { cashAmount: 0, bankAmount: net };
}
