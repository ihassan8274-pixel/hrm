import db, { logAction } from "../../config/postgres";
import express from "express";

/**
 * Salary certificates: issuing them, listing them, revoking them and the
 * public verification endpoint that a bank or an employer can call with the
 * QR code printed on the letter.
 */
export function registerSalaryCertificates(app: express.Express) {
  app.get('/api/salary-certificates', async (req, res) => {
    const data = (await db.prepare(`
      SELECT sc.*, e.name as employee_name, e.national_id_iqama, e.job_title, e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances, e.contract_start_date, e.saudi_iban, e.bank_name, d.name as department_name
      FROM salary_certificates sc
      JOIN employees e ON sc.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY sc.created_at DESC
    `).all());
    res.json(data);
  });

  app.post('/api/salary-certificates', async (req, res) => {
    const { employee_id, addressed_to, purpose, include_allowances, include_bank_iban } = req.body;
    const certNum = `SAL-CERT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const qrCode = `VERIFY-KSA-HR-${certNum}-${Buffer.from(String(employee_id)).toString('hex')}`;
    const today = new Date();
    const issueDate = today.toISOString().split('T')[0];
    const validUntilDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const result = (await db.prepare(`
      INSERT INTO salary_certificates (employee_id, certificate_number, addressed_to, purpose, include_allowances, include_bank_iban, qr_verification_code, issue_date, valid_until, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(employee_id, certNum, addressed_to || 'إلى من يهمه الأمر', purpose || 'general', include_allowances !== undefined ? (include_allowances ? 1 : 0) : 1, include_bank_iban !== undefined ? (include_bank_iban ? 1 : 0) : 1, qrCode, issueDate, validUntilDate));
    const emp = (await db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id)) as any;
    await logAction('create', 'salary_certificate', Number(result.lastInsertRowid), `Generated salary certificate ${certNum} for ${emp?.name}`);
    res.json({ success: true, id: result.lastInsertRowid, certificate_number: certNum, qr_code: qrCode });
  });

  app.delete('/api/salary-certificates/:id', async (req, res) => {
    const { id } = req.params;
    (await db.prepare('DELETE FROM salary_certificates WHERE id = ?').run(id));
    res.json({ success: true });
  });

  app.get('/api/salary-certificates/verify/:code', async (req, res) => {
    const { code } = req.params;
    const cert = (await db.prepare(`
      SELECT sc.*, e.name as employee_name, e.national_id_iqama, e.job_title, e.basic_salary, e.housing_allowance, e.transport_allowance
      FROM salary_certificates sc
      JOIN employees e ON sc.employee_id = e.id
      WHERE sc.qr_verification_code = ? OR sc.certificate_number = ?
    `).get(code, code)) as any;
    if (!cert) {
      return res.status(404).json({ valid: false, message: 'شهادة التعريف غير موجودة أو تم إلغاؤها' });
    }
    const isExpired = new Date(cert.valid_until) < new Date();
    res.json({
      valid: !isExpired,
      certificate: cert,
      status_text: isExpired ? 'منتهية الصلاحية (صالحة لمدة 30 يوم من تاريخ الإصدار)' : 'معتمدة وسارية المفعول رسمياً'
    });
  });
}
