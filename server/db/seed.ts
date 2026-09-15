import db from "../config/database";

// DDL + idempotent demo seeds for the modules that kept their schema inline after the
// route split: EWA (13), HSE (14), Exit Interviews (16), Approval Workflows (17).
// Kept out of the index entry so the server bootstrap stays a thin composition.
export function seedExtendedModules() {
  // ==========================================
  // MODULE 13: EARNED WAGE ACCESS (EWA سحب الراتب عند الطلب)
  // ==========================================
  db.exec(`
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

  // Seed sample EWA withdrawal if empty
  const checkEwa = db.prepare("SELECT COUNT(*) as count FROM ewa_withdrawals").get() as any;
  if (checkEwa.count === 0) {
    const emp1 = db.prepare("SELECT id FROM employees WHERE is_saudi = 1 LIMIT 1").get() as any;
    const emp2 = db.prepare("SELECT id FROM employees WHERE is_saudi = 0 LIMIT 1").get() as any;
    if (emp1) {
      db.prepare(`
        INSERT INTO ewa_withdrawals (employee_id, request_date, earned_salary_so_far, requested_amount, fee, net_disbursed, status, disbursement_method)
        VALUES (?, '2026-08-18', 8500, 2500, 15, 2485, 'paid', 'instant_iban')
      `).run(emp1.id);
    }
    if (emp2) {
      db.prepare(`
        INSERT INTO ewa_withdrawals (employee_id, request_date, earned_salary_so_far, requested_amount, fee, net_disbursed, status, disbursement_method)
        VALUES (?, '2026-08-22', 7200, 1800, 15, 1785, 'paid', 'instant_iban')
      `).run(emp2.id);
    }
  }

  // ==========================================
  // MODULE 14: HEALTH, SAFETY & ENVIRONMENT (HSE السلامة المهنية)
  // ==========================================
  db.exec(`
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

  // Seed sample HSE data
  const checkHse = db.prepare("SELECT COUNT(*) as count FROM hse_inspections").get() as any;
  if (checkHse.count === 0) {
    const b1 = db.prepare("SELECT id FROM branches LIMIT 1").get() as any;
    const bId = b1?.id || 1;

    db.prepare(`
      INSERT INTO hse_inspections (branch_id, inspector_name, inspection_date, category, status, score, findings, corrective_actions, deadline_date)
      VALUES 
      (?, 'م. تركي الغامدي (مسؤول السلامة المعتمد)', '2026-08-10', 'fire_safety', 'compliant', 98, 'فحص مطافئ الحريق وصناديق الخراطيم ومضخات الرش الآلي وجميعها مجددة ومعتمدة من الدفاع المدني', 'جدولة الفحص النصف سنوي القادم', '2027-02-10'),
      (?, 'م. تركي الغامدي', '2026-08-12', 'emergency_exits', 'needs_action', 85, 'وجود بعض الصناديق التي تعيق مسار مخرج الطوارئ الشرقي في مستودع الفرع الرئيسي', 'إزالة العوائق فوراً ووضع علامات أرضية فسفورية إرشادية مانعة للوقوف', '2026-08-30'),
      (?, 'م. تركي الغامدي', '2026-08-15', 'first_aid', 'compliant', 95, 'اكتمال حقائب الإسعافات الأولية مع وجود مسعفين أوليين حاصلين على دورة الهلال الأحمر السعودي', 'مراجعة تواريخ انتهاء الشاش والمطهرات', '2026-11-15')
    `).run(bId, bId, bId);

    const emps = db.prepare("SELECT id FROM employees LIMIT 3").all() as any[];
    emps.forEach((emp, idx) => {
      db.prepare(`
        INSERT INTO hse_ppe_logs (employee_id, item_name, item_type, issue_date, expiry_date, status, notes)
        VALUES 
        (?, 'خوذة أمان معتمدة ANSI Z89.1', 'helmet', '2026-01-15', '2028-01-14', 'active', 'مسلمة للعمل الميداني والتفتيش'),
        (?, 'حذاء سلامة مقاوم للانزلاق والصدمات S3', 'shoes', '2026-01-15', '2027-01-14', 'active', 'مطابق للمواصفات السعودية SASO')
      `).run(emp.id, emp.id);
    });
  }

  // ==========================================
  // MODULE 16: EXIT INTERVIEW & TURNOVER ANALYTICS (مقابلات الخروج)
  // ==========================================
  db.exec(`
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

  // Seed sample exit interviews
  const checkExits = db.prepare("SELECT COUNT(*) as count FROM exit_interviews").get() as any;
  if (checkExits.count === 0) {
    const emps = db.prepare("SELECT id, name FROM employees LIMIT 2").all() as any[];
    if (emps.length > 0) {
      db.prepare(`
        INSERT INTO exit_interviews (employee_id, departure_date, primary_reason, reason_details, manager_rating, culture_rating, benefits_rating, would_recommend_score, retention_feedback, estimated_replacement_cost, ai_sentiment)
        VALUES 
        (?, '2026-07-30', 'career_growth', 'الحصول على عرض وظيفي بمسمى قيادي أعلى وحزمة تدريبية أوسع في قطاع شبه حكومي', 4, 4, 3, 8, 'الشركة بيئتها ممتازة ولكن مسارات الترقية بطيئة بعض الشيء في القسم', 32000, 'positive'),
        (?, '2026-06-15', 'salary', 'فارق العرض المالي بنسبة 35% أعلى من الراتب الحالي بالسوق', 3, 4, 2, 7, 'ضرورة مراجعة سلالم الرواتب دورياً لمواكبة تسارع السوق السعودي ورؤية 2030', 28000, 'neutral')
      `).run(emps[0].id, emps[1] ? emps[1].id : emps[0].id);
    }
  }

  // ==========================================
  // MODULE 17: MULTI-LEVEL APPROVAL WORKFLOWS (مسارات الاعتماد)
  // ==========================================
  db.exec(`
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
  const checkWorkflows = db.prepare("SELECT COUNT(*) as count FROM approval_workflows").get() as any;
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

    db.prepare(`
      INSERT INTO approval_workflows (workflow_type, title, description, conditions_json, levels_json, is_active)
      VALUES 
      ('loan_advance', 'مسار اعتماد السلف والقروض الشخصية', 'اعتماد متعدد المستويات للتحقق من الملاءة المالية والمسير', '{"min_amount": 1000}', ?, 1),
      ('leave_request', 'مسار اعتماد الإجازات السنوية والرسمية', 'موافقة المدير المباشر مع تسجيل رصيد الإجازات في شؤون الموظفين', '{}', ?, 1),
      ('expense_claim', 'مسار اعتماد العهد والمطالبات المالية', 'تدقيق الفواتير الضريبية وتوجيه المبالغ حسب الصلاحيات المالية', '{"min_amount": 500}', ?, 1)
    `).run(loanLevels, leaveLevels, expenseLevels);

    // Seed sample approval request
    const w1 = db.prepare("SELECT id FROM approval_workflows LIMIT 1").get() as any;
    const emp1 = db.prepare("SELECT id FROM employees LIMIT 1").get() as any;
    if (w1 && emp1) {
      const history = JSON.stringify([
        { level: 1, actor_name: 'المدير المباشر (م. سامي)', action: 'approved', action_date: '2026-08-24 10:30', comments: 'معتمد ومطابق لجدول المهام' }
      ]);
      db.prepare(`
        INSERT INTO approval_requests (workflow_id, requester_id, request_type, request_title, amount, details, current_level, max_levels, status, approval_history_json)
        VALUES (?, ?, 'loan_advance', 'طلب سلفة زواج / مستعجلة', 8000, 'طلب سلفة شخصية تسدد على 10 أقساط شهرية', 2, 3, 'pending', ?)
      `).run(w1.id, emp1.id, history);
    }
  }
}