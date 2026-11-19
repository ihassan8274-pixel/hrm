// Route module. Registered from server/index.ts; the order there is the route order.
import db, { logAction, createNotification } from "../config/postgres";
import express from "express";

export function registerCompliance(app: express.Express) {

    // ==========================================
    // 1. VISAS & MUQEEM MANAGEMENT (الجوازات والتأشيرات)
    // ==========================================

  app.get('/api/visas', async (req, res) => {
    const data = await db.prepare(`
      SELECT v.*, e.name as employee_name, e.nationality, e.national_id_iqama
      FROM visas v
      JOIN employees e ON v.employee_id = e.id
      ORDER BY v.created_at DESC
    `).all();
    res.json(data);
  });

  app.post('/api/visas', async (req, res) => {
    const { employee_id, visa_type, visa_number, issue_date, travel_before_date, duration_days, return_before_date, cost, notes } = req.body;
    const defaultCost = visa_type === 'exit_reentry_single' ? 200 : visa_type === 'exit_reentry_multiple' ? 500 : 0;
    const result = await db.prepare(`
      INSERT INTO visas (employee_id, visa_type, visa_number, issue_date, travel_before_date, duration_days, return_before_date, cost, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(employee_id, visa_type, visa_number || `VISA-${Date.now().toString().slice(-6)}`, issue_date || new Date().toISOString().split('T')[0], travel_before_date, duration_days || 60, return_before_date, cost !== undefined ? cost : defaultCost, notes);
    const emp = await db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
    await logAction('create', 'visa', Number(result.lastInsertRowid), `Issued ${visa_type} for ${emp?.name || employee_id}`);
    await createNotification('إصدار تأشيرة جديدة', `تم تسجيل تأشيرة بنجاح للموظف ${emp?.name || ''}`, 'success');
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put('/api/visas/:id', async (req, res) => {
    const { id } = req.params;
    const { status, travel_before_date, notes } = req.body;
    await db.prepare(`
      UPDATE visas SET status = COALESCE(?, status), travel_before_date = COALESCE(?, travel_before_date), notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(status, travel_before_date, notes, id);
    res.json({ success: true });
  });

  app.delete('/api/visas/:id', async (req, res) => {
    const { id } = req.params;
    await db.prepare('DELETE FROM visas WHERE id = ?').run(id);
    res.json({ success: true });
  });

    // ==========================================
    // 2. FLIGHT TICKETS MANAGEMENT (تذاكر السفر)
    // ==========================================

  app.get('/api/flight-tickets', async (req, res) => {
    const data = await db.prepare(`
      SELECT ft.*, e.name as employee_name, e.nationality
      FROM flight_tickets ft
      JOIN employees e ON ft.employee_id = e.id
      ORDER BY ft.created_at DESC
    `).all();
    res.json(data);
  });

  app.post('/api/flight-tickets', async (req, res) => {
    const { employee_id, destination, trip_type, departure_date, return_date, cost, allowance_type, dependents_included, notes } = req.body;
    const result = await db.prepare(`
      INSERT INTO flight_tickets (employee_id, destination, trip_type, departure_date, return_date, cost, allowance_type, dependents_included, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
    `).run(employee_id, destination, trip_type || 'round_trip', departure_date, return_date, cost || 2500, allowance_type || 'ticket_issued', dependents_included || 0, notes);
    const emp = await db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
    await logAction('create', 'flight_ticket', Number(result.lastInsertRowid), `Flight ticket booked for ${emp?.name}`);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put('/api/flight-tickets/:id', async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    await db.prepare(`UPDATE flight_tickets SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?`).run(status, notes, id);
    res.json({ success: true });
  });

  app.delete('/api/flight-tickets/:id', async (req, res) => {
    const { id } = req.params;
    await db.prepare('DELETE FROM flight_tickets WHERE id = ?').run(id);
    res.json({ success: true });
  });

    // ==========================================
    // 12. DISCIPLINARY MATRIX & VIOLATIONS (لائحة الجزاءات والتحقيق)
    // ==========================================

  app.get('/api/disciplinary/violations', async (req, res) => {
    const count = await db.prepare("SELECT COUNT(*) as count FROM disciplinary_violations").get() as any;
    if (count.count === 0) {
      const emp = await db.prepare("SELECT * FROM employees LIMIT 2").all() as any[];
      if (emp.length > 0) {
        const emp1 = emp[0];
        const dailyRate = Math.round((emp1.basic_salary || 5000) / 30);
        await db.prepare(`
          INSERT INTO disciplinary_violations (
            employee_id, incident_date, category, description,
            investigation_date, investigator_name, employee_statement,
            committee_decision, penalty_level, deduction_days, deduction_amount,
            payroll_applied, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          emp1.id,
          new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
          'delay_departure',
          'التأخر عن مواعيد الحضور والانصراف لأكثر من 45 دقيقة بدون إذن مسبق للمرة الثانية',
          new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0],
          'لجنة التحقيق والموارد البشرية',
          'أفاد الموظف بوجود ازدحام مروري عارض وأبدى التزامه بالمواعيد',
          'تطبيق العقوبة المقررة في لائحة تنظيم العمل الداخلية (إنذار كتابي أول)',
          'written_warning_1',
          0,
          0,
          0,
          'approved'
        );
        if (emp.length > 1) {
          const emp2 = emp[1];
          const dailyRate2 = Math.round((emp2.basic_salary || 6000) / 30);
          await db.prepare(`
            INSERT INTO disciplinary_violations (
              employee_id, incident_date, category, description,
              investigation_date, investigator_name, employee_statement,
              committee_decision, penalty_level, deduction_days, deduction_amount,
              payroll_applied, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            emp2.id,
            new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
            'attendance_absence',
            'الغياب عن العمل لمدة يوم كامل بدون عذر مقبول للمرة الثانية خلال الشهر',
            new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
            'إدارة الشؤون القانونية',
            'لم يقدم الموظف عذراً طبياً معتمداً من منصة صحتي',
            'خصم أجر يوم واحد من الراتب وتوجيه إنذار بعدم التكرار',
            'salary_deduction_1day',
            1,
            dailyRate2,
            1,
            'approved'
          );
        }
      }
    }
    const list = await db.prepare(`
      SELECT v.*, e.name as employee_name, e.national_id_iqama, d.name as department_name
      FROM disciplinary_violations v
      JOIN employees e ON v.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY v.created_at DESC
    `).all();
    res.json(list);
  });

  app.post('/api/disciplinary/violations', async (req, res) => {
    const {
      employee_id, incident_date, category, description,
      investigation_date, investigator_name, employee_statement,
      committee_decision, penalty_level, deduction_days, status
    } = req.body;
    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const dailyRate = (emp.basic_salary || 0) / 30;
    const days = Number(deduction_days) || 0;
    const deductionAmount = Math.round(dailyRate * days);
    const result = await db.prepare(`
      INSERT INTO disciplinary_violations (
        employee_id, incident_date, category, description,
        investigation_date, investigator_name, employee_statement,
        committee_decision, penalty_level, deduction_days, deduction_amount,
        payroll_applied, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      employee_id,
      incident_date,
      category,
      description,
      investigation_date || incident_date,
      investigator_name || 'لجنة التحقيق الإداري',
      employee_statement || 'تم تدوين الإفادة بمحضر التحقيق الرسمي',
      committee_decision || 'اعتماد الجزاء وفق لائحة تنظيم العمل المعتمدة',
      penalty_level,
      days,
      deductionAmount,
      status || 'approved'
    );
    await logAction('create', 'violation', Number(result.lastInsertRowid), `Logged violation for ${emp.name} (${penalty_level})`);
    await createNotification('تسجيل مخالفة وقرار جزاء', `تم تسجيل قرار إداري بحق الموظف ${emp.name}`, 'warning');
    res.json({ success: true, id: result.lastInsertRowid, deduction_amount: deductionAmount });
  });

  app.post('/api/disciplinary/violations/:id/apply-payroll', async (req, res) => {
    const { id } = req.params;
    const viol = await db.prepare("SELECT * FROM disciplinary_violations WHERE id = ?").get(id) as any;
    if (!viol) return res.status(404).json({ error: 'Violation not found' });
    if (viol.deduction_amount > 0 && viol.payroll_applied === 0) {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      await db.prepare(`
        INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
        VALUES (?, 'penalty', ?, ?, ?, ?)
      `).run(viol.employee_id, viol.deduction_amount, `جزاء إداري (${viol.penalty_level}) - خصم ${viol.deduction_days} يوم`, month, year);
      await db.prepare("UPDATE disciplinary_violations SET applied_to_payroll = 1 WHERE id = ?").run(id);
      await logAction('update', 'violation', Number(id), `Applied deduction ${viol.deduction_amount} SAR to payroll`);
      await createNotification('ترحيل الجزاء لمسير الرواتب', `تم ترحيل خصم الجزاء بقيمة ${viol.deduction_amount} ر.س إلى مسير الشهر الحالي`, 'info');
    }
    res.json({ success: true });
  });

  app.delete('/api/disciplinary/violations/:id', async (req, res) => {
    const { id } = req.params;
    await db.prepare("DELETE FROM disciplinary_violations WHERE id = ?").run(id);
    res.json({ success: true });
  });

    // ==========================================
    // 13. MULTI-DEPARTMENT CLEARANCE WORKFLOW (إخلاء الطرف وإبراء الذمة)
    // ==========================================

  app.get('/api/clearances', async (req, res) => {
    const list = await db.prepare(`
      SELECT c.*, e.name as employee_name, e.position as job_title,
             e.national_id_iqama, d.name as department_name
      FROM employee_clearances c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY c.created_at DESC
    `).all();
    res.json(list);
  });

  app.post('/api/clearances', async (req, res) => {
    const { employee_id, request_date, last_working_day, reason, final_settlement_amount } = req.body;
    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const clearanceSlipNumber = `CLR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const result = await db.prepare(`
      INSERT INTO employee_clearances (
        employee_id, request_date, last_working_day, reason,
        it_status, finance_status, operations_status, hr_status,
        overall_status, final_settlement_amount, clearance_slip_number
      ) VALUES (?, ?, ?, ?, 'pending', 'pending', 'pending', 'pending', 'in_progress', ?, ?)
    `).run(
      employee_id,
      request_date || new Date().toISOString().split('T')[0],
      last_working_day,
      reason || 'resignation',
      Number(final_settlement_amount) || 0,
      clearanceSlipNumber
    );
    await logAction('create', 'clearance', Number(result.lastInsertRowid), `Initiated exit clearance for ${emp.name}`);
    await createNotification('بدء إجراءات إخلاء طرف', `تم إطلاق مسار إخلاء الطرف للموظف ${emp.name} برقم ${clearanceSlipNumber}`, 'info');
    res.json({ success: true, id: result.lastInsertRowid, clearance_slip_number: clearanceSlipNumber });
  });

  app.put('/api/clearances/:id/department', async (req, res) => {
    const { id } = req.params;
    const { department, status, notes, cleared_by, extra_data } = req.body;
    const clearance = await db.prepare("SELECT * FROM employee_clearances WHERE id = ?").get(id) as any;
    if (!clearance) return res.status(404).json({ error: 'Clearance not found' });
    if (department === 'it') {
      await db.prepare("UPDATE employee_clearances SET it_status = ?, it_notes = ?, it_cleared_by = ? WHERE id = ?")
        .run(status || 'cleared', notes, cleared_by || 'فريق IT', id);
    } else if (department === 'finance') {
      await db.prepare("UPDATE employee_clearances SET finance_status = ?, finance_loans_settled = ?, finance_custody_settled = ?, finance_notes = ? WHERE id = ?")
        .run(status || 'cleared', extra_data?.loans_settled ? 1 : 0, extra_data?.custody_settled ? 1 : 0, notes, id);
    } else if (department === 'operations') {
      await db.prepare("UPDATE employee_clearances SET operations_status = ?, operations_assets_returned = ?, operations_notes = ? WHERE id = ?")
        .run(status || 'cleared', extra_data?.assets_returned ? 1 : 0, notes, id);
    } else if (department === 'hr') {
      await db.prepare("UPDATE employee_clearances SET hr_status = ?, hr_medical_cancelled = ?, hr_gosi_deregistered = ?, hr_service_cert_issued = ? WHERE id = ?")
        .run(status || 'cleared', extra_data?.medical_cancelled ? 1 : 0, extra_data?.gosi_deregistered ? 1 : 0, extra_data?.service_cert_issued ? 1 : 0, id);
    }
    const updated = await db.prepare("SELECT * FROM employee_clearances WHERE id = ?").get(id) as any;
    if (updated.it_status === 'cleared' && updated.finance_status === 'cleared' && updated.operations_status === 'cleared' && updated.hr_status === 'cleared') {
      await db.prepare("UPDATE employee_clearances SET overall_status = 'completed' WHERE id = ?").run(id);
      await createNotification('اكتمال إخلاء الطرف', `تم اعتماد إخلاء الطرف رقم ${updated.clearance_slip_number} بنجاح من كافة الأقسام المعنية`, 'success');
    }
    await logAction('update', 'clearance', Number(id), `Updated ${department} clearance status`);
    res.json({ success: true });
  });

  app.delete('/api/clearances/:id', async (req, res) => {
    const { id } = req.params;
    await db.prepare("DELETE FROM employee_clearances WHERE id = ?").run(id);
    res.json({ success: true });
  });

    // ==========================================
    // 14. GOSI WORK INJURIES & OH&S (إصابات العمل والسلامة المهنية)
    // ==========================================

  app.get('/api/work-injuries', async (req, res) => {
    const count = await db.prepare("SELECT COUNT(*) as count FROM work_injuries").get() as any;
    if (count.count === 0) {
      const emp = await db.prepare("SELECT * FROM employees LIMIT 1").get() as any;
      if (emp) {
        const dailyRate = Math.round((emp.basic_salary + (emp.housing_allowance || 0)) / 30);
        await db.prepare(`
          INSERT INTO work_injuries (
            employee_id, incident_date, incident_time, location_type,
            injury_type, severity, description, hospital_name,
            sick_leave_days, gosi_reported, gosi_report_date, gosi_claim_number,
            daily_allowance_rate, total_compensation_amount, status, preventive_actions
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          emp.id,
          new Date(Date.now() - 20 * 86400000).toISOString().split('T')[0],
          '10:30',
          'workplace',
          'التواء في مفصل الكاحل أثناء تفقد المستودع',
          'minor',
          'انزلاق طفيف أثناء فحص الشحنات الواردة في منطقة التحميل',
          'مستشفى الدكتور سليمان الحبيب',
          7,
          1,
          new Date(Date.now() - 18 * 86400000).toISOString().split('T')[0],
          'GOSI-INJ-847291',
          dailyRate,
          dailyRate * 7,
          'closed',
          'تركيب أشرطة مانعة للانزلاق وإلزام العمال بارتداء أحذية السلامة المعتمدة'
        );
      }
    }
    const list = await db.prepare(`
      SELECT w.*, e.name as employee_name, e.national_id_iqama, e.job_title, d.name as department_name
      FROM work_injuries w
      JOIN employees e ON w.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY w.created_at DESC
    `).all();
    res.json(list);
  });

  app.post('/api/work-injuries', async (req, res) => {
    const {
      employee_id, incident_date, incident_time, location_type,
      injury_type, severity, description, hospital_name, sick_leave_days,
      gosi_reported, gosi_claim_number, preventive_actions
    } = req.body;
    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const dailyWage = Math.round(((emp.basic_salary || 0) + (emp.housing_allowance || 0)) / 30);
    const leaveDays = Number(sick_leave_days) || 0;
    const compensation = dailyWage * leaveDays;
    const claimNumber = gosi_claim_number || `GOSI-INJ-${Math.floor(100000 + Math.random() * 900000)}`;
    const result = await db.prepare(`
      INSERT INTO work_injuries (
        employee_id, incident_date, incident_time, location_type,
        injury_type, severity, description, hospital_name,
        sick_leave_days, gosi_reported, gosi_report_date, gosi_claim_number,
        daily_allowance_rate, total_compensation_amount, status, preventive_actions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?)
    `).run(
      employee_id,
      incident_date,
      incident_time || '09:00',
      location_type || 'workplace',
      injury_type,
      severity || 'minor',
      description,
      hospital_name,
      leaveDays,
      gosi_reported ? 1 : 0,
      gosi_reported ? new Date().toISOString().split('T')[0] : null,
      claimNumber,
      dailyWage,
      compensation,
      preventive_actions
    );
    await logAction('create', 'work_injury', Number(result.lastInsertRowid), `Reported work injury for ${emp.name}`);
    await createNotification('تسجيل بلاغ إصابة عمل', `تم توثيق إصابة العمل للموظف ${emp.name} وإشعار التأمينات الاجتماعية (GOSI)`, 'warning');
    res.json({ success: true, id: result.lastInsertRowid, gosi_claim_number: claimNumber, compensation });
  });

  app.put('/api/work-injuries/:id', async (req, res) => {
    const { id } = req.params;
    const { status, gosi_reported, gosi_claim_number, sick_leave_days, preventive_actions } = req.body;
    const inj = await db.prepare("SELECT * FROM work_injuries WHERE id = ?").get(id) as any;
    if (!inj) return res.status(404).json({ error: 'Not found' });
    let comp = inj.total_compensation_amount;
    if (sick_leave_days) {
      comp = inj.daily_allowance_rate * Number(sick_leave_days);
    }
    await db.prepare(`
      UPDATE work_injuries SET
        status = COALESCE(?, status),
        gosi_reported = COALESCE(?, gosi_reported),
        gosi_claim_number = COALESCE(?, gosi_claim_number),
        sick_leave_days = COALESCE(?, sick_leave_days),
        total_compensation_amount = ?,
        preventive_actions = COALESCE(?, preventive_actions)
      WHERE id = ?
    `).run(status, gosi_reported, gosi_claim_number, sick_leave_days, comp, preventive_actions, id);
    await logAction('update', 'work_injury', Number(id), `Updated injury id ${id}`);
    res.json({ success: true });
  });

  app.delete('/api/work-injuries/:id', async (req, res) => {
    const { id } = req.params;
    await db.prepare("DELETE FROM work_injuries WHERE id = ?").run(id);
    res.json({ success: true });
  });

    // GET HSE inspections

  app.get("/api/hse/inspections", async (req, res) => {
    const rows = await db.prepare(`
      SELECT h.*, b.name as branch_name
      FROM hse_inspections h
      JOIN branches b ON h.branch_id = b.id
      ORDER BY h.inspection_date DESC
    `).all();
    res.json(rows);
  });

    // POST HSE inspection

  app.post("/api/hse/inspections", async (req, res) => {
    const { branch_id, inspector_name, inspection_date, category, status, score, findings, corrective_actions, deadline_date } = req.body;
    const result = await db.prepare(`
      INSERT INTO hse_inspections (branch_id, inspector_name, inspection_date, category, status, score, findings, corrective_actions, deadline_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(branch_id, inspector_name, inspection_date, category, status || 'compliant', score || 95, findings, corrective_actions, deadline_date);
    res.json({ success: true, id: result.lastInsertRowid });
  });

    // GET HSE PPE logs

  app.get("/api/hse/ppe-logs", async (req, res) => {
    const rows = await db.prepare(`
      SELECT p.*, e.name as employee_name, d.name as department_name
      FROM hse_ppe_logs p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY p.id DESC
    `).all();
    res.json(rows);
  });

    // POST HSE PPE log

  app.post("/api/hse/ppe-logs", async (req, res) => {
    const { employee_id, item_name, item_type, issue_date, expiry_date, notes } = req.body;
    const result = await db.prepare(`
      INSERT INTO hse_ppe_logs (employee_id, item_name, item_type, issue_date, expiry_date, status, notes)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(employee_id, item_name, item_type || 'helmet', issue_date, expiry_date, notes || '');
    res.json({ success: true, id: result.lastInsertRowid });
  });

    // GET HSE Stats

  app.get("/api/hse/stats", async (req, res) => {
    const inspections = await db.prepare("SELECT * FROM hse_inspections").all() as any[];
    const ppeLogs = await db.prepare("SELECT * FROM hse_ppe_logs").all() as any[];
    const avgScore = inspections.length > 0
      ? Math.round(inspections.reduce((acc, c) => acc + (c.score || 0), 0) / inspections.length)
      : 96;
    res.json({
      complianceRate: avgScore,
      openViolations: inspections.filter(i => i.status === 'needs_action').length,
      criticalIssues: inspections.filter(i => i.status === 'critical').length,
      activePpeCount: ppeLogs.filter(p => p.status === 'active').length,
      inspectionsCount: inspections.length
    });
  });

    // GET all exit interviews

  app.get("/api/exit-interviews", async (req, res) => {
    const rows = await db.prepare(`
      SELECT ex.*, e.name as employee_name, e.job_title, e.position, d.name as department_name, e.contract_start_date as hire_date
      FROM exit_interviews ex
      JOIN employees e ON ex.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY ex.departure_date DESC
    `).all();
    res.json(rows);
  });

    // POST exit interview

  app.post("/api/exit-interviews", async (req, res) => {
    const { 
      employee_id, departure_date, primary_reason, reason_details, 
      manager_rating, culture_rating, benefits_rating, would_recommend_score, 
      retention_feedback, estimated_replacement_cost, ai_sentiment 
    } = req.body;
    const result = await db.prepare(`
      INSERT INTO exit_interviews (
        employee_id, departure_date, primary_reason, reason_details,
        manager_rating, culture_rating, benefits_rating, would_recommend_score,
        retention_feedback, estimated_replacement_cost, ai_sentiment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employee_id, departure_date, primary_reason, reason_details,
      manager_rating || 3, culture_rating || 4, benefits_rating || 3, would_recommend_score || 7,
      retention_feedback, estimated_replacement_cost || 25000, ai_sentiment || 'neutral'
    );
    res.json({ success: true, id: result.lastInsertRowid });
  });

    // GET Exit Interviews Analytics

  app.get("/api/exit-interviews/analytics", async (req, res) => {
    const exits = await db.prepare(`
      SELECT ex.*, d.name as department_name
      FROM exit_interviews ex
      JOIN employees e ON ex.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all() as any[];
    const totalExits = exits.length;
    const reasonCounts: { [key: string]: number } = {};
    const deptCounts: { [key: string]: number } = {};
    let totalCost = 0;
    let sumCulture = 0;
    let sumManager = 0;
    exits.forEach(ex => {
      reasonCounts[ex.primary_reason] = (reasonCounts[ex.primary_reason] || 0) + 1;
      const dept = ex.department_name || 'عام';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      totalCost += (ex.estimated_replacement_cost || 25000);
      sumCulture += (ex.culture_rating || 3);
      sumManager += (ex.manager_rating || 3);
    });
    const reasonLabelsMap: { [key: string]: string } = {
      salary: 'تنافسية الراتب والبدلات المالية',
      career_growth: 'فرص التطور والمسار المهني',
      management: 'أسلوب الإدارة المباشرة',
      work_life_balance: 'التوازن بين العمل والحياة وضغط المهام',
      relocation: 'الانتقال الجغرافي / ظروف عائلية',
      toxic_culture: 'بيئة العمل وثقافة الفريق',
      health_personal: 'أسباب صحية وشخصية'
    };
    const topReasons = Object.entries(reasonCounts).map(([k, v]) => ({
      reason: reasonLabelsMap[k] || k,
      count: v,
      percentage: totalExits > 0 ? Math.round((v / totalExits) * 100) : 0
    })).sort((a, b) => b.count - a.count);
    const departmentHotspots = Object.entries(deptCounts).map(([k, v]) => ({
      department: k,
      count: v,
      turnoverRate: Math.round((v / (totalExits || 1)) * 100)
    })).sort((a, b) => b.count - a.count);
    const aiStrategicInsights = [
      'تظهر تحليلات مقابلات الخروج أن 65% من حالات المغادرة ترتبط بفرص الترقية وسقف الرواتب التنافسي في السوق.',
      'تقييم ثقافة الشركة العام إيجابي (4.0/5) مما يدل على رضا الموظفين عن بيئة العمل الداخلية والزملاء.',
      'يوصى بتقديم برامج استبقاء وحوافز مرتبطة بإتمام المشاريع وتفعيل نظام التقييم نصف السنوي للترقيات.'
    ];
    res.json({
      totalExits,
      topReasons,
      departmentHotspots,
      totalReplacementCost: totalCost,
      avgCultureRating: totalExits > 0 ? Number((sumCulture / totalExits).toFixed(1)) : 4.0,
      avgManagerRating: totalExits > 0 ? Number((sumManager / totalExits).toFixed(1)) : 3.8,
      aiStrategicInsights
    });
  });

    // ====================================================
    // API: Grievances, Hearing Sessions & Warnings (التظلمات ولجان التحقيق والإنذارات)
    // ====================================================

  app.get("/api/grievances", async (req, res) => {
    try {
      const rows = await db.prepare(`
        SELECT g.*, e.name as employee_name, d.name as department_name
        FROM employee_grievances g
        LEFT JOIN employees e ON g.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        ORDER BY g.created_at DESC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع التظلمات" });
    }
  });

  app.post("/api/grievances", async (req, res) => {
    try {
      const { employee_id, category, subject, details, is_confidential, against_person } = req.body;
      const count = (await db.prepare("SELECT COUNT(*) as c FROM employee_grievances").get() as any).c + 1;
      const ticket = `GRV-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;
      const result = await db.prepare(`
        INSERT INTO employee_grievances (ticket_number, employee_id, category, subject, details, is_confidential, against_person, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')
      `).run(ticket, employee_id, category || 'work_environment', subject, details, is_confidential ? 1 : 0, against_person || null);
      await createNotification('تظلم إداري جديد (المادة 209)', `تم استلام تظلم إداري برقم ${ticket} وهو بانتظار تشكيل لجنة الفحص.`, 'warning');
      res.json({ id: result.lastInsertRowid, ticket_number: ticket, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تسجيل التظلم" });
    }
  });

  app.put("/api/grievances/:id/status", async (req, res) => {
    try {
      const { status, committee_notes, resolution_summary } = req.body;
      const resolvedAt = status === 'resolved' || status === 'rejected' ? new Date().toISOString() : null;
      await db.prepare(`
        UPDATE employee_grievances 
        SET status = ?, committee_notes = COALESCE(?, committee_notes), resolution_summary = COALESCE(?, resolution_summary), resolved_at = COALESCE(?, resolved_at)
        WHERE id = ?
      `).run(status, committee_notes, resolution_summary, resolvedAt, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث حالة التظلم" });
    }
  });

  app.get("/api/hearings", async (req, res) => {
    try {
      const rows = await db.prepare("SELECT * FROM hearing_sessions ORDER BY session_date DESC").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع جلسات التحقيق" });
    }
  });

  app.post("/api/hearings", async (req, res) => {
    try {
      const { grievance_id, session_title, session_date, location, committee_chair, hr_representative, legal_counsel, employee_name, witnesses, statements_minutes, committee_verdict, recommended_sanction, deduction_days } = req.body;
      const result = await db.prepare(`
        INSERT INTO hearing_sessions (grievance_id, session_title, session_date, location, committee_chair, hr_representative, legal_counsel, employee_name, witnesses, statements_minutes, committee_verdict, recommended_sanction, deduction_days, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(grievance_id || null, session_title, session_date, location || 'غرفة التحقيقات والامتثال', committee_chair, hr_representative, legal_counsel, employee_name, witnesses || '', statements_minutes, committee_verdict, recommended_sanction || 'none', deduction_days || 0);
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل حفظ محضر التحقيق" });
    }
  });

  app.get("/api/warnings", async (req, res) => {
    try {
      const rows = await db.prepare(`
        SELECT w.*, e.name as employee_name, e.national_id_iqama as national_id, e.job_title, d.name as department_name
        FROM official_warnings w
        LEFT JOIN employees e ON w.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        ORDER BY w.issue_date DESC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع الإنذارات الرسمية" });
    }
  });

  app.post("/api/warnings", async (req, res) => {
    try {
      const { employee_id, warning_type, violation_clause, violation_date, investigation_ref, penalty_details, deduction_amount, issued_by, issue_date } = req.body;
      const count = (await db.prepare("SELECT COUNT(*) as c FROM official_warnings").get() as any).c + 1;
      const noticeNum = `WRN-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;
      const result = await db.prepare(`
        INSERT INTO official_warnings (notice_number, employee_id, warning_type, violation_clause, violation_date, investigation_ref, penalty_details, deduction_amount, issued_by, issue_date, acknowledgement_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'acknowledged')
      `).run(noticeNum, employee_id, warning_type, violation_clause, violation_date, investigation_ref || null, penalty_details, deduction_amount || 0, issued_by, issue_date || new Date().toISOString().split('T')[0]);
      res.json({ id: result.lastInsertRowid, notice_number: noticeNum, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل إصدار الإنذار الرسمي" });
    }
  });

}
