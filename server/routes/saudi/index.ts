import express from "express";
import { registerComplianceSummary, registerExpiringDocuments } from "./compliance";
import { registerGosiReport } from "./gosi";
import { registerRenewalHistory, registerQuickRenew } from "./renewals";
import { registerEndOfServiceCalculator } from "./end-of-service";
import { registerSifDownload, registerWpsAudit } from "./wps";
import { registerGovernmentBudget } from "./budget";
import { registerSalaryCertificates } from "./salary-certificates";
import { registerAccountingProvisions, registerCostOfEmployment } from "./accounting";
import { registerLeaveBalance } from "./leave-balance";
import { registerQiwaContracts } from "./qiwa";
import { registerNitaqatSimulator } from "./nitaqat";

/**
 * Composition root for the Saudi compliance routes.
 *
 * The order of the calls below is the order the routes were registered in before
 * this module was split up, and it is load-bearing: Express answers a request
 * with the first route that matches, so the registration order is part of the
 * public API. It is pinned by server/routes/__tests__/route-table.test.ts —
 * changing the order fails that test on purpose.
 *
 * Two of the WPS routes stay apart on purpose. The SIF download was registered
 * between the end-of-service calculator and the budget planner, while the audit
 * and the JSON export were registered at the very end, next to the Nitaqat
 * simulator. They share one module because they share one engine, but they are
 * registered from their original positions.
 */
export function registerSaudi(app: express.Express) {
  registerComplianceSummary(app);
  registerExpiringDocuments(app);
  registerGosiReport(app);
  registerRenewalHistory(app);
  registerQuickRenew(app);
  registerEndOfServiceCalculator(app);
  registerSifDownload(app);
  registerGovernmentBudget(app);
  registerSalaryCertificates(app);
  registerAccountingProvisions(app);
  registerCostOfEmployment(app);
  registerLeaveBalance(app);
  registerQiwaContracts(app);
  registerNitaqatSimulator(app);
  registerWpsAudit(app);
}
