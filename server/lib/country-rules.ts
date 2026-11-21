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
