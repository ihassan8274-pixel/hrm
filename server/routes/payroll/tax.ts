import db, { logAction } from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { validateBody, taxExemptionCreateSchema, taxExemptionVerifySchema } from "../../middleware/validation";

/**
 * Income-tax exemption declarations (إثبات إعفاء ضريبي).
 *
 * The table is keyed by year only — it has no month column — so the payroll
 * filter matches on `year`.
 */
export function registerTaxExemptions(app: express.Express) {
  app.get("/api/tax-exemptions", requireOrganizationScope, async (req, res) => {
    try {
      const { year, employee_id, status } = req.query;
      const scope = organizationScope(res);
      let sql = `
        SELECT t.*, e.name as employee_name
        FROM tax_exemption_declarations t
        JOIN employees e ON t.employee_id = e.id
      `;
      const where: string[] = [];
      const params: any[] = [];
      // The table is keyed by year only — it has no month column, so filtering
      // on one used to throw "no such column: t.month" and 500 the whole list.
      if (year) { where.push("t.year = ?"); params.push(Number(year)); }
      if (employee_id) { where.push("t.employee_id = ?"); params.push(Number(employee_id)); }
      if (status) { where.push("t.status = ?"); params.push(String(status)); }
      where.push("(? IS NULL OR e.entity_id = ?)", "(? IS NULL OR e.branch_id = ?)", "(? IS NULL OR e.id = ?)");
      params.push(...scopeFilter(scope));
      sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY t.created_at DESC";
      res.json((await db.prepare(sql).all(...params)));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/tax-exemptions", requireOrganizationScope, validateBody(taxExemptionCreateSchema), async (req, res) => {
    try {
      const { employee_id, exemption_type, amount, year, proof_file, status } = req.body;
      if (!employee_id || !exemption_type || amount == null) {
        return res.status(400).json({ error: "employee_id و exemption_type و amount مطلوبة" });
      }
      if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
      // No `month` column: the table keys exemptions by year only, and the
      // payroll filter below matches on `year`. The previous INSERT named a
      // month column that does not exist, so every exemption 500'd.
      const info = (await db.prepare(`
        INSERT INTO tax_exemption_declarations (employee_id, exemption_type, amount, year, proof_file, status, verified_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(Number(employee_id), String(exemption_type), Number(amount), year ? Number(year) : null, proof_file || null, status || 'pending', (status === 'verified' ? (req as any).user?.username : null)));
      await logAction('create', 'tax_exemption', Number(info.lastInsertRowid), `إعفاء ضريبي ${exemption_type} ${amount} لموظف ${employee_id} ${status === 'verified' ? '(مُوثَّق)' : '(قيد التوثيق)'}`);
      res.json({ id: info.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.put("/api/tax-exemptions/:id/verify", requireOrganizationScope, validateBody(taxExemptionVerifySchema), async (req, res) => {
    try {
      const { status } = req.body;
      const row = (await db.prepare('SELECT id, employee_id FROM tax_exemption_declarations WHERE id = ?').get(req.params.id)) as any;
      if (!row) return res.status(404).json({ error: "Not found" });
      if (await denyEmployee(res, organizationScope(res), Number(row.employee_id), 'الإعفاء')) return;
      if (!['verified', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: "status يجب أن يكون verified أو rejected أو pending" });
      }
      const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
      (await db.prepare("UPDATE tax_exemption_declarations SET status = ?, verified_by = ?, verified_at = ? WHERE id = ?")
        .run(status, (req as any).user?.username || null, ts, req.params.id));
      await logAction('verify', 'tax_exemption', Number(req.params.id), `توثيق إعفاء ضريبي ${req.params.id} -> ${status}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
