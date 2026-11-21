import { describe, it, expect } from 'vitest';
import { PayrollCalculator } from '../PayrollCalculator';
import type { CountryConfig, PayrollInput } from '../payroll-types';

const saConfig: CountryConfig = {
  code: 'SA',
  name_ar: 'السعودية',
  name_en: 'Saudi Arabia',
  currency: 'SAR',
  currency_symbol_ar: 'ر.س',
  currency_symbol_en: 'SAR',
  insurance: {
    employeeRate: 9.75,
    employerRate: 11.75,
    // A worker the scheme does not cover: no employee contribution, and the
    // employer pays the occupational hazards rate instead.
    uncoveredEmployeeRate: 0,
    uncoveredEmployerRate: 2,
    ceiling: 45000,
    floor: 2000,
    ceilingAppliedOn: 'basic_plus_housing'
  },
  tax: { type: 'none' },
  eos: { type: 'half_month_per_year', monthsPerYear: 0.5, basis: 'last_basic' },
  leaves: { annualDays: 21, sickDays: 0, maternityDays: 0, paternityDays: 0 },
  workTime: { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [5, 6], overtimeRate: 1.5 },
  wps: { format: 'sama', bankCodeLength: 3, routingCodeLength: 9 },
};

const egConfig: CountryConfig = {
  ...saConfig,
  code: 'EG',
  name_ar: 'مصر',
  name_en: 'Egypt',
  currency: 'EGP',
  currency_symbol_ar: 'ج.م',
  currency_symbol_en: 'EGP',
  // Egypt works Saturday to Thursday: Friday is the only weekend day, so the
  // month is paid for 26 days.
  workTime: { hoursPerDay: 8, daysPerWeek: 6, weekendDays: [5], overtimeRate: 1.5 },
  insurance: { employeeRate: 0, employerRate: 0, ceilingAppliedOn: 'gross' },
  tax: {
    type: 'progressive',
    brackets: [
      { min: 0, max: 15000, rate: 0 },
      { min: 15000, max: 30000, rate: 0.025 },
      { min: 30000, max: 45000, rate: 0.10 },
      { min: 45000, max: 60000, rate: 0.15 },
      { min: 60000, max: 200000, rate: 0.20 },
      { min: 200000, max: 400000, rate: 0.225 },
      { min: 400000, max: null, rate: 0.25 },
    ],
  },
};

const flatConfig: CountryConfig = {
  ...saConfig,
  insurance: { employeeRate: 0, employerRate: 0, ceilingAppliedOn: 'gross' },
  tax: { type: 'flat', flatRate: 10 },
};

const baseInput: PayrollInput = {
  employeeId: 1,
  basicSalary: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  otherAllowances: 0,
  deductions: 0,
  loanDeduction: 0,
  absentDays: 0,
  overtimeHours: 0,
  paymentMethod: 'bank',
};

function calc(overrides: Partial<PayrollInput>, rules: CountryConfig = saConfig) {
  return PayrollCalculator.calculate({ ...baseInput, ...overrides }, rules);
}

describe('PayrollCalculator', () => {
  it('calculates gross = basic + allowances and net correctly for SA', () => {
    const r = calc({ basicSalary: 10000, housingAllowance: 5000, transportAllowance: 1000 });
    expect(r.grossSalary).toBe(16000);
    expect(r.totalAllowances).toBe(6000);
    // insurance base = basic+housing = 15000 (<45000 ceiling)
    expect(r.insuranceEmployee).toBeCloseTo(15000 * 0.0975, 2); // 1462.5
    expect(r.insuranceEmployer).toBeCloseTo(15000 * 0.1175, 2); // 1762.5
    expect(r.taxAmount).toBe(0);
    // net = gross - insuranceEmployee
    expect(r.netSalary).toBeCloseTo(16000 - 1462.5, 2); // 14537.5
    expect(r.employeeId).toBe(1);
  });

  it('applies insurance ceiling when basic+housing exceeds 45000', () => {
    const r = calc({ basicSalary: 40000, housingAllowance: 10000 });
    // base = 50000 > ceiling 45000 → capped
    expect(r.calculationDetails.insuranceBase).toBe(45000);
    expect(r.calculationDetails.insuranceCeilingApplied).toBe(true);
    expect(r.insuranceEmployee).toBeCloseTo(45000 * 0.0975, 2); // 4387.5
    expect(r.insuranceEmployer).toBeCloseTo(45000 * 0.1175, 2); // 5287.5
  });

  it('raises insurance base to floor when basic+housing is below 2000', () => {
    const r = calc({ basicSalary: 500 });
    // base = 500 < floor 2000 → raised to 2000
    expect(r.calculationDetails.insuranceBase).toBe(2000);
    expect(r.insuranceEmployee).toBeCloseTo(2000 * 0.0975, 2); // 195
  });

  it('computes progressive tax for Egypt correctly (taxable 45000 → 1875)', () => {
    // insurance = 0 (egConfig), deductions = 0 → taxable = gross = 45000
    const r = calc({ basicSalary: 45000 }, egConfig);
    // bracket 1: 0-15000 * 0 = 0
    // bracket 2: 15000-30000 * 0.025 = 375
    // bracket 3: 30000-45000 * 0.10 = 1500
    // total = 1875
    expect(r.taxAmount).toBeCloseTo(1875, 2);
    expect(r.calculationDetails.taxBracketsUsed).toBe('progressive');
  });

  it('computes flat tax at 10%', () => {
    const r = calc({ basicSalary: 10000 }, flatConfig);
    expect(r.taxAmount).toBeCloseTo(1000, 2); // 10000 * 10%
  });

  it('calculates overtime: 3 hours at 1.5x hourly rate', () => {
    const r = calc({ basicSalary: 10000, overtimeHours: 3 });
    // The overtime is paid on the statutory daily wage: the basic wage over
    // thirty days (نظام العمل, Article 2: the month is thirty days), divided
    // by the hours of the day.
    // hourly = 10000/30/8 = 41.667, overtime = 3 * 41.667 * 1.5 = 187.5
    expect(r.overtimePay).toBeCloseTo(187.5, 2);
  });

  it('keeps the overtime on the statutory basis while the month is paid for 21 days', () => {
    // The absence deduction follows the country's working days; the overtime
    // stays on the statutory thirty days.
    const withOvertime = calc({ basicSalary: 10000, housingAllowance: 5000, overtimeHours: 1 });
    const withoutOvertime = calc({ basicSalary: 10000, housingAllowance: 5000 });
    expect(withOvertime.overtimePay).toBeCloseTo(62.5, 2); // 10000/30/8 * 1.5
    expect(withoutOvertime.overtimePay).toBe(0);
  });

  it('charges no employee contribution to a worker the scheme does not cover', () => {
    // An expatriate pays nothing to the social insurance scheme, and the
    // employer pays the occupational hazards rate instead — 2% in Saudi
    // Arabia.
    const covered = calc({ basicSalary: 10000, housingAllowance: 5000 });
    const uncovered = calc({ basicSalary: 10000, housingAllowance: 5000, insuranceCovered: false });
    expect(covered.insuranceEmployee).toBeCloseTo(15000 * 0.0975, 2);
    expect(uncovered.insuranceEmployee).toBe(0);
    expect(uncovered.insuranceEmployer).toBeCloseTo(15000 * 0.02, 2);
    // The floor raises a wage that is insured; a wage that is not insured at
    // all is not raised to it.
    const lowCovered = calc({ basicSalary: 500, housingAllowance: 0 });
    const lowUncovered = calc({ basicSalary: 500, housingAllowance: 0, insuranceCovered: false });
    expect(lowCovered.insuranceEmployee).toBeCloseTo(2000 * 0.0975, 2);
    expect(lowUncovered.insuranceEmployee).toBe(0);
  });

  it('deducts absent days from net', () => {
    const r = calc({ basicSalary: 3000, absentDays: 2 });
    const dailyRate = 3000 / 21;
    expect(r.absentDeduction).toBeCloseTo(dailyRate * 2, 2); // 285.714
    expect(r.netSalary).toBeCloseTo(r.grossSalary - r.insuranceEmployee - r.absentDeduction, 2);
  });

  it('takes the length of the month from the country weekend', () => {
    // Egypt works Saturday to Thursday, so its month is paid for 26 days.
    const r = calc({ basicSalary: 3000, absentDays: 2 }, egConfig);
    expect(r.absentDeduction).toBeCloseTo((3000 / 26) * 2, 2); // 230.769
  });

  it('charges an employee who missed the whole month the whole wage', () => {
    // The point of the working-day basis: a month is paid for the days the
    // employee is expected to work, so missing all of them costs all of it.
    const r = calc({ basicSalary: 10000, housingAllowance: 5000, absentDays: 21 });
    expect(r.absentDeduction).toBeCloseTo(15000, 2);
  });

  it('splits net salary for split payment (40% cash / 60% bank)', () => {
    const r = calc({ basicSalary: 10000, paymentMethod: 'split', cashPercentage: 40 });
    expect(r.cashAmount).toBeCloseTo(r.netSalary * 0.4, 2);
    expect(r.bankAmount).toBeCloseTo(r.netSalary * 0.6, 2);
    expect(r.cashAmount + r.bankAmount).toBeCloseTo(r.netSalary, 2);
  });

  it('assigns all net to cash for cash payment', () => {
    const r = calc({ basicSalary: 5000, paymentMethod: 'cash' });
    expect(r.cashAmount).toBeCloseTo(r.netSalary, 2);
    expect(r.bankAmount).toBe(0);
  });

  it('assigns all net to bank for bank payment', () => {
    const r = calc({ basicSalary: 5000, paymentMethod: 'bank' });
    expect(r.cashAmount).toBe(0);
    expect(r.bankAmount).toBeCloseTo(r.netSalary, 2);
  });

  it('calculates EOS accrual monthly (basic × monthsPerYear / 12)', () => {
    const r = calc({ basicSalary: 12000 });
    // eos basis = last_basic, monthsPerYear = 0.5
    // monthly accrual = 12000 * 0.5 / 12 = 500
    expect(r.eosAccrual).toBeCloseTo(500, 2);
  });

  it('calculates annual leave accrual monthly', () => {
    const r = calc({ basicSalary: 12000, housingAllowance: 0 });
    // A month is paid for 21 working days, so a day of leave is worth
    // 12000/21 = 571.43 and the monthly accrual is (21/12) * 571.43 = 1000 —
    // which is exactly 21 days of leave a year.
    expect(r.annualLeaveAccrual).toBeCloseTo(1000, 2);
  });

  it('calculateBatch returns results for all inputs', () => {
    const inputs = [
      { ...baseInput, employeeId: 1, basicSalary: 10000 },
      { ...baseInput, employeeId: 2, basicSalary: 20000 },
    ];
    const results = PayrollCalculator.calculateBatch(inputs, saConfig);
    expect(results).toHaveLength(2);
    expect(results[0].employeeId).toBe(1);
    expect(results[1].employeeId).toBe(2);
    expect(results[1].grossSalary).toBeGreaterThan(results[0].grossSalary);
  });

  describe('additional salary (دفعة خارج الدورة)', () => {
    it('aggregates earning and deduction lines into signed totals', () => {
      const agg = PayrollCalculator.aggregateAdditionalSalaries([
        { type: 'earning', amount: 1000 },
        { type: 'earning', amount: 250.555 },
        { type: 'deduction', amount: 300 },
      ]);
      expect(agg.earnings).toBeCloseTo(1250.56, 2);
      expect(agg.deductions).toBeCloseTo(300, 2);
    });

    it('adds off-cycle earnings to net and reports them in details', () => {
      const r = calc({
        basicSalary: 10000,
        housingAllowance: 5000,
        additionalSalaries: [
          { type: 'earning', amount: 2000 },
          { type: 'deduction', amount: 500 },
        ],
      });
      // gross = 15000 (10k basic + 5k housing), insEmp = 1462.5 (base 15000);
      // net = gross - insEmp - 500 + 2000 = 15037.5
      expect(r.calculationDetails.additionalEarnings).toBeCloseTo(2000, 2);
      expect(r.calculationDetails.additionalDeductions).toBeCloseTo(500, 2);
      expect(r.netSalary).toBeCloseTo(15000 - 1462.5 + 2000 - 500, 2);
    });
  });

  describe('tax exemption (إثبات إعفاء ضريبي)', () => {
    it('reduces taxable income before progressive tax is applied', () => {
      // taxable 45000 → 1875 tax normally; with 15000 exemption → taxable 30000
      const r = calc({ basicSalary: 45000, taxExemptions: 15000 }, egConfig);
      // brackets on 30000: 0*15000 + 0.025*15000 = 375
      expect(r.taxAmount).toBeCloseTo(375, 2);
      expect(r.calculationDetails.taxExemptions).toBe(15000);
      expect(r.calculationDetails.taxableIncome).toBe(30000);
    });

    it('cannot drive taxable income negative', () => {
      const r = calc({ basicSalary: 10000, taxExemptions: 999999 }, egConfig);
      expect(r.calculationDetails.taxableIncome).toBe(0);
      expect(r.taxAmount).toBe(0);
    });
  });

  describe('gratuity (مكافأة نهاية الخدمة)', () => {
    const basis = (b: number) => b; // SA basis = last_basic

    it('returns 0 for service under 1 year', () => {
      expect(PayrollCalculator.calculateEndOfService(0.5, 5000, saConfig)).toBe(0);
    });

    it('pays half a month per year for the first 5 years', () => {
      // 3 years * 0.5 * 5000 = 7500
      expect(PayrollCalculator.calculateEndOfService(3, 5000, saConfig)).toBe(7500);
    });

    it('pays a full month per year after the 5th year (Saudi cliff)', () => {
      // 8 years = 5*0.5 + 3*1 = 5.5 months * 5000 = 27500
      expect(PayrollCalculator.calculateEndOfService(8, 5000, saConfig)).toBe(27500);
    });

    it('honours maxYears cap for linear rule types', () => {
      const capped = { ...saConfig, eos: { ...saConfig.eos, type: '30_days_per_year' as const, maxYears: 5 } };
      // 8 years linear = 8 months but capped at 5 → 5*5000 = 25000
      expect(PayrollCalculator.calculateEndOfService(8, 5000, capped)).toBe(25000);
    });

    it('uses 21-days-per-year rule when configured', () => {
      const r21 = { ...saConfig, eos: { ...saConfig.eos, type: '21_days_per_year' as const } };
      // 3 years * (21/30) * 5000 = 10500
      expect(PayrollCalculator.calculateEndOfService(3, 5000, r21)).toBe(10500);
    });
  });
});
