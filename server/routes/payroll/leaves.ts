import db, { logAction } from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { validateBody, leaveCreateSchema, leaveStatusUpdateSchema } from "../../middleware/validation";

/**
 * Leave requests: an employee asks for time off, the request sits pending
 * until it is approved or rejected.
 */
export function registerLeaves(app: express.Express) {
  app.get("/api/leaves", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const leaves = (await db.prepare(`
      SELECT l.*, e.name as employee_name
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      WHERE (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
      ORDER BY l.created_at DESC
    `).all(...scopeFilter(scope)));
    res.json(leaves);
  });

  app.post("/api/leaves", requireOrganizationScope, validateBody(leaveCreateSchema), async (req, res) => {
    const { employee_id, type, start_date, end_date, days, reason } = req.body;
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    if ((type === 'annual' || type === 'سنوية') && days) {
      const used = ((await db.prepare(`
        SELECT COALESCE(SUM(days),0) as d FROM leaves
        WHERE employee_id = ? AND status = 'approved' AND (type = 'annual' OR type LIKE '%سنو%')
        AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      `).get(employee_id)) as any).d || 0;
      const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
      const cap = Number(emp?.annual_leave_balance ?? emp?.annual_leave_days ?? 21);
      if (used + Number(days) > cap) {
        return res.status(400).json({ error: `رصيد الإجازة السنوية لا يكفي (المستخدم ${used} من ${cap})` });
      }
    }
    // No `is_paid` column: the table tracks paid status via the leave `type`
    // ('unpaid' vs others). The old INSERT named a column that does not exist,
    // so every leave request 500'd.
    const info = (await db.prepare(`
      INSERT INTO leaves (employee_id, type, start_date, end_date, days, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(employee_id, type, start_date, end_date, days, reason));
    await logAction('create', 'leave', Number(info.lastInsertRowid), `Requested leave for employee ${employee_id}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/leaves/:id", requireOrganizationScope, validateBody(leaveStatusUpdateSchema), async (req, res) => {
    const { status } = req.body;
    const row = (await db.prepare('SELECT employee_id FROM leaves WHERE id = ?').get(req.params.id)) as { employee_id: number } | undefined;
    if (!row) return res.status(404).json({ error: 'الإجازة غير موجودة' });
    if (await denyEmployee(res, organizationScope(res), row.employee_id, 'الإجازة')) return;
    (await db.prepare("UPDATE leaves SET status = ? WHERE id = ?").run(status, req.params.id));
    await logAction('update', 'leave', Number(req.params.id), `Leave status updated to ${status}`);
    res.json({ success: true });
  });
}
