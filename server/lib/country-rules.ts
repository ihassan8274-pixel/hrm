import { CountryRulesService } from "../../src/lib/payroll/CountryRulesService";
import type { WorkTimeRules } from "../../src/lib/payroll/payroll-types";

/**
 * The working-time rules of the entity an employee belongs to.
 *
 * The country decides the working week, so the weekend comes from the country
 * rules — the same ones the payroll calculation uses. A country with Friday
 * and Saturday off has a five-day week; one with Friday off has six.
 */
export async function workTimeForEntity(entityId: number | null): Promise<WorkTimeRules> {
  if (entityId === null || entityId === undefined) {
    throw new Error("الموظف غير مرتبط بكيان — لا يمكن تحديد أيام العمل له");
  }
  const rules = await CountryRulesService.getEntityRules(entityId);
  return rules.workTime;
}

/**
 * Whether the social insurance scheme covers an employee.
 *
 * The scheme covers the national workers: a Saudi employee is covered, an
 * expatriate is not. An employee outside the scheme pays no employee
 * contribution, and the employer pays the occupational hazards rate instead.
 */
export function isInsuranceCovered(employee: {
  is_saudi?: number | null;
  nationality?: string | null;
}): boolean {
  const nationality = (employee.nationality || "").trim();
  return (
    employee.is_saudi === 1 ||
    nationality === "سعودي" ||
    nationality === "سعودية" ||
    nationality === "Saudi" ||
    nationality === "Saudi Arabia"
  );
}

/**
 * Whether the employee is exempt from the GOSI deduction.
 *
 * An exempt employee keeps the full salary: the employee share is not
 * withheld and the employer carries it in addition to its own share.
 */
export function isGosiExempt(employee: {
  gosi_exempt?: number | boolean | null;
} | null | undefined): boolean {
  return Number(employee?.gosi_exempt) === 1;
}

/**
 * The employer's rate for a worker the social insurance scheme does not
 * cover — 2% in Saudi Arabia.
 *
 * It is read from the settings, the same place the payroll run reads it from,
 * so the two cannot drift apart.
 */
export function uncoveredEmployerRate(settings: Record<string, string>): number {
  return (parseFloat(settings.expat_gosi_comp_rate || "2") || 0) / 100;
}
