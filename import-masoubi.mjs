import Database from "better-sqlite3";
import fs from "fs";

const seed = JSON.parse(fs.readFileSync("import-masoubi.json", "utf8"));
const db = new Database("payroll.db");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = OFF");

const WIPE = [
  "attendance", "attendance_logs", "loans", "employee_allowances", "bonuses_penalties",
  "leaves", "employee_documents", "employee_transfers", "employee_webauthn_credentials",
  "payroll", "additional_salaries", "payroll_corrections", "tax_exemptions",
  "salary_slips", "salary_slip_items", "ewa_withdrawals", "visas", "flight_tickets",
  "disciplinary_violations", "clearances", "employee_clearances", "work_injuries",
  "grievances", "employee_grievances", "warnings", "official_warnings", "hse_ppe_logs",
  "hse_inspections", "exit_interviews", "medical_policies", "medical_dependents",
  "fleet_vehicles", "fleet_traffic_fines", "traffic_fines", "talent_assessments",
  "talent_succession", "succession_plans", "workflow_requests", "checklist_items",
  "checklists", "projects", "tasks", "smart_assets", "asset_assignments", "kudos",
  "peer_kudos", "rewards_redemptions", "reward_redemptions", "survey_responses",
  "pulse_survey_results", "pulse_surveys", "alerts_expiries", "overtime",
  "overtime_records", "flexible_shifts", "flexible_work_shifts", "telework_permits",
  "approval_workflow_steps", "approval_requests", "approval_workflows",
  "hr_generated_letters", "documents", "assets", "appraisals",
  "tax_exemption_declarations", "expense_claims", "government_renewals",
  "promotions", "salary_certificates", "qiwa_contracts", "eos_calculations",
  "job_openings", "candidates", "recruitment_candidates", "recruitment_jobs",
  "department_budgets", "notifications", "audit_logs", "sessions", "users",
  "employees", "settings",
];

const parseQiwa = (r) => (r && r.match(/عقد قوى رقم:\s*(\d+)/) || [])[1] || null;
const parsePassport = (r) => (r && r.match(/الجواز:\s*(\d+)/) || [])[1] || null;

const importAll = db.transaction(() => {
  for (const t of WIPE) db.prepare("DELETE FROM \"" + t + "\"").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('employees','payroll','qiwa_contracts','users','audit_logs','notifications')").run();

  db.prepare("UPDATE entities SET name_ar=?, name_en=NULL, country_code='SA', currency='SAR', tax_rate=0, insurance_emp_rate=9.75, insurance_comp_rate=11.75, is_active=1 WHERE id=1")
    .run(seed.company.name);
  db.prepare("UPDATE branches SET name='فرع الدمام', name_en='Dammam Branch', location=? WHERE id=1")
    .run(seed.company.address);

  const insEmp = db.prepare(`INSERT INTO employees
    (name, position, job_title, basic_salary, housing_allowance, transport_allowance, other_allowances,
     nationality, is_saudi, national_id_iqama, iqama_expiry_gregorian, iqama_profession,
     saudi_iban, bank_name, contract_type, contract_start_date, passport_number,
     payment_method, country_code, entity_id, branch_id, department_id, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insQiwa = db.prepare(`INSERT INTO qiwa_contracts
    (employee_id, contract_number, job_title, work_location, start_date,
     basic_salary, housing_allowance, transport_allowance, other_allowances)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  let qiwaCount = 0;
  for (const e of seed.employees) {
    const saudi = e.nationality === "سعودي";
    const nid = saudi ? (e.nationalId || e.iqama || "") : (e.iqama || e.nationalId || "");
    const other = (Number(e.food) || 0) + (Number(e.otherAllow) || 0);
    const r = insEmp.run(
      e.name, e.position, e.position, Number(e.basic) || 0, Number(e.housing) || 0,
      Number(e.transport) || 0, other,
      e.nationality, saudi ? 1 : 0, nid || null, e.iqamaExpiry || null, e.position,
      e.iban || null, e.bankName || null, "fixed", e.hireDate || null, parsePassport(e.remarks),
      "bank", "SA", 1, 1, null, "active"
    );
    const qn = parseQiwa(e.remarks);
    if (qn) {
      insQiwa.run(r.lastInsertRowid, qn, e.position, "الدمام", e.hireDate || null,
        Number(e.basic) || 0, Number(e.housing) || 0, Number(e.transport) || 0, other);
      qiwaCount++;
    }
  }

  const up = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  up.run("org_name", seed.company.name);
  up.run("country", "Saudi Arabia");
  up.run("currency", "SAR");
  up.run("tax_rate", "0");

  // admin: keep login, detach from any employee record
  db.prepare("INSERT INTO users (username, password_hash, role, entity_id, employee_id, status, must_change_password) VALUES ('admin', (SELECT password_hash FROM \"payroll.backup-users\" WHERE username='admin'), 'admin', 1, NULL, 'active', 0)").run();
});

// preserve admin hash before wiping users
db.exec("CREATE TEMP TABLE \"payroll.backup-users\" AS SELECT username, password_hash FROM users WHERE username='admin'");
importAll();
db.pragma("foreign_keys = ON");

const c = (t) => db.prepare("SELECT COUNT(*) AS c FROM \"" + t + "\"").get().c;
console.log("employees:", c("employees"), "| qiwa_contracts:", c("qiwa_contracts"), "| users:", c("users"),
  "| payroll:", c("payroll"), "| audit_logs:", c("audit_logs"), "| sessions:", c("sessions"));
console.log("entity:", JSON.stringify(db.prepare("SELECT name_ar, currency, country_code FROM entities WHERE id=1").get()));
console.log("settings:", JSON.stringify(db.prepare("SELECT key, value FROM settings WHERE key IN ('org_name','country','currency','tax_rate')").all()));
const s = db.prepare("SELECT is_saudi, COUNT(*) AS n FROM employees GROUP BY is_saudi").all();
console.log("saudi split:", JSON.stringify(s));
const pos = db.prepare("SELECT COUNT(DISTINCT position) AS n FROM employees").get();
console.log("distinct positions:", pos.n);
db.close();
console.log("IMPORT OK");