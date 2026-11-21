export interface InsuranceRules {
  employeeRate: number;
  employerRate: number;
  ceiling?: number;
  floor?: number;
  ceilingAppliedOn: 'gross' | 'basic_plus_housing';
  /**
   * The rates for a worker the scheme does not cover — an expatriate.
   *
   * Such a worker pays no employee contribution, and the employer pays the
   * occupational hazards rate instead: 2% in Saudi Arabia, nothing in a
   * country whose scheme covers everyone.
   */
  uncoveredEmployeeRate?: number;
  uncoveredEmployerRate?: number;
}

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface EOSRules {
  type: 'half_month_per_year' | '21_days_per_year' | '30_days_per_year' | 'custom';
  monthsPerYear: number;
  maxYears?: number;
  basis: 'last_basic' | 'last_total' | 'average_last_3';
}

export interface LeaveRules {
  annualDays: number;
  sickDays: number;
  maternityDays: number;
  paternityDays: number;
  carryForwardMax?: number;
}

export interface WorkTimeRules {
  hoursPerDay: number;
  daysPerWeek: number;
  weekendDays: number[];
  overtimeRate: number;
  ramadanHoursPerDay?: number;
}

export interface WPSRules {
  format: 'sama' | 'uae_wps' | 'egypt_sif' | 'jordan_ips' | 'bahrain_eps' | 'kuwait_wps';
  bankCodeLength: number;
  routingCodeLength: number;
}

export interface CountryConfig {
  code: string;
  name_ar: string;
  name_en: string;
  currency: string;
  currency_symbol_ar: string;
  currency_symbol_en: string;
  insurance: InsuranceRules;
  tax: { type: 'none' | 'progressive' | 'flat'; brackets?: TaxBracket[]; flatRate?: number };
  eos: EOSRules;
  leaves: LeaveRules;
  workTime: WorkTimeRules;
  wps: WPSRules;
}

export interface PayrollInput {
  employeeId: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  deductions: number;
  loanDeduction: number;
  absentDays: number;
  overtimeHours: number;
  paymentMethod?: 'cash' | 'bank' | 'split';
  cashPercentage?: number;
  /** Verified one-off off-cycle additions/deductions for this period (دفعة خارج الدورة). */
  additionalSalaries?: { type: 'earning' | 'deduction'; amount: number }[];
  /**
   * The days of approved unpaid leave in the period.
   *
   * They are deducted once, as unpaid leave: not as absence (the employee was
   * on the establishment's books) and not paid either.
   */
  unpaidLeaveDays?: number;
  /**
   * Whether the social insurance scheme covers this employee.
   *
   * A worker outside the scheme pays no employee contribution; the employer
   * pays the occupational hazards rate instead. Undefined means covered.
   */
  insuranceCovered?: boolean;
  /** Verified income-tax exemptions for this period (إثبات إعفاء ضريبي). */
  taxExemptions?: number;
}

export interface PayrollResult {
  employeeId: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  totalAllowances: number;
  grossSalary: number;
  overtimePay: number;
  insuranceEmployee: number;
  insuranceEmployer: number;
  taxAmount: number;
  absentDeduction: number;
  /** The unpaid leave of the period, deducted once. */
  unpaidLeaveDeduction: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  employerInsurance: number;
  employerTotalCost: number;
  eosAccrual: number;
  annualLeaveAccrual: number;
  cashAmount: number;
  bankAmount: number;
  calculationDetails: {
    insuranceBase: number;
    taxableIncome: number;
    dailyRate: number;
    insuranceCeilingApplied: boolean;
    taxBracketsUsed: string;
    taxExemptions: number;
    additionalEarnings: number;
    additionalDeductions: number;
  };
}

export interface PayrollSummary {
  totalEmployees: number;
  totalBasicSalary: number;
  totalAllowances: number;
  totalGross: number;
  totalOvertime: number;
  totalInsuranceEmployee: number;
  totalInsuranceEmployer: number;
  totalTax: number;
  totalNet: number;
  totalEmployerCost: number;
  totalEOSAccrual: number;
  totalLeaveAccrual: number;
  byPaymentMethod: {
    cash: number;
    bank: number;
    split: number;
  };
}