import { CountryRulesService } from "../../../src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "../../../src/lib/payroll/PayrollCalculator";
import { dailyBasisFor } from "../../../src/lib/payroll/working-days";
import { unpaidLeaveDaysInPeriod } from "../attendance-absence";
import { isGosiExempt, isInsuranceCovered } from "../country-rules";
import { loanDeductionForPeriod } from "../loan-schedule";
import { splitNetPayment } from "./payment-split";
import { resolveOvertimeHours } from "./overtime-source";

/**
 * The single source of truth for one payroll row.
 *
 * Generation and the recalculation preview both call this function. Keeping the
 * KSA math in one place is what makes a preview trustworthy: a preview that
 * used a second, slightly different formula would promise an amount the
 * generator would never write.
 *
 * This function is read-only. Applying loan instalments and writing the row are
 * deliberately left to the caller.
 */
export async function buildPayrollRowFromSource(
  db: any,
  emp: any,
  month: number,
  year: number,
) {
  const att = (await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND month = ? AND year = ?")
    .get(emp.id, month, year)) as any || { absence_days: 0, overtime_hours: 0 };
  const loans = (await db.prepare("SELECT * FROM loans WHERE employee_id = ? AND status = 'active'")
    .all(emp.id)) as any[];
  const bp = (await db.prepare("SELECT type, SUM(amount) as total FROM bonuses_penalties WHERE employee_id = ? AND month = ? AND year = ? GROUP BY type")
    .all(emp.id, month, year)) as any[];
  const monthBonus = bp.find((x) => x.type === "bonus")?.total || 0;
  const monthPenalty = bp.find((x) => x.type === "penalty")?.total || 0;
  const addRows = (await db.prepare(`
    SELECT type, amount FROM additional_salaries
    WHERE employee_id = ? AND month = ? AND year = ?
  `).all(emp.id, month, year)) as { type: "earning" | "deduction"; amount: number }[];
  const add = PayrollCalculator.aggregateAdditionalSalaries(addRows);
  const taxExemptions = ((await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as t FROM tax_exemption_declarations
    WHERE employee_id = ? AND (year IS NULL OR year = ?)
  `).get(emp.id, Number(year))) as any)?.t || 0;

  // Each loan carries its own salary-deduction schedule; several loans are summed.
  const loanStates = loans.map((loan) => ({
    loan,
    state: loanDeductionForPeriod(loan, Number(month), Number(year)),
  }));
  const loanDeduction = loanStates.reduce((sum, item) => sum + item.state.deduction, 0);

  // A month is paid for the working days of the country, so the daily rate —
  // and the hourly rate of overtime — follow that country's own week.
  const countryRules = await CountryRulesService.getEntityRules(emp.entity_id);
  const workTime = countryRules.workTime;
  const basis = dailyBasisFor(workTime);
  const dailyRate = (emp.basic_salary + (emp.housing_allowance || 0)) / basis;
  const hourlyRate = dailyRate / workTime.hoursPerDay;
  const absenceDeduction = att.absence_days * dailyRate;
  const overtime = await resolveOvertimeHours(db, emp.id, month, year, att.overtime_hours);
  const overtimePay = overtime.hours * hourlyRate * 1.5;
  const unpaidLeaveDays = await unpaidLeaveDaysInPeriod(db, emp.id, Number(month), Number(year));
  const unpaidLeaveDeduction = unpaidLeaveDays * dailyRate;
  const housing = emp.housing_allowance || 0;
  const transport = emp.transport_allowance || 0;
  const gosiWage = Math.min(45000, Number(emp.basic_salary) + Number(housing));

  const covered = isInsuranceCovered(emp);
  const isSaudi = covered ? 1 : 0;
  const insEmpRate = covered ? countryRules.insurance.employeeRate / 100 : (countryRules.insurance.uncoveredEmployeeRate ?? 0) / 100;
  const insCompRate = covered ? countryRules.insurance.employerRate / 100 : (countryRules.insurance.uncoveredEmployerRate ?? 0) / 100;
  const insEmpShare = Math.round(gosiWage * insEmpRate * 100) / 100;
  const insCompShare = Math.round(gosiWage * insCompRate * 100) / 100;
  const gosiExempt = isGosiExempt(emp);
  const deductedInsEmpShare = gosiExempt ? 0 : insEmpShare;
  const employerInsShare = gosiExempt
    ? Math.round((insEmpShare + insCompShare) * 100) / 100
    : insCompShare;

  const totalAllowances = emp.allowances + housing + transport + (emp.other_allowances || 0) + overtimePay + monthBonus + add.earnings;
  const totalDeductions = emp.deductions + absenceDeduction + unpaidLeaveDeduction + loanDeduction + monthPenalty + deductedInsEmpShare + add.deductions;
  const taxableIncome = Math.max(0, emp.basic_salary + totalAllowances - totalDeductions - taxExemptions);
  // Tax comes from the country rules, never from a global flat setting.
  const taxAmount = PayrollCalculator.calculateTax(taxableIncome, countryRules);
  const net = taxableIncome - taxAmount;

  const payMethod = emp.payment_method || "bank";
  const { cashAmount, bankAmount } = splitNetPayment(net, payMethod, emp.cash_percentage);

  return {
    values: {
      basic_salary: emp.basic_salary,
      allowances: totalAllowances,
      deductions: totalDeductions,
      tax_amount: taxAmount,
      insurance_emp_share: deductedInsEmpShare,
      insurance_comp_share: employerInsShare,
      bonuses: monthBonus,
      penalties: monthPenalty,
      net_salary: net,
      national_id_iqama: emp.national_id_iqama || "",
      is_saudi: isSaudi,
      housing_allowance: housing,
      transport_allowance: transport,
      gosi_number: emp.gosi_number || "",
      gosi_salary: gosiWage,
      // Never invent a bank: an empty name blocks the bank export until the
      // employee's bank is recorded, instead of paying into a guess.
      saudi_iban: emp.saudi_iban || emp.bank_account || "",
      bank_name: emp.bank_name || "",
      payment_method: payMethod,
      cash_amount: cashAmount,
      bank_amount: bankAmount,
    },
    loanStates,
    sources: {
      absence_days: att.absence_days || 0,
      overtime_hours: overtime.hours,
      overtime_hours_raw: Number(att.overtime_hours) || 0,
      overtime_suppressed_by_approved_record: overtime.suppressedByApprovedRecord ? 1 : 0,
      overtime_approved_record_count: overtime.approvedRecordCount,
      overtime_approved_pay: overtime.approvedPay,
      unpaid_leave_days: unpaidLeaveDays,
      month_bonus: monthBonus,
      month_penalty: monthPenalty,
      additional_earnings: add.earnings,
      additional_deductions: add.deductions,
      tax_exemptions: taxExemptions,
      loan_deduction: loanDeduction,
      daily_rate: dailyRate,
      hourly_rate: hourlyRate,
      gosi_exempt: gosiExempt ? 1 : 0,
      country: countryRules.code || null,
    },
  };
}
