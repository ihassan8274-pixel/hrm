// Route module. Registered from server/index.ts; the order there is the route order.
import db from "../config/postgres";
import express from "express";
import { requireRole } from "../middleware/auth";
import { requireOrganizationScope, organizationScope } from "../middleware/organizationScope";
import { resolveOrganizationScope, ScopeError, optionalId } from "../lib/organization-scope";
import { buildConsolidatedReport } from "../lib/consolidated-report";
import { buildCompanySalaryReport, buildBranchSalaryReport, buildPayrollStatement, buildProvisionsReport } from "../lib/salary-reports";
import { buildExecutiveAnalytics } from "../lib/executive-analytics";
import { buildDashboardStats, buildPayrollTrends, buildHeadcount } from "../lib/dashboard-analytics";
import { csvDocument } from "../lib/csv";

export function registerReports(app: express.Express) {

  // Every report answers inside the caller's organization scope. Scope refusals
  // keep their Arabic message and status; anything else falls through to the
  // central JSON error handler.
  async function sendScoped(res: express.Response, build: () => Promise<unknown>) {
    try {
      res.json(await build());
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }

  // ---- Dashboard aggregates (dashboard screen: admin, hr_manager, finance, branch_manager) ----

  app.get("/api/stats", requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildDashboardStats(db, organizationScope(res))));

  app.get('/api/analytics/payroll-trends', requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildPayrollTrends(db, organizationScope(res))));

  app.get('/api/analytics/headcount', requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildHeadcount(db, organizationScope(res))));

  // ---- Excel Direct Link API (CSV for Excel "Get Data from Web") ----

  app.get('/api/excel/employees', requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      const data = (await db.prepare(`
        SELECT e.id, e.name, e.position, d.name as department, b.name as branch, e.basic_salary as salary, e.bank_account
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
        ORDER BY e.id
      `).all(entityId, entityId, branchId, branchId, employeeId, employeeId)) as any[];
      const csv = csvDocument(
        ['ID', 'Name', 'Position', 'Department', 'Branch', 'Salary', 'Bank Account'],
        data.map(r => [r.id, r.name, r.position, r.department, r.branch, r.salary, r.bank_account]),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=employees_raw.csv');
      res.send('\uFEFF' + csv);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  app.get('/api/excel/payroll', requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      // Month/year are optional here: the Excel web query pulls the full register
      // by default, and a period filter narrows it without changing the URL shape.
      const month = optionalId(req.query.month, 'الشهر');
      const year = optionalId(req.query.year, 'السنة');
      const data = (await db.prepare(`
        SELECT p.id, e.name as employee, p.month, p.year, p.basic_salary, p.allowances, p.deductions, p.net_salary, p.processed_at
        FROM payroll p
        JOIN employees e ON p.employee_id = e.id
        WHERE (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
          AND (? IS NULL OR p.month = ?) AND (? IS NULL OR p.year = ?)
        ORDER BY p.year, p.month, p.id
      `).all(entityId, entityId, branchId, branchId, employeeId, employeeId, month, month, year, year)) as any[];
      const csv = csvDocument(
        ['ID', 'Employee', 'Month', 'Year', 'Basic', 'Allowances', 'Deductions', 'Net', 'Date'],
        data.map(r => [r.id, r.employee, r.month, r.year, r.basic_salary, r.allowances, r.deductions, r.net_salary, r.processed_at]),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=payroll_raw.csv');
      res.send('\uFEFF' + csv);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  // ---- Executive boardroom (executive_board screen: admin, hr_manager) ----

  app.get("/api/executive/analytics", requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildExecutiveAnalytics(db, organizationScope(res))));

  // ---- Salary reports (salary_reports screen: admin, hr_manager, finance) ----

  app.get("/api/reports/company-salary", requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildCompanySalaryReport(db, organizationScope(res), req.query)));

  app.get("/api/reports/branch-salary", requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildBranchSalaryReport(db, organizationScope(res), req.query)));

  app.get("/api/reports/payroll-statement", requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildPayrollStatement(db, organizationScope(res), req.query)));

  app.get("/api/reports/provisions", requireOrganizationScope, (req, res) =>
    sendScoped(res, () => buildProvisionsReport(db, organizationScope(res), req.query)));

  // ---- Consolidated cross-branch report (consolidated_reports screen) ----

  app.get("/api/reports/consolidated", requireRole('admin', 'hr_manager', 'finance'), requireOrganizationScope, async (req, res, next) => {
    try {
      const allowed = (await resolveOrganizationScope(db, (req as any).user.id, {}));
      res.json(await buildConsolidatedReport(db, organizationScope(res), allowed, req.query));
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  });

}