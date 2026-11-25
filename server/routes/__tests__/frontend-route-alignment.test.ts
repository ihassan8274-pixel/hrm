import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two buttons shipped pointing at API paths that were never registered, so a
 * user press returned 404. The route table snapshot is server-side; these
 * assertions pin the matching client calls so a copy-paste from an older
 * screen cannot silently reintroduce the same defect.
 */
const ROOT = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("frontend calls only registered routes", () => {
  it("deletes an employee document through /api/employee-documents/:id", () => {
    const view = source("src/components/EmployeeDocumentsView.tsx");
    expect(view).toContain("/api/employee-documents/${id}");
    expect(view).not.toContain("/api/documents/${id}");
  });

  it("reports a work injury to GOSI through the registered PUT route", () => {
    const view = source("src/components/WorkInjuriesView.tsx");
    expect(view).toContain("/api/work-injuries/${id}");
    expect(view).not.toContain("/api/work-injuries/${id}/report-gosi");
  });

  it("calls only registered endpoints from the six extended report tabs", () => {
    const view = source("src/components/ExtendedReportsView.tsx");
    for (const path of [
      "/api/reports/attendance-duty",
      "/api/reports/payroll-overtime",
      "/api/reports/expiry-alerts",
      "/api/reports/ksa-compliance",
      "/api/reports/training-promotions",
      "/api/reports/service-termination",
    ]) {
      expect(view).toContain(`'${path}'`);
      expect(view).toContain("/csv${query}"); // CSV is built from the same registered path
    }
  });

  it("keeps the extended reports screen off ESS and branch manager sidebars", () => {
    const app = source("src/App.tsx");
    expect(app).toContain("if (role === 'admin' || role === 'hr_manager') return true;");
    const finance = app.match(/if \(role === 'finance'\)[^\n]+/)?.[0] || "";
    expect(finance).toContain("'extended_reports'");
    const ess = app.match(/if \(role === 'employee_ess'\)[^\n]+/)?.[0] || "";
    expect(ess).not.toContain("extended_reports");
    const branch = app.match(/if \(role === 'branch_manager'\)[^\n]+/)?.[0] || "";
    expect(branch).not.toContain("extended_reports");
  });
});
