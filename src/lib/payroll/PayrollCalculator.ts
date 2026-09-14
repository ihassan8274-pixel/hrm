import type { CountryConfig } from './payroll-types';
import { PayrollInput, PayrollResult } from './payroll-types';

export class PayrollCalculator {
  static calculate(input: PayrollInput, rules: CountryConfig): PayrollResult {
    const { basicSalary, housingAllowance, transportAllowance, otherAllowances, deductions, loanDeduction, absentDays, overtimeHours } = input;
    
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
    
    // 7. Taxable income
    const taxableIncome = grossSalary - insuranceEmployee - (deductions || 0);
    const taxAmount = this.calculateTax(taxableIncome, rules);
    
    // 8. Total deductions
    const totalDeductions = insuranceEmployee + taxAmount + (deductions || 0) + (loanDeduction || 0) + absentDeduction;
    
    // 9. Net salary
    const netSalary = grossSalary + overtimePay - totalDeductions;
    
    // 10. Employer cost
    const employerTotalCost = grossSalary + overtimePay + insuranceEmployer;
    
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
        taxBracketsUsed: rules.tax.type === 'progressive' ? 'progressive' : rules.tax.type === 'flat' ? `flat ${rules.tax.flatRate}%` : 'none'
      }
    };
  }

  private static calculateDailyRate(basicSalary: number, housingAllowance: number, rules: CountryConfig): number {
    // Saudi and GCC: 30 days basis
    // Egypt: 30 days basis
    // Some countries use 26 working days
    const monthDays = rules.workTime.daysPerWeek === 5 ? 26 : 30;
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