import db, { logAction, createNotification } from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { validateBody, bonusPenaltyCreateSchema, expenseStatusUpdateSchema } from "../../middleware/validation";
import { payrollLockedError, payrollWriteLockError, periodFromDateValue } from "./lock";

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
    const locked = await payrollWriteLockError(month, year, 'إضافة مكافأة/جزاء');
    if (locked) return res.status(400).json({ error: locked });
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    const info = (await db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, type, amount, reason, month, year));
    await logAction('create', 'bonus_penalty', Number(info.lastInsertRowid), `Added ${type} to employee ${employee_id}: ${amount}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/bonuses-penalties/:id", requireOrganizationScope, async (req, res) => {
    const row = (await db.prepare('SELECT employee_id, month, year FROM bonuses_penalties WHERE id = ?').get(req.params.id)) as any;
    if (!row) return res.status(404).json({ error: 'المكافأة/الجزاء غير موجود' });
    const locked = await payrollLockedError(Number(row.month), Number(row.year), 'حذف المكافأة/الجزاء');
    if (locked) return res.status(400).json({ error: locked });
    if (await denyEmployee(res, organizationScope(res), row.employee_id)) return;
    (await db.prepare("DELETE FROM bonuses_penalties WHERE id = ?").run(req.params.id));
    await logAction('delete', 'bonus_penalty', Number(req.params.id), `حذف مكافأة/جزاء لموظف ${row.employee_id} (${row.month}/${row.year})`);
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
      const locked = await payrollWriteLockError(month, year, 'إضافة دفعة إضافية');
      if (locked) return res.status(400).json({ error: locked });
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
      const row = (await db.prepare('SELECT employee_id, month, year FROM additional_salaries WHERE id = ?').get(req.params.id)) as any;
      if (!row) return res.status(404).json({ error: "Not found" });
      const locked = await payrollLockedError(Number(row.month), Number(row.year), 'حذف الدفعة الإضافية');
      if (locked) return res.status(400).json({ error: locked });
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
    const period = periodFromDateValue(date);
    if (period) {
      const locked = await payrollWriteLockError(period.month, period.year, 'إضافة مطالبة مالية');
      if (locked) return res.status(400).json({ error: locked });
    }
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    (await db.prepare('INSERT INTO expense_claims (employee_id, amount, category, description, claim_date) VALUES (?, ?, ?, ?, ?)').run(employee_id, amount, category, description, date));
    res.json({ success: true });
  });

  app.patch('/api/expenses/:id/status', requireOrganizationScope, validateBody(expenseStatusUpdateSchema), async (req, res) => {
    const { status, note, payment_status } = req.body;
    const row = (await db.prepare('SELECT employee_id, claim_date, status AS current_status FROM expense_claims WHERE id = ?').get(req.params.id)) as any;
    if (!row) return res.status(404).json({ error: 'المطالبة غير موجودة' });
    const period = periodFromDateValue(row.claim_date);
    if (period) {
      const locked = await payrollWriteLockError(period.month, period.year, 'مراجعة المطالبة');
      if (locked) return res.status(400).json({ error: locked });
    }
    if (await denyEmployee(res, organizationScope(res), Number(row.employee_id), 'المطالبة')) return;
    // Approved claims are reimbursed outside payroll: adding them to salary
    // would make a tax-free refund look like taxable income in the payslip.
    await db.prepare(`
      UPDATE expense_claims
      SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?,
          payment_status = COALESCE(?, payment_status),
          paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END
      WHERE id = ?
    `).run(
      status, (req as any).user?.username || null, new Date().toISOString(), note || null,
      payment_status || null, payment_status || null, new Date().toISOString(), req.params.id,
    );
    await logAction(status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'update',
      'expense_claim', Number(req.params.id),
      `مراجعة مطالبة ${req.params.id}: ${row.current_status} → ${status}${note ? ` — ${note}` : ''}`);
    res.json({ success: true, id: Number(req.params.id), status, payment_status: payment_status || undefined });
  });

  app.delete('/api/expenses/:id', requireOrganizationScope, async (req, res) => {
    const row = (await db.prepare('SELECT employee_id, claim_date FROM expense_claims WHERE id = ?').get(req.params.id)) as any;
    if (!row) return res.status(404).json({ error: 'المطالبة غير موجودة' });
    const period = periodFromDateValue(row.claim_date);
    if (period) {
      const locked = await payrollLockedError(period.month, period.year, 'حذف المطالبة');
      if (locked) return res.status(400).json({ error: locked });
    }
    if (await denyEmployee(res, organizationScope(res), Number(row.employee_id), 'المطالبة')) return;
    await db.prepare('DELETE FROM expense_claims WHERE id = ?').run(req.params.id);
    await logAction('delete', 'expense_claim', Number(req.params.id), `حذف مطالبة مالية لموظف ${row.employee_id}`);
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
    const period = periodFromDateValue(date);
    if (period) {
      const locked = await payrollWriteLockError(period.month, period.year, 'تسجيل عمل إضافي');
      if (locked) return res.status(400).json({ error: locked });
    }
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
    const locked = await payrollWriteLockError(rec.month, rec.year, 'اعتماد العمل الإضافي');
    if (locked) return res.status(400).json({ error: locked });
    if (await denyEmployee(res, organizationScope(res), Number(rec.employee_id), 'سجل العمل الإضافي')) return;
    (await db.prepare("UPDATE overtime_records SET status = 'approved' WHERE id = ?").run(id));
    (await db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, 'bonus', ?, ?, ?, ?)
    `).run(rec.employee_id, rec.total_overtime_pay, `أجر عمل إضافي (${rec.normal_hours + rec.weekend_hours + rec.holiday_hours} ساعة)`, rec.month, rec.year));
    await createNotification('اعتماد العمل الإضافي', `تم اعتماد العمل الإضافي بمبلغ ${rec.total_overtime_pay} ر.س وإدراجه في مستحقات الشهر`, 'success', { employeeId: Number(rec.employee_id) });
    res.json({ success: true });
  });

  app.delete('/api/overtime/:id', requireOrganizationScope, async (req, res) => {
    const { id } = req.params;
    const rec = (await db.prepare(`
      SELECT employee_id, month, year, date, status, total_overtime_pay FROM overtime_records WHERE id = ?
    `).get(id)) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });
    const period = rec.month && rec.year
      ? { month: Number(rec.month), year: Number(rec.year) }
      : periodFromDateValue(rec.date);
    if (period) {
      const locked = await payrollLockedError(period.month, period.year, 'حذف سجل العمل الإضافي');
      if (locked) return res.status(400).json({ error: locked });
    }
    if (await denyEmployee(res, organizationScope(res), Number(rec.employee_id), 'سجل العمل الإضافي')) return;
    // Approval writes a matching bonus line into the same period. Delete that
    // line too, otherwise the payslip keeps paying for a record that is gone.
    if (rec.status === 'approved') {
      await db.prepare(`
        DELETE FROM bonuses_penalties
        WHERE employee_id = ? AND month = ? AND year = ? AND type = 'bonus'
          AND amount = ? AND reason LIKE 'أجر عمل إضافي%'
      `).run(rec.employee_id, rec.month, rec.year, rec.total_overtime_pay);
    }
    await db.prepare('DELETE FROM overtime_records WHERE id = ?').run(id);
    await logAction('delete', 'overtime', Number(id), `حذف سجل عمل إضافي لموظف ${rec.employee_id}`);
    res.json({ success: true });
  });
}
