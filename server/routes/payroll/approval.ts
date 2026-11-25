import db, { logAction } from "../../config/postgres";
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { isPayrollApproved } from "../../lib/payroll/approval";

/**
 * Payroll approval is an explicit decision, separate from generation and from
 * payment. A row cannot be approved twice, and approval is a precondition for
 * every bank export — the UI only mirrors this rule.
 */
export function registerPayrollApproval(app: express.Express) {
  app.get("/api/payroll/approval-status", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!month || !year) return res.status(400).json({ error: "الشهر والسنة مطلوبان" });
      const scope = organizationScope(res);
      const rows = (await db.prepare(`
        SELECT p.*, e.name AS employee_name,
               CASE WHEN p.approval_status IS NULL THEN 1 ELSE 0 END AS is_legacy
        FROM payroll p JOIN employees e ON p.employee_id = e.id
        WHERE p.month = ? AND p.year = ?
          AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
        ORDER BY e.name
      `).all(month, year, ...scopeFilter(scope))) as any[];
      res.json({
        month, year,
        total: rows.length,
        approved: rows.filter((r) => isPayrollApproved(r)).length,
        pending: rows.filter((r) => !isPayrollApproved(r)).length,
        paid: rows.filter((r) => r.payment_status === 'paid').length,
        legacy: rows.filter((r) => r.is_legacy).length,
        rows,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/payroll/approve", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { month, year, employee_ids } = req.body || {};
      if (!month || !year) return res.status(400).json({ error: "الشهر والسنة مطلوبان" });
      const scope = organizationScope(res);
      const rows = (await db.prepare(`
        SELECT p.id, p.employee_id, p.approval_status, p.payment_status
        FROM payroll p JOIN employees e ON p.employee_id = e.id
        WHERE p.month = ? AND p.year = ?
          AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
      `).all(month, year, ...scopeFilter(scope))) as any[];
      const wanted = Array.isArray(employee_ids) && employee_ids.length
        ? new Set(employee_ids.map(Number))
        : null;
      const targets = wanted ? rows.filter((r) => wanted.has(Number(r.employee_id))) : rows;
      if (!targets.length) return res.status(404).json({ error: "لا توجد مسيرات مطابقة ضمن نطاقك" });
      for (const row of targets) {
        if (await denyEmployee(res, scope, Number(row.employee_id))) return;
        if (row.payment_status === 'paid') {
          return res.status(409).json({ error: `المسير المصروف لا يمكن اعتماده مجدداً (موظف ${row.employee_id})` });
        }
      }
      const user = (req as any).user;
      const approver = user?.username || 'system';
      const affected = targets.filter((r) => !isPayrollApproved(r));
      const dbNow = new Date().toISOString();
      for (const row of affected) {
        await db.prepare("UPDATE payroll SET approval_status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?")
          .run(approver, dbNow, row.id);
      }
      await logAction('approve', 'payroll', null,
        `اعتماد مسير ${month}/${year} لعدد ${affected.length} موظف بواسطة ${approver}`);
      res.json({
        success: true,
        approved: affected.length,
        alreadyApproved: targets.length - affected.length,
        totalApproved: targets.length,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
