import db, { logAction, createNotification } from "../../config/postgres";
import express from "express";
import { resolveWriteScope } from "../../lib/organization-scope";
import { isSaudiEmployee } from "../../lib/saudi-employee";

/**
 * Qiwa unified employment contracts.
 *
 * Listing the contracts also back-fills them from the employee master the
 * first time it is called. The draft batch is restricted to the caller's own
 * organization: a batch that drafted contracts for every employee in the
 * database would hand one tenant another tenant's staff.
 */
export function registerQiwaContracts(app: express.Express) {
  app.get('/api/qiwa/contracts', async (req, res) => {
    const count = (await db.prepare("SELECT COUNT(*) as count FROM qiwa_contracts").get()) as any;
    if (count.count === 0) {
      const emps = (await db.prepare("SELECT * FROM employees").all()) as any[];
      emps.forEach(async (emp, idx) => {
        const isSaudi = isSaudiEmployee(emp);
        const startDate = emp.join_date || '2023-01-15';
        const start = new Date(startDate);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + (isSaudi ? 2 : 1));
        const endDateStr = end.toISOString().split('T')[0];
        (await db.prepare(`
          INSERT INTO qiwa_contracts (
            employee_id, contract_number, contract_type, job_title, work_location,
            start_date, end_date, probation_days, notice_period_days, basic_salary,
            housing_allowance, transport_allowance, other_allowances, weekly_working_hours,
            annual_leave_days, auto_renew, qiwa_status, qiwa_reference
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          emp.id,
          `QW-SA-${10000 + emp.id}`,
          isSaudi ? 'indefinite' : 'fixed_term',
          emp.position || emp.job_title || 'موظف',
          'الرياض - المقر الرئيسي',
          startDate,
          isSaudi ? null : endDateStr,
          90,
          60,
          emp.basic_salary || 5000,
          emp.housing_allowance || 1250,
          emp.transport_allowance || 500,
          emp.other_allowances || 0,
          48,
          emp.annual_leave_days || 21,
          1,
          'authenticated',
          `QREF-2024-${8000 + emp.id}`
        ));
      });
    }
    const contracts = (await db.prepare(`
      SELECT c.*, e.name as employee_name, e.national_id_iqama, e.nationality,
             d.name as department_name, b.name as branch_name
      FROM qiwa_contracts c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      ORDER BY c.created_at DESC
    `).all()) as any[];
    const today = new Date();
    const enriched = contracts.map(c => {
      let daysUntilExpiry = null;
      let daysUntilNoticeDeadline = null;
      if (c.end_date) {
        const endDate = new Date(c.end_date);
        const diffTime = endDate.getTime() - today.getTime();
        daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysUntilNoticeDeadline = daysUntilExpiry - (c.notice_period_days || 60);
      }
      return {
        ...c,
        days_until_expiry: daysUntilExpiry,
        days_until_notice_deadline: daysUntilNoticeDeadline
      };
    });
    res.json(enriched);
  });

  app.post('/api/qiwa/contracts', async (req, res) => {
    const {
      employee_id, contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status, clauses_json
    } = req.body;
    const contractNumber = `QW-SA-${Math.floor(100000 + Math.random() * 900000)}`;
    const qiwaRef = `QREF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const result = (await db.prepare(`
      INSERT INTO qiwa_contracts (
        employee_id, contract_number, contract_type, job_title, work_location,
        start_date, end_date, probation_days, notice_period_days, basic_salary,
        housing_allowance, transport_allowance, other_allowances, weekly_working_hours,
        annual_leave_days, auto_renew, qiwa_status, qiwa_reference, clauses_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employee_id,
      contractNumber,
      contract_type || 'fixed_term',
      job_title,
      work_location || 'الرياض',
      start_date,
      end_date || null,
      Number(probation_days) || 90,
      Number(notice_period_days) || 60,
      Number(basic_salary) || 0,
      Number(housing_allowance) || 0,
      Number(transport_allowance) || 0,
      Number(other_allowances) || 0,
      Number(weekly_working_hours) || 48,
      Number(annual_leave_days) || 21,
      auto_renew !== undefined ? (auto_renew ? 1 : 0) : 1,
      qiwa_status || 'authenticated',
      qiwaRef,
      clauses_json ? JSON.stringify(clauses_json) : null
    ));
    await logAction('create', 'qiwa_contract', Number(result.lastInsertRowid), `Created Qiwa contract ${contractNumber}`);
    await createNotification('توثيق عقد قوى', `تم إنشاء وتوثيق عقد عمل موحد جديد برقم ${contractNumber}`, 'success');
    res.json({ success: true, id: result.lastInsertRowid, contract_number: contractNumber });
  });

  app.post('/api/qiwa/draft-from-employees', async (req, res) => {
    try {
      const scope = (await resolveWriteScope(db, (req as any).user?.id, req.query as Record<string, unknown>));
      if (!scope) return res.status(403).json({ error: "الحساب غير مرتبط بكيان — لا يمكن إنشاء المسودات قبل ربط الحساب بكيان" });
      // Only the caller's own organization: a batch that drafts contracts for
      // every employee in the database would hand one tenant another's staff.
      const emps = (await db.prepare(
        "SELECT * FROM employees WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR branch_id = ?)"
      ).all(scope.entityId, scope.entityId, scope.branchId, scope.branchId)) as any[];
      let created = 0;
      for (const emp of emps) {
        const exists = (await db.prepare("SELECT id FROM qiwa_contracts WHERE employee_id = ?").get(emp.id));
        if (exists) continue;
        const contractNumber = `QW-DRAFT-${emp.id}-${Date.now().toString().slice(-6)}`;
        (await db.prepare(`
          INSERT INTO qiwa_contracts (
            employee_id, contract_number, contract_type, job_title, work_location,
            start_date, end_date, probation_days, notice_period_days, basic_salary,
            housing_allowance, transport_allowance, other_allowances, weekly_working_hours,
            annual_leave_days, auto_renew, qiwa_status, qiwa_reference
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 90, 60, ?, ?, ?, ?, 48, 21, 1, 'draft', ?)
        `).run(
          emp.id,
          contractNumber,
          emp.contract_type === 'indefinite' ? 'unlimited' : 'fixed_term',
          emp.job_title || emp.position || 'موظف',
          'المقر',
          emp.contract_start_date || new Date().toISOString().slice(0, 10),
          emp.contract_end_date || null,
          emp.basic_salary || 0,
          emp.housing_allowance || 0,
          emp.transport_allowance || 0,
          emp.other_allowances || 0,
          `QREF-DRAFT-${emp.id}`
        ));
        created++;
      }
      res.json({ success: true, created });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.put('/api/qiwa/contracts/:id', async (req, res) => {
    const { id } = req.params;
    const {
      contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status
    } = req.body;
    (await db.prepare(`
      UPDATE qiwa_contracts SET
        contract_type = COALESCE(?, contract_type),
        job_title = COALESCE(?, job_title),
        work_location = COALESCE(?, work_location),
        start_date = COALESCE(?, start_date),
        end_date = ?,
        probation_days = COALESCE(?, probation_days),
        notice_period_days = COALESCE(?, notice_period_days),
        basic_salary = COALESCE(?, basic_salary),
        housing_allowance = COALESCE(?, housing_allowance),
        transport_allowance = COALESCE(?, transport_allowance),
        other_allowances = COALESCE(?, other_allowances),
        weekly_working_hours = COALESCE(?, weekly_working_hours),
        annual_leave_days = COALESCE(?, annual_leave_days),
        auto_renew = COALESCE(?, auto_renew),
        qiwa_status = COALESCE(?, qiwa_status)
      WHERE id = ?
    `).run(
      contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status, id
    ));
    await logAction('update', 'qiwa_contract', Number(id), `Updated Qiwa contract id ${id}`);
    res.json({ success: true });
  });

  app.delete('/api/qiwa/contracts/:id', async (req, res) => {
    const { id } = req.params;
    (await db.prepare("DELETE FROM qiwa_contracts WHERE id = ?").run(id));
    res.json({ success: true });
  });
}
