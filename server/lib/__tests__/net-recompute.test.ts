import { describe, expect, it } from 'vitest';
import { recomputePayrollNet, splitPayment } from '../payroll/net-recompute';

describe('net recomputation', () => {
  it('subtracts deductions and exemptions before tax', () => {
    const result = recomputePayrollNet({
      basicSalary: 5000,
      allowances: 2000,
      deductions: 1000,
      taxExemptions: 500,
      taxRate: 0.05,
    });
    expect(result.taxableIncome).toBe(5500);
    expect(result.taxAmount).toBe(275);
    expect(result.netSalary).toBe(5225);
  });

  it('never returns a negative net', () => {
    const result = recomputePayrollNet({
      basicSalary: 1000,
      allowances: 0,
      deductions: 5000,
      taxExemptions: 0,
      taxRate: 0.05,
    });
    expect(result.taxableIncome).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  it('rounds to two decimals', () => {
    const result = recomputePayrollNet({
      basicSalary: 3333.33,
      allowances: 1111.11,
      deductions: 0,
      taxExemptions: 0,
      taxRate: 0.03,
    });
    expect(result.taxAmount).toBe(133.33);
    expect(result.netSalary).toBe(4311.11);
  });

  it('treats missing values as zero', () => {
    const result = recomputePayrollNet({
      basicSalary: undefined as unknown as number,
      allowances: undefined as unknown as number,
      deductions: undefined as unknown as number,
      taxExemptions: undefined as unknown as number,
      taxRate: undefined as unknown as number,
    });
    expect(result.netSalary).toBe(0);
  });
});

describe('cash and bank split', () => {
  it('puts the whole net into the bank by default', () => {
    expect(splitPayment(6000, 'bank', 0)).toEqual({ cashAmount: 0, bankAmount: 6000 });
  });

  it('puts the whole net into cash when the employee is paid in cash', () => {
    expect(splitPayment(6000, 'cash', 40)).toEqual({ cashAmount: 6000, bankAmount: 0 });
  });

  it('splits by the configured cash percentage', () => {
    expect(splitPayment(6000, 'split', 25)).toEqual({ cashAmount: 1500, bankAmount: 4500 });
  });

  it('treats an unknown payment method as a bank transfer', () => {
    expect(splitPayment(6000, undefined, 25)).toEqual({ cashAmount: 0, bankAmount: 6000 });
  });

  it('keeps cash and bank adding up to the net', () => {
    const split = splitPayment(1000.01, 'split', 33);
    expect(split.cashAmount + split.bankAmount).toBe(1000.01);
  });
});
