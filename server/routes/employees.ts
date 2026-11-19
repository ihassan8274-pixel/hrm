// Route module. Registered from server/index.ts; the order there is the route order.
import db, { logAction, createNotification } from "../config/postgres";
import { uploadsDir } from "../services/helpers";
import { requireRole, authenticateToken } from "../middleware/auth";
import { requireOrganizationScope, organizationScope } from "../middleware/organizationScope";
import { assertWritableScope, resolveWritableEntity, ScopeError } from "../lib/organization-scope";
import path from "path";
import fs from "fs";
import express from "express";

export function registerEmployees(app: express.Express) {

    // Employees

  app.get("/api/employees", authenticateToken, requireOrganizationScope, async (req, res) => {
    const { entityId, branchId, employeeId } = organizationScope(res);
    const employees = (await db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name,
      COALESCE((SELECT SUM(amount) FROM employee_allowances WHERE employee_id = e.id), 0) as allowances
      FROM employees e 
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
    `).all(entityId, entityId, branchId, branchId, employeeId, employeeId));
    
    // map مع async يُنتج مصفوفة من الوعود، وJSON.stringify يُسلسلها كـ {} —
// أي أن قائمة الموظفين كانت تُرسل فارغة. لازم ننتظرها قبل الإرسال.
    const employeesWithDetails = await Promise.all(employees.map(async emp => {
      const allowancesDetails = (await db.prepare(`
        SELECT ea.*, at.name
        FROM employee_allowances ea
        JOIN allowance_types at ON ea.allowance_type_id = at.id
        WHERE ea.employee_id = ?
      `).all((emp as any).id));
      return { ...emp, allowances_details: allowancesDetails };
    }));
    res.json(employeesWithDetails);
  });

  app.post("/api/employees", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const {
      branch_id, department_id, name, position, job_title,
      basic_salary, deductions, allowances_list,
      insurance_number, bank_account,
      nationality = 'سعودي', is_saudi = 1, national_id_iqama = '',
      border_number = '', iqama_expiry_gregorian = '', iqama_expiry_hijri = '',
      iqama_profession = '', work_permit_number = '', work_permit_expiry = '',
      work_permit_fee = 9600, gosi_number = '', gosi_registered_salary = 0,
      housing_allowance = 0, transport_allowance = 0, other_allowances = 0,
      insurance_company = 'التعاونية للتأمين', medical_insurance_category = 'Class A',
      medical_insurance_policy = '', medical_insurance_expiry = '',
      medical_dependents_count = 0, saudi_iban = '', bank_name = 'مصرف الراجحي',
      contract_type = 'fixed', contract_start_date = '', contract_end_date = '',
      passport_number = '', passport_expiry = '', health_cert_number = '', health_cert_expiry = '',
      payment_method = 'bank'
    } = req.body;

    // A new employee has to land inside the caller's organization, and the branch
    // it is placed in has to belong to that same organization.
    let entityId = 0;
    try {
      const targetBranch = branch_id
        ? (await db.prepare('SELECT id, entity_id FROM branches WHERE id = ?').get(branch_id)) as { id: number; entity_id: number | null } | undefined
        : undefined;
      if (branch_id && !targetBranch) {
        return res.status(400).json({ error: "الفرع غير موجود" });
      }
      entityId = (await resolveWritableEntity(db, scope, req.body.entity_id ?? targetBranch?.entity_id, 'الكيان'));
      if (targetBranch && targetBranch.entity_id !== null && targetBranch.entity_id !== entityId) {
        return res.status(400).json({ error: "الفرع المحدد لا ينتمي إلى الكيان المحدد" });
      }
      if (scope.branchId !== null && Number(branch_id) !== scope.branchId) {
        return res.status(403).json({ error: "لا يمكن إضافة موظف خارج فرعك" });
      }
      if (department_id) {
        const targetDepartment = (await db.prepare('SELECT id, entity_id FROM departments WHERE id = ?').get(department_id)) as { id: number; entity_id: number | null } | undefined;
        if (!targetDepartment) {
          return res.status(400).json({ error: "الإدارة غير موجودة" });
        }
        if (targetDepartment.entity_id !== null && targetDepartment.entity_id !== entityId) {
          return res.status(403).json({ error: "الإدارة المحددة خارج نطاق حسابك" });
        }
      }
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }

    const computedGosiSalary = gosi_registered_salary > 0 ? gosi_registered_salary : (Number(basic_salary) + Number(housing_allowance));
    const isSaudiCalc = is_saudi !== undefined ? is_saudi : (nationality === 'سعودي' || nationality === 'سعودية' ? 1 : 0);
    const insertEmployee = db.prepare(`
      INSERT INTO employees (
        branch_id, entity_id, department_id, name, position, job_title,
        basic_salary, deductions, insurance_number, bank_account,
        nationality, is_saudi, national_id_iqama, border_number,
        iqama_expiry_gregorian, iqama_expiry_hijri, iqama_profession,
        work_permit_number, work_permit_expiry, work_permit_fee,
        gosi_number, gosi_registered_salary, housing_allowance, transport_allowance, other_allowances,
        insurance_company, medical_insurance_category, medical_insurance_policy, medical_insurance_expiry,
        medical_dependents_count, saudi_iban, bank_name, contract_type, contract_start_date, contract_end_date,
        passport_number, passport_expiry, health_cert_number, health_cert_expiry, payment_method
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);
    const insertAllowance = db.prepare(`
      INSERT INTO employee_allowances (employee_id, allowance_type_id, amount)
      VALUES (?, ?, ?)
    `);
    const transaction = db.transaction(async () => {
      const info = await insertEmployee.run(
        branch_id, entityId, department_id, name, position, job_title,
        basic_salary, deductions, insurance_number, bank_account,
        nationality, isSaudiCalc, national_id_iqama, border_number,
        iqama_expiry_gregorian, iqama_expiry_hijri, iqama_profession,
        work_permit_number, work_permit_expiry, work_permit_fee,
        gosi_number, computedGosiSalary, housing_allowance, transport_allowance, other_allowances,
        insurance_company, medical_insurance_category, medical_insurance_policy, medical_insurance_expiry,
        medical_dependents_count, saudi_iban, bank_name, contract_type, contract_start_date, contract_end_date,
        passport_number, passport_expiry, health_cert_number, health_cert_expiry, payment_method
      );
      const employeeId = info.lastInsertRowid;
      if (allowances_list && Array.isArray(allowances_list)) {
        for (const al of allowances_list) {
          if (al.type_id && al.amount) {
            await insertAllowance.run(employeeId, al.type_id, al.amount);
          }
        }
      }
      return employeeId;
    });
    const id = await transaction();
    await logAction('create', 'employee', Number(id), `Created employee with KSA compliance: ${name}`);
    res.json({ id });
  });

  app.put("/api/employees/:id", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const {
      branch_id, department_id, name, position, job_title,
      basic_salary, deductions, allowances_list,
      insurance_number, bank_account,
      nationality = 'سعودي', is_saudi = 1, national_id_iqama = '',
      border_number = '', iqama_expiry_gregorian = '', iqama_expiry_hijri = '',
      iqama_profession = '', work_permit_number = '', work_permit_expiry = '',
      work_permit_fee = 9600, gosi_number = '', gosi_registered_salary = 0,
      housing_allowance = 0, transport_allowance = 0, other_allowances = 0,
      insurance_company = 'التعاونية للتأمين', medical_insurance_category = 'Class A',
      medical_insurance_policy = '', medical_insurance_expiry = '',
      medical_dependents_count = 0, saudi_iban = '', bank_name = 'مصرف الراجحي',
      contract_type = 'fixed', contract_start_date = '', contract_end_date = '',
      passport_number = '', passport_expiry = '', health_cert_number = '', health_cert_expiry = '',
      payment_method = 'bank'
    } = req.body;

    const existing = (await db.prepare('SELECT id, entity_id, branch_id FROM employees WHERE id = ?').get(req.params.id)) as {
      id: number; entity_id: number | null; branch_id: number | null;
    } | undefined;
    if (!existing) return res.status(404).json({ error: "الموظف غير موجود" });
    try {
      assertWritableScope(scope, { entityId: existing.entity_id, branchId: existing.branch_id }, 'الموظف');
      if (branch_id) {
        const targetBranch = (await db.prepare('SELECT id, entity_id FROM branches WHERE id = ?').get(branch_id)) as { id: number; entity_id: number | null } | undefined;
        if (!targetBranch) return res.status(400).json({ error: "الفرع غير موجود" });
        if (existing.entity_id !== null && targetBranch.entity_id !== existing.entity_id) {
          return res.status(400).json({ error: "الفرع المحدد لا ينتمي إلى كيان الموظف" });
        }
        if (scope.branchId !== null && Number(branch_id) !== scope.branchId) {
          return res.status(403).json({ error: "لا يمكن نقل الموظف خارج فرعك" });
        }
      }
      if (department_id) {
        const targetDepartment = (await db.prepare('SELECT id, entity_id FROM departments WHERE id = ?').get(department_id)) as { id: number; entity_id: number | null } | undefined;
        if (!targetDepartment) return res.status(400).json({ error: "الإدارة غير موجودة" });
        if (existing.entity_id !== null && targetDepartment.entity_id !== null && targetDepartment.entity_id !== existing.entity_id) {
          return res.status(403).json({ error: "الإدارة المحددة خارج نطاق حسابك" });
        }
      }
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }

    const computedGosiSalary = gosi_registered_salary > 0 ? gosi_registered_salary : (Number(basic_salary) + Number(housing_allowance));
    const isSaudiCalc = is_saudi !== undefined ? is_saudi : (nationality === 'سعودي' || nationality === 'سعودية' ? 1 : 0);
    const transaction = db.transaction(async () => {
      (await db.prepare(`
        UPDATE employees SET
          branch_id = COALESCE(?, branch_id), department_id = COALESCE(?, department_id),
          name = ?, position = ?, job_title = ?,
          basic_salary = ?, deductions = ?, insurance_number = ?, bank_account = ?,
          nationality = ?, is_saudi = ?, national_id_iqama = ?, border_number = ?,
          iqama_expiry_gregorian = ?, iqama_expiry_hijri = ?, iqama_profession = ?,
          work_permit_number = ?, work_permit_expiry = ?, work_permit_fee = ?,
          gosi_number = ?, gosi_registered_salary = ?, housing_allowance = ?, transport_allowance = ?, other_allowances = ?,
          insurance_company = ?, medical_insurance_category = ?, medical_insurance_policy = ?, medical_insurance_expiry = ?,
          medical_dependents_count = ?, saudi_iban = ?, bank_name = ?, contract_type = ?, contract_start_date = ?, contract_end_date = ?,
          passport_number = ?, passport_expiry = ?, health_cert_number = ?, health_cert_expiry = ?, payment_method = ?
        WHERE id = ?
      `).run(
        branch_id || null, department_id || null,
        name, position, job_title,
        basic_salary, deductions, insurance_number, bank_account,
        nationality, isSaudiCalc, national_id_iqama, border_number,
        iqama_expiry_gregorian, iqama_expiry_hijri, iqama_profession,
        work_permit_number, work_permit_expiry, work_permit_fee,
        gosi_number, computedGosiSalary, housing_allowance, transport_allowance, other_allowances,
        insurance_company, medical_insurance_category, medical_insurance_policy, medical_insurance_expiry,
        medical_dependents_count, saudi_iban, bank_name, contract_type, contract_start_date, contract_end_date,
        passport_number, passport_expiry, health_cert_number, health_cert_expiry, payment_method,
        req.params.id
      ));
      (await db.prepare("DELETE FROM employee_allowances WHERE employee_id = ?").run(req.params.id));
      if (allowances_list && Array.isArray(allowances_list)) {
        for (const al of allowances_list) {
          if (al.type_id && al.amount) {
            (await db.prepare("INSERT INTO employee_allowances (employee_id, allowance_type_id, amount) VALUES (?, ?, ?)").run(req.params.id, al.type_id, al.amount));
          }
        }
      }
    });
    transaction();
    await logAction('update', 'employee', Number(req.params.id), `Updated employee details: ${name}`);
    res.json({ success: true });
  });

  app.delete("/api/employees/:id", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const employeeId = req.params.id;
    const existing = (await db.prepare('SELECT id, entity_id, branch_id FROM employees WHERE id = ?').get(employeeId)) as {
      id: number; entity_id: number | null; branch_id: number | null;
    } | undefined;
    if (!existing) return res.status(404).json({ error: "الموظف غير موجود" });
    try {
      assertWritableScope(scope, { entityId: existing.entity_id, branchId: existing.branch_id }, 'الموظف');
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    (await db.prepare("DELETE FROM employees WHERE id = ?").run(employeeId));
    (await db.prepare("DELETE FROM employee_allowances WHERE employee_id = ?").run(employeeId));
    await logAction('delete', 'employee', Number(employeeId), `Deleted employee`);
    res.json({ success: true });
  });

    // Documents

  app.get("/api/documents", async (req, res) => {
    const docs = (await db.prepare(`
      SELECT d.*, e.name as employee_name 
      FROM documents d 
      JOIN employees e ON d.employee_id = e.id
    `).all());
    res.json(docs);
  });

  app.post("/api/documents", async (req, res) => {
    const { employee_id, name, type, expiry_date } = req.body;
    const info = (await db.prepare(`
      INSERT INTO documents (employee_id, name, type, expiry_date)
      VALUES (?, ?, ?, ?)
    `).run(employee_id, name, type, expiry_date));
    res.json({ id: info.lastInsertRowid });
  });

    // Assets

  app.get("/api/assets", async (req, res) => {
    const assets = (await db.prepare(`
      SELECT a.*, e.name as assigned_to_name 
      FROM assets a 
      LEFT JOIN employees e ON a.assigned_to = e.id
    `).all());
    res.json(assets);
  });

  app.post("/api/assets", async (req, res) => {
    const { name, type, serial_number } = req.body;
    const info = (await db.prepare(`
      INSERT INTO assets (name, type, serial_number)
      VALUES (?, ?, ?)
    `).run(name, type, serial_number));
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/assets/:id/assign", async (req, res) => {
    const { employee_id } = req.body;
    (await db.prepare(`
      UPDATE assets SET assigned_to = ?, assigned_at = ?, status = 'assigned' 
      WHERE id = ?
    `).run(employee_id, new Date().toISOString(), req.params.id));
    res.json({ success: true });
  });

    // Performance Appraisals

  app.get("/api/appraisals", async (req, res) => {
    const data = (await db.prepare(`
      SELECT a.*, e.name as employee_name 
      FROM appraisals a 
      JOIN employees e ON a.employee_id = e.id
    `).all());
    res.json(data);
  });

  app.post("/api/appraisals", async (req, res) => {
    const { employee_id, rating, comments, period, appraisal_date } = req.body;
    const info = (await db.prepare(`
      INSERT INTO appraisals (employee_id, rating, comments, period, appraisal_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(employee_id, rating, comments, period, appraisal_date));
    res.json({ id: info.lastInsertRowid });
  });

    // Promotions

  app.get('/api/promotions', async (req, res) => {
    const data = (await db.prepare(`
      SELECT p.*, e.name as employee_name
      FROM promotions p
      JOIN employees e ON p.employee_id = e.id
      ORDER BY p.promotion_date DESC
    `).all());
    res.json(data);
  });

  app.post('/api/promotions', async (req, res) => {
    const { employee_id, old_position, new_position, old_salary, new_salary, promotion_date } = req.body;
    (await db.prepare(`
      INSERT INTO promotions (employee_id, old_position, new_position, old_salary, new_salary, promotion_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, old_position, new_position, old_salary, new_salary, promotion_date));
    (await db.prepare('UPDATE employees SET position = ?, basic_salary = ? WHERE id = ?').run(new_position, new_salary, employee_id));
    res.json({ success: true });
  });

    // ---- Employee Documents ----

  // NOTE: these were previously registered at /api/documents, which collided with
  // the simpler `documents` table handlers above. Express keeps the first match,
  // so the upload flow (file validation, size limits, employee_documents) was
  // unreachable and EmployeeDocumentsView silently posted into the wrong table.
  // They now live on their own path.
  app.get("/api/employee-documents", async (req, res) => {
    try {
      const rows = (await db.prepare(`
        SELECT d.*, e.name as employee_name FROM employee_documents d
        LEFT JOIN employees e ON e.id = d.employee_id ORDER BY d.id DESC
      `).all());
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/employee-documents/:employeeId", async (req, res) => {
    try {
      const rows = (await db.prepare("SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC").all(req.params.employeeId));
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/employee-documents", async (req, res) => {
    try {
      const { employee_id, doc_type, doc_number, issue_date, expiry_date, data_uri, notes } = req.body;
      if (!employee_id) return res.status(400).json({ error: "employee_id مطلوب" });
      let file_path = null;
      if (data_uri) {
        const m = /^data:([^;]+);base64,(.+)$/.exec(data_uri);
        if (m) {
          const mime = m[1];
          const allowedMimes = [
            "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ];
          if (!allowedMimes.includes(mime)) {
            return res.status(400).json({ error: "نوع الملف غير مسموح" });
          }
          const base64 = m[2];
          const maxSize = 20 * 1024 * 1024; // 20MB
          if (base64.length > maxSize * 1.4) { // base64 ~33% overhead
            return res.status(400).json({ error: "حجم الملف يتجاوز 20MB" });
          }
          const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const fname = `doc-${employee_id}-${Date.now()}.${ext}`;
          fs.writeFileSync(path.join(uploadsDir, fname), Buffer.from(base64, 'base64'));
          file_path = `/uploads/${fname}`;
        }
      }
      const r = (await db.prepare(`
        INSERT INTO employee_documents (employee_id, doc_type, doc_number, issue_date, expiry_date, file_path, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(employee_id, doc_type || 'other', doc_number || null, issue_date || null, expiry_date || null, file_path, notes || null));
      res.json({ id: r.lastInsertRowid, success: true, file_path });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/employee-documents/:id", async (req, res) => {
    try {
      (await db.prepare("DELETE FROM employee_documents WHERE id = ?").run(req.params.id));
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

    // ---- Transfers ----

  app.get("/api/transfers", async (req, res) => {
    try {
      const rows = (await db.prepare(`
        SELECT t.*, e.name as employee_name, fb.name as from_branch, tb.name as to_branch
        FROM employee_transfers t
        LEFT JOIN employees e ON e.id = t.employee_id
        LEFT JOIN branches fb ON fb.id = t.from_branch_id
        LEFT JOIN branches tb ON tb.id = t.to_branch_id
        ORDER BY t.effective_date DESC
      `).all());
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/transfers", async (req, res) => {
    try {
      const { employee_id, to_branch_id, effective_date, reason } = req.body;
      if (!employee_id || !to_branch_id) return res.status(400).json({ error: "employee_id و to_branch_id مطلوبان" });
      const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      // A transfer moves the employee inside their own organization — it must
      // not be a way out of the entity the employee belongs to.
      const target = (await db.prepare("SELECT id, entity_id FROM branches WHERE id = ?").get(to_branch_id)) as { id: number; entity_id: number | null } | undefined;
      if (!target) return res.status(400).json({ error: "الفرع غير موجود" });
      if (emp.entity_id != null && target.entity_id !== emp.entity_id) {
        return res.status(400).json({ error: "الفرع الهدف لا ينتمي إلى كيان الموظف" });
      }
      const from = emp.branch_id || null;
      const r = (await db.prepare(`
        INSERT INTO employee_transfers (employee_id, from_branch_id, to_branch_id, effective_date, reason)
        VALUES (?, ?, ?, ?, ?)
      `).run(employee_id, from, to_branch_id, effective_date || new Date().toISOString().slice(0, 10), reason || null));
      (await db.prepare("UPDATE employees SET branch_id = ? WHERE id = ?").run(to_branch_id, employee_id));
      await logAction("update", "employee", employee_id, `Transferred to branch ${to_branch_id}`);
      await createNotification('نقل موظف', `تم نقل ${emp.name} إلى فرع جديد`, 'info');
      res.json({ id: r.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

}
