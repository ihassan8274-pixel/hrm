import db from "../config/postgres";
import { DEFAULT_ADMIN_PASSWORD } from "../config/credentials";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { log } from "../lib/logger";

// DDL + idempotent demo seeds for the modules that kept their schema inline after the
// route split: EWA (13), HSE (14), Exit Interviews (16), Approval Workflows (17).
// Kept out of the index entry so the server bootstrap stays a thin composition.
// Ensure base entities exist before seeding advanced modules
async function ensureBaseEntities() {
  const defaultCountries = [
    { code: 'SA', name_ar: 'السعودية', name_en: 'Saudi Arabia', currency: 'SAR', symbol_ar: 'ر.س', symbol_en: 'SAR', insurance_type: 'gosi', employee_rate: 9.75, employer_rate: 11.75, ceiling: 45000, tax_type: 'none', eos_type: 'saudi_half_month', leave_days: 21, work_days: 6, weekend: '[5,6]', wps: 'sama' },
    { code: 'EG', name_ar: 'مصر', name_en: 'Egypt', currency: 'EGP', symbol_ar: 'ج.م', symbol_en: 'EGP', insurance_type: 'egypt_social', employee_rate: 11, employer_rate: 18.75, ceiling: 12600, tax_type: 'progressive', eos_type: 'egypt_half_month', leave_days: 21, work_days: 6, weekend: '[5]', wps: 'egypt_sif' },
  ];
  for (const country of defaultCountries) {
    await db.prepare(`INSERT OR IGNORE INTO countries
      (code, name_ar, name_en, currency, currency_symbol_ar, currency_symbol_en, insurance_type,
       insurance_emp_rate, insurance_comp_rate, insurance_ceiling, tax_type, eos_type,
       annual_leave_days, working_days_per_week, weekend_days_json, wps_format, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(country.code, country.name_ar, country.name_en, country.currency, country.symbol_ar, country.symbol_en,
        country.insurance_type, country.employee_rate, country.employer_rate, country.ceiling, country.tax_type,
        country.eos_type, country.leave_days, country.work_days, country.weekend, country.wps);
  }
  for (const [key, value] of [
    ['org_name', 'مؤسسة الرواتب العالمية'], ['country', 'Egypt'], ['currency', 'EGP'], ['tax_rate', '10'],
  ]) {
    await db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
  let entity = await db.prepare('SELECT id FROM entities ORDER BY id LIMIT 1').get() as any;
  if (!entity) {
    await db.prepare(`INSERT INTO entities (name_ar, name_en, country_code, currency, tax_rate, is_active)
      VALUES (?, ?, ?, ?, ?, 1)`).run('الشركة الرئيسية', 'Main Company', 'SA', 'SAR', 0);
    entity = await db.prepare('SELECT id FROM entities ORDER BY id LIMIT 1').get() as any;
  }
  const entityId = Number(entity.id);

  // Ensure at least one branch exists
  const branchCount = await db.prepare("SELECT COUNT(*) as c FROM branches").get() as any;
  if (branchCount.c === 0) {
    await db.prepare(`
      INSERT INTO branches (name, name_en, latitude, longitude, geofence_radius_m, work_start_time, work_end_time, entity_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('الفرع الرئيسي - الرياض', 'Main Branch - Riyadh', 24.7136, 46.6753, 200, '08:00', '17:00', entityId, 1);
  }

  // Ensure at least one department exists
  const deptCount = await db.prepare("SELECT COUNT(*) as c FROM departments").get() as any;
  if (deptCount.c === 0) {
    await db.prepare(`
      INSERT INTO departments (name, name_en, entity_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run('الموارد البشرية والشؤون الحكومية', 'HR & Government Affairs', entityId, new Date().toISOString());
  }

  // Ensure at least one position exists
  const posCount = await db.prepare("SELECT COUNT(*) as c FROM positions").get() as any;
  if (posCount.c === 0) {
    const dept = await db.prepare("SELECT id FROM departments LIMIT 1").get() as any;
    if (dept) {
      await db.prepare(`
        INSERT INTO positions (code, name_ar, name_en, department_id, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run('HR_SPECIALIST', 'أخصائي موارد بشرية', 'HR Specialist', dept.id, 1);
    }
  }

  return entityId;
}

export async function seedExtendedModules() {
  // Ensure base entities exist first
  const entityId = await ensureBaseEntities();
  // ==========================================
  // MODULE 13: EARNED WAGE ACCESS (EWA سحب الراتب عند الطلب)
  // ==========================================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ewa_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      request_date DATE NOT NULL,
      earned_salary_so_far REAL NOT NULL,
      requested_amount REAL NOT NULL,
      fee REAL DEFAULT 0,
      net_disbursed REAL NOT NULL,
      status TEXT DEFAULT 'approved', -- 'pending', 'approved', 'paid', 'deducted', 'rejected'
      disbursement_method TEXT DEFAULT 'instant_iban',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  // ==========================================
  // SALARY STRUCTURE SEED DATA
  // ==========================================
  // Seed standard Saudi salary components
  const saudiComponents = [
    // Earnings - الإيرادات
    ['BASIC', 'الراتب الأساسي', 'earning', 'basic', 'formula', 'base_salary', null, 1, 1, 1],
    ['HOUSING', 'بدل السكن', 'earning', 'allowance', 'percentage', 'base_salary * 0.25', null, 2, 1, 1],
    ['TRANSPORT', 'بدل النقل', 'earning', 'allowance', 'fixed', '1000', null, 3, 1, 1],
    ['PHONE', 'بدل الهاتف', 'earning', 'allowance', 'fixed', '200', null, 4, 1, 0],
    ['OVERTIME', 'العمل الإضافي', 'earning', 'allowance', 'formula', 'overtime_hours * hourly_rate * 1.5', null, 5, 1, 0],
    ['COMMISSION', 'العمولات', 'earning', 'other', 'fixed', '0', null, 6, 1, 1],
    ['BONUS', 'المكافآت', 'earning', 'other', 'fixed', '0', null, 7, 1, 1],
    ['OTHER_ALLOW', 'بدلات أخرى', 'earning', 'allowance', 'fixed', '0', null, 8, 1, 1],
    
    // Deductions (Employee) - الخصومات (الموظف)
    ['GOSI_EMP', 'التأمينات الاجتماعية (موظف)', 'deduction', 'statutory', 'formula', 'min(gosi_ceiling, gross_salary) * gosi_emp_rate', 'is_saudi == 1', 10, 1, 0],
    ['TAX', 'ضريبة الدخل', 'deduction', 'tax', 'bracket', 'taxable_income', null, 11, 1, 0],
    ['LOAN_INST', 'أقساط السلفيات/القروض', 'deduction', 'loan', 'fixed', 'total_installment', null, 12, 0, 0],
    ['ABSENT_DED', 'خصم الغياب', 'deduction', 'other', 'formula', 'absent_days * daily_rate', null, 13, 0, 0],
    ['LATE_DED', 'خصم التأخير', 'deduction', 'other', 'formula', '(late_minutes / 60) * hourly_rate', null, 14, 0, 0],
    ['ADVANCE_DED', 'خصم السلف', 'deduction', 'loan', 'fixed', 'total_deduction', null, 15, 0, 0],
    ['OTHER_DED', 'خصومات أخرى', 'deduction', 'other', 'fixed', '0', null, 16, 0, 0],
    
    // Employer Contributions - مساهمات صاحب العمل (للتقارير المحاسبية)
    ['GOSI_COMP', 'التأمينات الاجتماعية (صاحب عمل)', 'employer_contribution', 'statutory', 'formula', 'min(gosi_ceiling, gross_salary) * gosi_comp_rate', 'is_saudi == 1', 20, 0, 0],
    ['GOSI_EXPAT', 'مخاطر مهنية (وافدين)', 'employer_contribution', 'statutory', 'formula', 'gross_salary * expat_gosi_comp_rate', 'is_saudi == 0', 21, 0, 0],
    ['MEDICAL_INS', 'التأمين الطبي', 'employer_contribution', 'statutory', 'fixed', 'medical_premium_per_employee', null, 22, 0, 0],
  ];

  for (const c of saudiComponents) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO salary_components (code, name_ar, type, category, calculation_type, calculation_value, condition_formula, display_order, is_taxable, is_gosi_applicable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...c);
    } catch (e) {}
  }

  // Create default Saudi salary structure
  const defaultStructure = await db.prepare("SELECT id FROM salary_structures WHERE code = 'SA_DEFAULT'").get();
  if (!defaultStructure) {
    const structId = (await db.prepare(`
      INSERT INTO salary_structures (code, name_ar, name_en, entity_id, payroll_frequency, currency, country_code, is_default, is_active)
      VALUES ('SA_DEFAULT', 'الهيكل القياسي - السعودية', 'Standard KSA Structure', ?, 'monthly', 'SAR', 'SA', 1, 1)
    `).run(entityId)).lastInsertRowid;
    
    // Link all components
    const compIds = await db.prepare("SELECT id FROM salary_components WHERE is_active = 1 ORDER BY display_order").all() as any[];
    const insertComp = db.prepare(`
      INSERT INTO salary_structure_components (structure_id, component_id, sequence, is_mandatory)
      VALUES (?, ?, ?, 1)
    `);
    for (const [idx, c] of compIds.entries()) await insertComp.run(structId, c.id, idx);
  }

  // ==========================================
  // MODULE 14: HEALTH, SAFETY & ENVIRONMENT (HSE السلامة المهنية)
  // ==========================================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS hse_inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      inspector_name TEXT NOT NULL,
      inspection_date DATE NOT NULL,
      category TEXT NOT NULL, -- fire_safety, emergency_exits, electrical, ventilation, first_aid, ppe_compliance
      status TEXT DEFAULT 'compliant', -- compliant, needs_action, critical
      score INTEGER DEFAULT 95,
      findings TEXT,
      corrective_actions TEXT,
      deadline_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hse_ppe_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_type TEXT DEFAULT 'helmet', -- helmet, shoes, vest, goggles, gloves, mask
      issue_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      status TEXT DEFAULT 'active', -- active, renewed, expired, damaged
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  // ==========================================
  // MODULE 16: EXIT INTERVIEW & TURNOVER ANALYTICS (مقابلات الخروج)
  // ==========================================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS exit_interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      departure_date DATE NOT NULL,
      primary_reason TEXT NOT NULL, -- salary, management, career_growth, work_life_balance, relocation, toxic_culture, health_personal
      reason_details TEXT,
      manager_rating INTEGER DEFAULT 3,
      culture_rating INTEGER DEFAULT 4,
      benefits_rating INTEGER DEFAULT 3,
      would_recommend_score INTEGER DEFAULT 7,
      retention_feedback TEXT,
      estimated_replacement_cost REAL DEFAULT 25000,
      ai_sentiment TEXT DEFAULT 'neutral', -- negative, neutral, positive
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  // ==========================================
  // MODULE 17: MULTI-LEVEL APPROVAL WORKFLOWS (مسارات الاعتماد)
  // ==========================================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS approval_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_type TEXT NOT NULL, -- leave_request, loan_advance, promotion, expense_claim, ewa_withdrawal, hiring_requisition
      title TEXT NOT NULL,
      description TEXT,
      conditions_json TEXT DEFAULT '{}',
      levels_json TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      request_title TEXT NOT NULL,
      amount REAL DEFAULT 0,
      details TEXT,
      current_level INTEGER DEFAULT 1,
      max_levels INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending', -- pending, approved, rejected
      approval_history_json TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  // Seed default workflows
  const checkWorkflows = await db.prepare("SELECT COUNT(*) as count FROM approval_workflows").get() as any;
  if (checkWorkflows.count === 0) {
    const loanLevels = JSON.stringify([
      { level: 1, approver_role: 'direct_manager', approver_role_ar: 'المدير المباشر', sla_hours: 24 },
      { level: 2, approver_role: 'hr_manager', approver_role_ar: 'مدير الموارد البشرية', sla_hours: 48 },
      { level: 3, approver_role: 'finance_director', approver_role_ar: 'المدير المالي التنفيذي', sla_hours: 48 }
    ]);

    const leaveLevels = JSON.stringify([
      { level: 1, approver_role: 'direct_manager', approver_role_ar: 'المدير المباشر', sla_hours: 24 },
      { level: 2, approver_role: 'hr_manager', approver_role_ar: 'شؤون الموظفين (HR)', sla_hours: 24 }
    ]);

    const expenseLevels = JSON.stringify([
      { level: 1, approver_role: 'department_head', approver_role_ar: 'رئيس القسم', sla_hours: 24 },
      { level: 2, approver_role: 'finance_director', approver_role_ar: 'الإدارة المالية', sla_hours: 48 },
      { level: 3, approver_role: 'ceo', approver_role_ar: 'الرئيس التنفيذي (للمبالغ فوق 10,000 ر.س)', sla_hours: 72 }
    ]);

    // مسارات بوابة الموظف: الشكاوى والمقترحات وتوصيات تطوير سير العمل.
    const grievanceLevels = JSON.stringify([
      { level: 1, approver_role: 'hr_manager', approver_role_ar: 'مدير الموارد البشرية', sla_hours: 48 },
      { level: 2, approver_role: 'ceo', approver_role_ar: 'الرئيس التنفيذي', sla_hours: 72 }
    ]);

    const suggestionLevels = JSON.stringify([
      { level: 1, approver_role: 'hr_manager', approver_role_ar: 'مدير الموارد البشرية', sla_hours: 72 },
      { level: 2, approver_role: 'department_head', approver_role_ar: 'رئيس القسم المعني', sla_hours: 120 }
    ]);

    const improvementLevels = JSON.stringify([
      { level: 1, approver_role: 'hr_manager', approver_role_ar: 'مدير الموارد البشرية', sla_hours: 72 },
      { level: 2, approver_role: 'ceo', approver_role_ar: 'الرئيس التنفيذي', sla_hours: 168 }
    ]);

    await db.prepare(`
      INSERT INTO approval_workflows (workflow_type, title, description, conditions_json, levels_json, is_active)
      VALUES 
      ('loan_advance', 'مسار اعتماد السلف والقروض الشخصية', 'اعتماد متعدد المستويات للتحقق من الملاءة المالية والمسير', '{"min_amount": 1000}', ?, 1),
      ('leave_request', 'مسار اعتماد الإجازات السنوية والرسمية', 'موافقة المدير المباشر مع تسجيل رصيد الإجازات في شؤون الموظفين', '{}', ?, 1),
      ('expense_claim', 'مسار اعتماد العهد والمطالبات المالية', 'تدقيق الفواتير الضريبية وتوجيه المبالغ حسب الصلاحيات المالية', '{"min_amount": 500}', ?, 1)
    `).run(loanLevels, leaveLevels, expenseLevels);

    await db.prepare(`
      INSERT INTO approval_workflows (workflow_type, title, description, conditions_json, levels_json, is_active)
      VALUES 
      ('grievance', 'مسار فحص التظلمات الإدارية (المادة 209)', 'تشكيل لجنة الفحص ثم عرض القرار على صاحب الصلاحية', '{}', ?, 1),
      ('suggestion', 'مسار استقبال المقترحات وقياس أثرها', 'دراسة المقترح من الموارد البشرية ثم عرضه على صاحب القرار', '{}', ?, 1),
      ('process_improvement', 'مسار مقترحات تطوير الإجراءات وسير العمل', 'توصيات تطوير الإجراءات المعتمدة ومنهجية التنفيذ', '{}', ?, 1)
    `).run(grievanceLevels, suggestionLevels, improvementLevels);
  }
}

/**
 * Password seeded on first run so the operator can log in immediately.
 *
 * Deliberately a fixed, documented value rather than a generated one: this is
 * an on-premise appliance the installer has to reach, often with no mail
 * configured. The safety of a well-known default rests entirely on
 * must_change_password, which forces a change before anything else is usable —
 * see enforcePasswordChange below.
 */
/**
 * Bootstrap: create the default admin user if no users exist.
 *
 * The account is created with must_change_password = 1, so ADMIN123 cannot be
 * used past the login screen for longer than one session.
 */
export async function ensureBootstrapAdmin() {
  const userCount = await db.prepare("SELECT COUNT(*) as c FROM users").get() as any;
  if (userCount.c > 0) return;

  const entity = await db.prepare("SELECT id FROM entities ORDER BY id LIMIT 1").get() as any;

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  await db.prepare(`
    INSERT INTO users (username, password_hash, role, entity_id, status, must_change_password)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run("admin", passwordHash, "admin", entity?.id ?? null, "active");

  const credPath = path.join(process.cwd(), ".initial-admin-password.txt");
  fs.writeFileSync(
    credPath,
    [
      "admin / " + DEFAULT_ADMIN_PASSWORD,
      "",
      "IMPORTANT: this is the factory default. You will be forced to change it",
      "immediately after the first login. Do not deploy before doing so.",
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
  try { fs.chmodSync(credPath, 0o600); } catch {}
  log.info(
    `[bootstrap] لا يوجد مستخدمين — تم إنشاء admin بكلمة المرور الافتراضية ` +
      `(ADMIN123). يجب تغييرها فور أول تسجيل دخول. التفاصيل: ${credPath}`
  );
}

// Link existing users to employees (idempotent)
export async function linkUsersToEmployees() {
  // Default username -> employee name/ID mapping
  const userEmployeeMap: Record<string, { id?: number; name?: string }> = {
    'admin': { id: 1, name: 'Ahmed Test Edited' }, // First employee
    'hr': { name: 'Ahmed Test Edited' },
    'finance': { name: 'Ahmed Test Edited' },
    'branch_manager': { name: 'Test Employee' }, // Second employee
    'employee': { name: 'Test Employee' }, // ESS user gets the second employee
  };

  const users = await db.prepare("SELECT id, username, employee_id FROM users WHERE employee_id IS NULL").all() as any[];
  
  for (const user of users) {
    const mapping = userEmployeeMap[user.username];
    if (!mapping) continue;
    
    let employeeId = mapping.id;
    if (!employeeId && mapping.name) {
      const emp = await db.prepare("SELECT id FROM employees WHERE name = ?").get(mapping.name) as any;
      if (emp) employeeId = emp.id;
    }
    
    if (employeeId) {
      await db.prepare("UPDATE users SET employee_id = ? WHERE id = ?").run(employeeId, user.id);
      log.info(`[link] User ${user.username} linked to employee ${employeeId}`);
    }
  }
}
