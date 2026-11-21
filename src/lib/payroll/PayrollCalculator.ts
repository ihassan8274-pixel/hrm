import type { CountryConfig } from './payroll-types';
import { PayrollInput, PayrollResult } from './payroll-types';
import { dailyBasisFor } from './working-days';

export class PayrollCalculator {
  static calculate(input: PayrollInput, rules: CountryConfig): PayrollResult {
    const { basicSalary, housingAllowance, transportAllowance, otherAllowances, deductions, loanDeduction, absentDays, overtimeHours } = input;
    const additional = PayrollCalculator.aggregateAdditionalSalaries(input.additionalSalaries || []);

    // 1. Calculate gross earnings
    const totalAllowances = housingAllowance + transportAllowance + otherAllowances;
    const grossSalary = basicSalary + totalAllowances;

    // 2. Daily rate (for absent deduction, EOS, leave accrual)
    const dailyRate = this.calculateDailyRate(basicSalary, housingAllowance, rules);
    
    // 3. Insurance base - what the insurance ceiling applies to
    const insuranceCeilingOn = rules.insurance.ceilingAppliedOn === 'gross' 
      ? grossSalary 
      : basicSalary + housingAllowance;
    
    // 4. Employee insurance
    let insuranceBase = insuranceCeilingOn;
    let insuranceCeilingApplied = false;
    if (rules.insurance.ceiling && insuranceBase > rules.insurance.ceiling) {
      insuranceBase = rules.insurance.ceiling;
      insuranceCeilingApplied = true;
    }
    if (rules.insurance.floor && insuranceBase < rules.insurance.floor) {
      insuranceBase = rules.insurance.floor;
    }
    
    const insuranceEmployee = insuranceBase * (rules.insurance.employeeRate / 100);
    const insuranceEmployer = insuranceBase * (rules.insurance.employerRate / 100);
    
    // 5. Overtime pay
    const hourlyRate = dailyRate / rules.workTime.hoursPerDay;
    const overtimePay = overtimeHours * hourlyRate * rules.workTime.overtimeRate;
    
    // 6. Absent deduction
    const absentDeduction = absentDays * dailyRate;

    // 6b. Verified income-tax exemptions reduce the taxable income (إثبات إعفاء).
    const taxExemptions = Number(input.taxExemptions) || 0;
    
    // 7. Taxable income
    const taxableIncome = Math.max(0, grossSalary - insuranceEmployee - (deductions || 0) - taxExemptions);
    const taxAmount = this.calculateTax(taxableIncome, rules);
    
    // 8. Total deductions
    const totalDeductions = insuranceEmployee + taxAmount + (deductions || 0) + (loanDeduction || 0) + absentDeduction + additional.deductions;
    
    // 9. Net salary
    const netSalary = grossSalary + overtimePay + additional.earnings - totalDeductions;
    
    // 10. Employer cost
    const employerTotalCost = grossSalary + overtimePay + insuranceEmployer + additional.earnings;
    
    // 11. EOS accrual (monthly)
    const eosAccrual = this.calculateMonthlyEOS(basicSalary, housingAllowance, rules);
    
    // 12. Annual leave accrual (monthly)
    const annualLeaveAccrual = (rules.leaves.annualDays / 12) * dailyRate;

    // 13. Payment split (bank / cash)
    let cashAmount = 0;
    let bankAmount = 0;
    if (input.paymentMethod === 'bank') {
      bankAmount = netSalary;
    } else if (input.paymentMethod === 'split' && (input.cashPercentage ?? 0) > 0) {
      const pct = input.cashPercentage!;
      cashAmount = Math.round((netSalary * pct) / 100 * 100) / 100;
      bankAmount = Math.round((netSalary - cashAmount) * 100) / 100;
    } else {
      cashAmount = netSalary;
    }
    
    return {
      employeeId: input.employeeId,
      basicSalary,
      housingAllowance,
      transportAllowance,
      otherAllowances,
      totalAllowances,
      grossSalary,
      overtimePay,
      insuranceEmployee,
      insuranceEmployer,
      taxAmount,
      absentDeduction,
      loanDeduction: loanDeduction || 0,
      otherDeductions: deductions || 0,
      totalDeductions,
      netSalary,
      employerInsurance: insuranceEmployer,
      employerTotalCost,
      eosAccrual,
      annualLeaveAccrual,
      cashAmount,
      bankAmount,
      calculationDetails: {
        insuranceBase,
        taxableIncome,
        dailyRate,
        insuranceCeilingApplied,
        taxBracketsUsed: rules.tax.type === 'progressive' ? 'progressive' : rules.tax.type === 'flat' ? `flat ${rules.tax.flatRate}%` : 'none',
        taxExemptions,
        additionalEarnings: additional.earnings,
        additionalDeductions: additional.deductions
      }
    };
  }

  private static calculateDailyRate(basicSalary: number, housingAllowance: number, rules: CountryConfig): number {
    // A month is paid for the days the employee is expected to work, so the
    // daily rate — and everything derived from it: the absence deduction, the
    // hourly rate for overtime, the leave accrual — divides the wage by the
    // working days of a month.
    //
    // The country's own weekend decides how many that is: 21 days for a
    // five-day week (Friday and Saturday off, which is Saudi Arabia and the
    // Gulf), 26 for a six-day week (Friday off, which is Egypt, Jordan and
    // Kuwait).
    const monthDays = dailyBasisFor(rules.workTime);
    return (basicSalary + housingAllowance) / monthDays;
  }

  private static calculateMonthlyEOS(basicSalary: number, housingAllowance: number, rules: CountryConfig): number {
    const basisSalary = rules.eos.basis === 'last_basic' 
      ? basicSalary 
      : rules.eos.basis === 'last_total'
        ? basicSalary + housingAllowance
        : basicSalary + housingAllowance; // average_last_3 would need history
    
    const monthlyRate = rules.eos.monthsPerYear / 12;
    return basisSalary * monthlyRate;
  }

  // Collapses the one-off off-cycle lines for a period into net earning/deduction totals.
  static aggregateAdditionalSalaries(rows: { type: 'earning' | 'deduction'; amount: number }[]) {
    let earnings = 0;
    let deductions = 0;
    for (const row of rows || []) {
      const amount = Math.round(Number(row.amount || 0) * 100) / 100;
      if (row.type === 'deduction') deductions += amount;
      else earnings += amount;
    }
    return { earnings: Math.round(earnings * 100) / 100, deductions: Math.round(deductions * 100) / 100 };
  }

  /**
   * End-of-service gratuity (مكافأة نهاية الخدمة).
   * Default 'half_month_per_year' follows the Saudi Labour Law cliff:
   *   - < 1 year of service         -> 0
   *   - first 5 years               -> 1/2 month of the basis salary per year
   *   - each year beyond the 5th    -> a full month per year
   * Other rule types use a linear monthly share (21/30 or 30/30 per year),
   * optionally capped by rules.eos.maxYears.
   */
  static calculateEndOfService(serviceYears: number, monthlyBasis: number, rules: CountryConfig): number {
    const years = Math.max(0, serviceYears);
    if (years < 1) return 0;

    const eos = rules.eos;
    let months = 0;

    if (eos.type === 'half_month_per_year') {
      const cappedYears = eos.maxYears ? Math.min(years, eos.maxYears) : years;
      months = Math.min(cappedYears, 5) * 0.5;
      if (cappedYears > 5) months += cappedYears - 5;
    } else if (eos.type === '21_days_per_year') {
      months = Math.min(years, eos.maxYears || Number.MAX_SAFE_INTEGER) * (21 / 30);
    } else if (eos.type === '30_days_per_year') {
      months = Math.min(years, eos.maxYears || Number.MAX_SAFE_INTEGER);
    } else {
      months = Math.min(years, eos.maxYears || Number.MAX_SAFE_INTEGER) * (eos.monthsPerYear || 0);
    }

    return Math.round(monthlyBasis * months * 100) / 100;
  }

  private static calculateTax(taxableIncome: number, rules: CountryConfig): number {
    if (taxableIncome <= 0) return 0;
    
    switch (rules.tax.type) {
      case 'none':
        return 0;
        
      case 'flat':
        return taxableIncome * (rules.tax.flatRate || 0) / 100;
        
      case 'progressive':
        if (!rules.tax.brackets || rules.tax.brackets.length === 0) return 0;
        
        let tax = 0;
        let remaining = taxableIncome;
        
        for (const bracket of rules.tax.brackets) {
          const bracketMax = bracket.max || Infinity;
          const taxableInBracket = Math.min(remaining, bracketMax - bracket.min);
          
          if (taxableInBracket <= 0) break;
          
          tax += taxableInBracket * bracket.rate;
          remaining -= taxableInBracket;
          
          if (remaining <= 0) break;
        }
        
        return tax;
        
      default:
        return 0;
    }
  }

  static calculateBatch(inputs: PayrollInput[], rules: CountryConfig): PayrollResult[] {
    return inputs.map(input => this.calculate(input, rules));
  }

  static getSummary(results: PayrollResult[]) {
    return {
      totalEmployees: results.length,
      totalBasicSalary: results.reduce((s, r) => s + r.basicSalary, 0),
      totalAllowances: results.reduce((s, r) => s + r.totalAllowances, 0),
      totalGross: results.reduce((s, r) => s + r.grossSalary, 0),
      totalOvertime: results.reduce((s, r) => s + r.overtimePay, 0),
      totalInsuranceEmployee: results.reduce((s, r) => s + r.insuranceEmployee, 0),
      totalInsuranceEmployer: results.reduce((s, r) => s + r.insuranceEmployer, 0),
      totalTax: results.reduce((s, r) => s + r.taxAmount, 0),
      totalNet: results.reduce((s, r) => s + r.netSalary, 0),
      totalEmployerCost: results.reduce((s, r) => s + r.employerTotalCost, 0),
      totalEOSAccrual: results.reduce((s, r) => s + r.eosAccrual, 0),
      totalLeaveAccrual: results.reduce((s, r) => s + r.annualLeaveAccrual, 0),
      byPaymentMethod: {
        cash: results.filter(r => r.netSalary > 0 && (r as any).paymentMethod === 'cash').length,
        bank: results.filter(r => r.netSalary > 0 && (r as any).paymentMethod === 'bank').length,
        split: results.filter(r => r.netSalary > 0 && (r as any).paymentMethod === 'split').length
      }
    };
  }
}

export const payrollCalculator = PayrollCalculator;