import db, { logAction, createNotification } from "../../config/postgres";
import express from "express";
import { RENEWAL_TYPES, isRenewalType } from "../../lib/renewal-types";

/**
 * Government renewals: the history of what was renewed, and the quick renewal
 * itself. A renewal extends the residence permit, the work permit or the
 * medical insurance and records the transaction.
 */
export function registerRenewalHistory(app: express.Express) {
  app.get("/api/saudi/renewals", async (req, res) => {
    const renewals = (await db.prepare(`
      SELECT r.*, e.name as employee_name, e.national_id_iqama
      FROM government_renewals r
      JOIN employees e ON r.employee_id = e.id
      ORDER BY r.created_at DESC
    `).all());
    res.json(renewals);
  });
}

export function registerQuickRenew(app: express.Express) {
  app.post("/api/saudi/quick-renew", async (req, res) => {
    const { employee_id, type, duration_months = 12, cost, sadad_number, reference_number, notes } = req.body;
    // The type decides which branch runs. An unknown value used to skip both
    // branches and still answer { success: true }, so the client believed the
    // renewal happened while nothing had been written.
    if (!isRenewalType(type)) {
      return res.status(400).json({
        error: `نوع التجديد غير صحيح. القيم المسموحة: ${RENEWAL_TYPES.join(", ")}`,
      });
    }
    const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
    if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
    const now = new Date();
    if (type === 'iqama' || type === 'both') {
      const currentExpiry = emp.iqama_expiry_gregorian ? new Date(emp.iqama_expiry_gregorian) : new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + Number(duration_months));
      const newIqamaExpiry = baseDate.toISOString().split('T')[0];
      (await db.prepare(`
        UPDATE employees SET 
          iqama_expiry_gregorian = ?,
          work_permit_expiry = ?
        WHERE id = ?
      `).run(newIqamaExpiry, newIqamaExpiry, employee_id));
      (await db.prepare(`
        INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, expiry_before, expiry_after, notes)
        VALUES (?, 'iqama', ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).run(
        employee_id, duration_months, cost || 10250, sadad_number || `SADAD-${Date.now().toString().slice(-6)}`,
        reference_number || `MOI-${Date.now().toString().slice(-6)}`, emp.iqama_expiry_gregorian, newIqamaExpiry, notes || 'تجديد الإقامة ورخصة العمل بنجاح'
      ));
    } else if (type === 'medical_insurance') {
      const currentExpiry = emp.medical_insurance_expiry ? new Date(emp.medical_insurance_expiry) : new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + Number(duration_months));
      const newMedExpiry = baseDate.toISOString().split('T')[0];
      (await db.prepare("UPDATE employees SET medical_insurance_expiry = ? WHERE id = ?").run(newMedExpiry, employee_id));
      (await db.prepare(`
        INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, expiry_before, expiry_after, notes)
        VALUES (?, 'medical_insurance', ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).run(
        employee_id, duration_months, cost || 2500, sadad_number || `CCHI-${Date.now().toString().slice(-6)}`,
        reference_number || `POL-${Date.now().toString().slice(-6)}`, emp.medical_insurance_expiry, newMedExpiry, notes || 'تجديد وثيقة التأمين الطبي'
      ));
    }
    await createNotification('تم التجديد بنجاح', `تم تجديد المعاملة بنجاح للموظف ${emp.name}`, 'success', { employeeId: Number(employee_id) });
    await logAction('renew', 'compliance', employee_id, `Renewed ${type} for employee ${emp.name}`);
    res.json({ success: true });
  });
}
