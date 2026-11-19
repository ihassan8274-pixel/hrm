import db from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope } from "../../middleware/organizationScope";
import { validateBody, departmentBudgetUpdateSchema } from "../../middleware/validation";

/**
 * HR budgeting & forecasting (ميزانية الموارد البشرية والرواتب).
 *
 * A department budget belongs to the entity of its department, so the
 * caller's scope decides whether the row may be touched at all.
 */
export function registerDepartmentBudgets(app: express.Express) {
  app.get("/api/budgets/departments", requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const rows = (await db.prepare(`
        SELECT b.*, d.name as department_name,
               (SELECT COUNT(*) FROM employees e WHERE e.department_id = b.department_id) as current_headcount
        FROM department_budgets b
        LEFT JOIN departments d ON b.department_id = d.id
        WHERE (? IS NULL OR d.entity_id = ?)
        ORDER BY b.department_id ASC
      `).all(scope.entityId, scope.entityId));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع ميزانيات الإدارات" });
    }
  });

  app.put("/api/budgets/departments/:id", requireOrganizationScope, validateBody(departmentBudgetUpdateSchema), async (req, res) => {
    try {
      const scope = organizationScope(res);
      const { allocated_salaries, allocated_gosi, allocated_medical, allocated_work_permits, allocated_flight_tickets, allocated_end_of_service, allocated_training_rewards, headcount_cap } = req.body;
      // A department budget belongs to the entity of its department, so the
      // caller's scope decides whether this row may be touched at all.
      const budget = (await db.prepare(`
        SELECT b.id, d.entity_id as entity_id
        FROM department_budgets b
        LEFT JOIN departments d ON b.department_id = d.id
        WHERE b.id = ?
      `).get(req.params.id)) as { id: number; entity_id: number | null } | undefined;
      if (!budget) return res.status(404).json({ error: "ميزانية الإدارة غير موجودة" });
      if (scope.entityId !== null && budget.entity_id !== scope.entityId) {
        return res.status(403).json({ error: "ميزانية الإدارة خارج نطاق حسابك" });
      }
      const total = Number(allocated_salaries || 0) + Number(allocated_gosi || 0) + Number(allocated_medical || 0) + Number(allocated_work_permits || 0) + Number(allocated_flight_tickets || 0) + Number(allocated_end_of_service || 0) + Number(allocated_training_rewards || 0);
      (await db.prepare(`
        UPDATE department_budgets
        SET allocated_salaries = ?, allocated_gosi = ?, allocated_medical = ?, allocated_work_permits = ?, allocated_flight_tickets = ?, allocated_end_of_service = ?, allocated_training_rewards = ?, total_allocated = ?, headcount_cap = ?
        WHERE id = ?
      `).run(allocated_salaries, allocated_gosi, allocated_medical, allocated_work_permits, allocated_flight_tickets, allocated_end_of_service, allocated_training_rewards, total, headcount_cap, req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث الميزانية" });
    }
  });
}
