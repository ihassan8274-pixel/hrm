import db, { logAction, createNotification } from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { validateBody, bonusPenaltyCreateSchema } from "../../middleware/validation";

/**
 * The lines that move the net salary around a payroll run:
 *
 *   - bonuses & penalties      (مكافآت وجزاءات)
 *   - additional (off-cycle)   (دفعات خارج الدورة)
 *   - expense claims           (المطالبات)
 *   - overtime records         (الساعات الإضافية - المادة 107)
 *
 * They live together because the payroll generator reads all four when it
 * builds a period.
 */

/** Bonuses and penalties booked against a period. */
export function registerBonusesPenalties(app: express.Express) {
  app.get("/api/bonuses-penalties", requireOrganizationScope, async (req, res) => {
    const { month, year } = req.query;
    const scope = organizationScope(res);
    const data = (await db.prepare(`
      SELECT bp.*, e.name as employee_name
      FROM bonuses_penalties bp
      JOIN employees e ON bp.employee_id = e.id
      WHERE bp.month = ? AND bp.year = ?
        AND (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
    `).all(month, year, ...scopeFilter(scope)));
    res.json(data);
  });

  app.post("/api/bonuses-penalties", requireOrganizationScope, validateBody(bonusPenaltyCreateSchema), async (req, res) => {
    const { employee_id, type, amount, reason, month, year } = req.body;
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    const info = (await db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, type, amount, reason, month, year));
    await logAction('create', 'bonus_penalty', Number(info.lastInsertRowid), `Added ${type} to employee ${employee_id}: ${amount}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/bonuses-penalties/:id", requireOrganizationScope, async (req, res) => {
    const row = (await db.prepare('SELECT employee_id FROM bonuses_penalties WHERE id = ?').get(req.params.id)) as { employee_id: number } | undefined;
    if (!row) return res.status(404).json({ error: 'المكافأة/الجزاء غير موجود' });
    if (await denyEmployee(res, organizationScope(res), row.employee_id)) return;
    (await db.prepare("DELETE FROM bonuses_penalties WHERE id = ?").run(req.params.id));
    res.json({ success: true });
  });
}

/** One-off off-cycle lines (دفعة إضافية خارج الدورة). */
export function registerAdditionalSalaries(app: express.Express) {
  app.get("/api/additional-salaries", requireOrganizationScope, async (req, res) => {
    try {
      const { month, year, employee_id } = req.query;
      const scope = organizationScope(res);
      let sql = `
        SELECT a.*, e.name as employee_name
        FROM additional_salaries a
        JOIN employees e ON a.employee_id = e.id
      `;
      const where: string[] = [];
      const params: any[] = [];
      if (month) { where.push("a.month = ?"); params.push(Number(month)); }
      if (year) { where.push("a.year = ?"); params.push(Number(year)); }
      if (employee_id) { where.push("a.employee_id = ?"); params.push(Number(employee_id)); }
      where.push("(? IS NULL OR e.entity_id = ?)", "(? IS NULL OR e.branch_id = ?)", "(? IS NULL OR e.id = ?)");
      params.push(...scopeFilter(scope));
      sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY a.created_at DESC";
      res.json((await db.prepare(sql).all(...params)));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/additional-salaries", requireOrganizationScope, async (req, res) => {
    try {
      const { employee_id, amount, type, component, month, year, reason } = req.body;
      if (!employee_id || !month || !year || amount == null) {
        return res.status(400).json({ error: "employee_id و month و year و amount مطلوبة" });
      }
      if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
      const info = (await db.prepare(`
        INSERT INTO additional_salaries (employee_id, amount, type, component, month, year, reason, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(Number(employee_id), Number(amount), type || 'earning', component || 'one-off', Number(month), Number(year), reason || null, (req as any).user?.username || null));
      await logAction('create', 'additional_salary', Number(info.lastInsertRowid), `دفعة إضافية ${type || 'earning'} ${amount} لموظف ${employee_id} (${month}/${year})`);
      res.json({ id: info.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/additional-salaries/:id", requireOrganizationScope, async (req, res) => {
    try {
      const row = (await db.prepare('SELECT employee_id FROM additional_salaries WHERE id = ?').get(req.params.id)) as any;
      if (!row) return res.status(404).json({ error: "Not found" });
      if (await denyEmployee(res, organizationScope(res), Number(row.employee_id), 'الدفعة')) return;
      (await db.prepare('DELETE FROM additional_salaries WHERE id = ?').run(req.params.id));
      await logAction('delete', 'additional_salary', Number(req.params.id), `حذف دفعة إضافية لموظف ${row.employee_id}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}

/** Expense claims. */
export function registerExpenses(app: express.Express) {
  app.get('/api/expenses', requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const expenses = (await db.prepare(`
      SELECT e.*, emp.name as employee_name
      FROM expense_claims e
      JOIN employees emp ON e.employee_id = emp.id
      WHERE (? IS NULL OR emp.entity_id = ?)
        AND (? IS NULL OR emp.branch_id = ?)
        AND (? IS NULL OR emp.id = ?)
    `).all(...scopeFilter(scope)));
    res.json(expenses);
  });

  app.post('/api/expenses', requireOrganizationScope, async (req, res) => {
    const { employee_id, amount, category, description, date } = req.body;
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    (await db.prepare('INSERT INTO expense_claims (employee_id, amount, category, description, claim_date) VALUES (?, ?, ?, ?, ?)').run(employee_id, amount, category, description, date));
    res.json({ success: true });
  });
}

/**
 * Overtime management (الساعات الإضافية - المادة 107).
 *
 * An approved overtime record is paid out as a bonus line for the same month,
 * so approving one has to write both rows.
 */
export function registerOvertime(app: express.Express) {
  app.get('/api/overtime', requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const data = (await db.prepare(`
      SELECT o.*, e.name as employee_name, e.basic_salary, e.housing_allowance, e.transport_allowance
      FROM overtime_records o
      JOIN employees e ON o.employee_id = e.id
      WHERE (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
      ORDER BY o.created_at DESC
    `).all(...scopeFilter(scope)));
    res.json(data);
  });

  app.post('/api/overtime', requireOrganizationScope, async (req, res) => {
    const { employee_id, date, normal_hours, weekend_hours, holiday_hours, reason } = req.body;
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const wageBase = emp.basic_salary + (emp.housing_allowance || 0) + (emp.transport_allowance || 0);
    const hourlyRate = Math.round((wageBase / 240) * 100) / 100;
    const nHours = parseFloat(normal_hours) || 0;
    const wHours = parseFloat(weekend_hours) || 0;
    const hHours = parseFloat(holiday_hours) || 0;
    const normalPay = nHours * (hourlyRate * 1.5);
    const weekendPay = wHours * (hourlyRate * 1.5);
    const holidayPay = hHours * (hourlyRate * 2.0); // official holidays 200%
    const totalPay = Math.round((normalPay + weekendPay + holidayPay) * 100) / 100;
    const d = new Date(date || Date.now());
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const result = (await db.prepare(`
      INSERT INTO overtime_records (employee_id, date, normal_hours, weekend_hours, holiday_hours, hourly_rate, total_overtime_pay, status, reason, month, year)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(employee_id, date, nHours, wHours, hHours, hourlyRate, totalPay, reason || 'عمل إضافي لإنجاز مهام المشروع', month, year));
    await logAction('create', 'overtime', Number(result.lastInsertRowid), `Logged overtime for ${emp.name}: ${totalPay} SAR`);
    res.json({ success: true, id: result.lastInsertRowid, total_overtime_pay: totalPay, hourly_rate: hourlyRate });
  });

  app.post('/api/overtime/:id/approve', requireOrganizationScope, async (req, res) => {
    const { id } = req.params;
    const rec = (await db.prepare("SELECT * FROM overtime_records WHERE id = ?").get(id)) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (await denyEmployee(res, organizationScope(res), Number(rec.employee_id), 'سجل العمل الإضافي')) return;
    (await db.prepare("UPDATE overtime_records SET status = 'approved' WHERE id = ?").run(id));
    (await db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, 'bonus', ?, ?, ?, ?)
    `).run(rec.employee_id, rec.total_overtime_pay, `أجر عمل إضافي (${rec.normal_hours + rec.weekend_hours + rec.holiday_hours} ساعة)`, rec.month, rec.year));
    await createNotification('اعتماد العمل الإضافي', `تم اعتماد العمل الإضافي بمبلغ ${rec.total_overtime_pay} ر.س وإدراجه في مستحقات الشهر`, 'success');
    res.json({ success: true });
  });

  app.delete('/api/overtime/:id', requireOrganizationScope, async (req, res) => {
    const { id } = req.params;
    const rec = (await db.prepare('SELECT employee_id FROM overtime_records WHERE id = ?').get(id)) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });
    if (await denyEmployee(res, organizationScope(res), Number(rec.employee_id), 'سجل العمل الإضافي')) return;
    (await db.prepare('DELETE FROM overtime_records WHERE id = ?').run(id));
    res.json({ success: true });
  });
}
