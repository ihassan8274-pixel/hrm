import db, { logAction, createNotification } from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { recomputePayrollNet, splitPayment } from "../../lib/payroll/net-recompute";
import { validateBody, payrollCorrectSchema } from "../../middleware/validation";
import { isPayrollLocked } from "./lock";

/**
 * Corrections to a payroll period that has already been closed.
 *
 * Only the component columns may be touched; the net is recomputed from the
 * corrected components so the approved payroll stays consistent.
 */

// Columns a payroll correction may touch. `field` is spliced into the SQL
// text below, so it must never come from the request unchecked. A Set lookup
// is used rather than Array.includes, and the column is resolved to this
// whitelist's own literal — the request value is never interpolated.
const CORRECTABLE_PAYROLL_FIELDS = new Set(['allowances', 'deductions', 'bonuses', 'penalties']);

export function registerPayrollCorrections(app: express.Express) {
  app.get("/api/payroll/corrections", requireOrganizationScope, async (req, res) => {
    try {
      const { month, year } = req.query;
      const scope = organizationScope(res);
      if (!month && !year) return res.json((await db.prepare(`
        SELECT c.*, e.name as employee_name
        FROM payroll_corrections c JOIN employees e ON c.employee_id = e.id
        WHERE (? IS NULL OR e.entity_id = ?)
          AND (? IS NULL OR e.branch_id = ?)
          AND (? IS NULL OR e.id = ?)
        ORDER BY c.created_at DESC
      `).all(...scopeFilter(scope))));
      const rows = (await db.prepare(`
        SELECT c.*, e.name as employee_name
        FROM payroll_corrections c JOIN employees e ON c.employee_id = e.id
        WHERE (? IS NULL OR c.month = ?) AND (? IS NULL OR c.year = ?)
          AND (? IS NULL OR e.entity_id = ?)
          AND (? IS NULL OR e.branch_id = ?)
          AND (? IS NULL OR e.id = ?)
        ORDER BY c.created_at DESC
      `).all(
        month ? Number(month) : null, month ? Number(month) : null,
        year ? Number(year) : null, year ? Number(year) : null,
        ...scopeFilter(scope)
      ));
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/payroll/correct", requireOrganizationScope, validateBody(payrollCorrectSchema), async (req, res) => {
    try {
      const { month, year, employee_id, field, new_value, reason } = req.body;
      if (!(await isPayrollLocked(Number(month), Number(year)))) {
        return res.status(400).json({ error: `مسير ${month}/${year} غير مُقفل — إما افتحه وعدّل بالطريقة العادية أو اقفله أولاً للتصحيح` });
      }
      const allowed = [...CORRECTABLE_PAYROLL_FIELDS];
      if (!CORRECTABLE_PAYROLL_FIELDS.has(String(field))) {
        return res.status(400).json({ error: `الحقل المدعوم للتصحيح: ${allowed.join('، ')}` });
      }
      if (await denyEmployee(res, organizationScope(res), Number(employee_id), 'الموظف')) return;
      // Resolve through the whitelist so only a known-good literal reaches SQL.
      const safeField = String(field) as 'allowances' | 'deductions' | 'bonuses' | 'penalties';
      const rec = (await db.prepare("SELECT * FROM payroll WHERE employee_id = ? AND month = ? AND year = ?").get(Number(employee_id), Number(month), Number(year))) as any;
      if (!rec) return res.status(404).json({ error: "سجل مسير الموظف غير موجود لهذا الشهر" });
      const oldValue = Number(rec[field] || 0);
      const newVal = Number(new_value);
      if (newVal < 0) return res.status(400).json({ error: "القيمة لا يجوز أن تكون سالبة" });

      // The stored run folds the month bonus into the allowance total and the
      // month penalty into the deduction total, so correcting those two has to
      // move the totals with them — otherwise the correction would land in a
      // column the net never reads.
      const allowanceDelta = safeField === 'allowances' ? newVal - Number(rec.allowances || 0)
        : safeField === 'bonuses' ? newVal - Number(rec.bonuses || 0) : 0;
      const deductionDelta = safeField === 'deductions' ? newVal - Number(rec.deductions || 0)
        : safeField === 'penalties' ? newVal - Number(rec.penalties || 0) : 0;
      const allowances = Number(rec.allowances || 0) + allowanceDelta;
      const deductions = Number(rec.deductions || 0) + deductionDelta;

      const taxExemptions = ((await db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as t FROM tax_exemption_declarations
        WHERE employee_id = ? AND (year IS NULL OR year = ?)
      `).get(rec.employee_id, Number(year))) as any)?.t || 0;
      const taxRate = Number(((await db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get()) as any)?.value || 0) / 100;
      const recomputed = recomputePayrollNet({
        basicSalary: Number(rec.basic_salary || 0),
        allowances,
        deductions,
        taxExemptions,
        taxRate,
      });

      const employee = (await db.prepare("SELECT payment_method, cash_percentage FROM employees WHERE id = ?").get(rec.employee_id)) as any;
      const split = splitPayment(
        recomputed.netSalary,
        employee?.payment_method || rec.payment_method || 'bank',
        Number(employee?.cash_percentage || 0)
      );

      (await db.prepare(`
        UPDATE payroll SET ${safeField} = ?, allowances = ?, deductions = ?, tax_amount = ?,
          net_salary = ?, cash_amount = ?, bank_amount = ?
        WHERE id = ?
      `).run(newVal, allowances, deductions, recomputed.taxAmount, recomputed.netSalary, split.cashAmount, split.bankAmount, rec.id));
      const user = (req as any).user?.username || null;
      const info = (await db.prepare(`
        INSERT INTO payroll_corrections (employee_id, month, year, field, old_value, new_value, reason, corrected_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(Number(employee_id), Number(month), Number(year), field, oldValue, newVal, reason, user));
      await logAction('correct', 'payroll', Number(rec.id), `تصحيح ${field} ${oldValue} -> ${newVal} لموظف ${employee_id} (${month}/${year}): ${reason}`);
      await createNotification('تصحيح رواتب', `تم تصحيح ${field} لموظف ${employee_id} في مسير ${month}/${year} (${oldValue} → ${newVal})`, 'info');
      res.json({
        id: info.lastInsertRowid,
        old_value: oldValue,
        new_value: newVal,
        recomputed_net: recomputed.netSalary,
        recomputed_tax: recomputed.taxAmount,
        cash_amount: split.cashAmount,
        bank_amount: split.bankAmount,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
