import express from "express";
import {
  registerPayrollList,
  registerAttendanceSync,
  registerPayrollLock,
  registerPayrollGenerate,
  registerPayrollCalculate,
  registerPayrollBatch,
} from "./period";
import {
  registerBonusesPenalties,
  registerAdditionalSalaries,
  registerExpenses,
  registerOvertime,
} from "./adjustments";
import { registerLoans } from "./loans";
import { registerLeaves } from "./leaves";
import { registerPayrollCorrections } from "./corrections";
import { registerEndOfService } from "./end-of-service";
import { registerTaxExemptions } from "./tax";
import { registerDepartmentBudgets } from "./budgets";
import { registerSalaryStructures, registerSalaryComponents } from "./structures";
import { registerSalarySlips } from "./slips";
import { registerPayrollApproval } from "./approval";

/**
 * Composition root for the payroll routes.
 *
 * The order of the calls below is the order the routes were registered in
 * before this module was split up, and it is load-bearing: Express answers a
 * request with the first route that matches, so the registration order is
 * part of the public API. It is pinned by
 * server/routes/__tests__/route-table.test.ts — changing the order fails that
 * test on purpose.
 */
export function registerPayroll(app: express.Express) {
  registerPayrollList(app);
  registerBonusesPenalties(app);
  registerLoans(app);
  registerLeaves(app);
  registerAttendanceSync(app);
  registerPayrollLock(app);
  registerAdditionalSalaries(app);
  registerPayrollCorrections(app);
  registerEndOfService(app);
  registerTaxExemptions(app);
  registerPayrollGenerate(app);
  registerExpenses(app);
  registerOvertime(app);
  registerDepartmentBudgets(app);
  registerPayrollCalculate(app);
  registerPayrollBatch(app);
  registerSalaryStructures(app);
  registerSalaryComponents(app);
  registerSalarySlips(app);
  registerPayrollApproval(app);
}
