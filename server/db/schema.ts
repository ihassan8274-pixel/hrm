import db from "../config/database";

export function initializeDatabase() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('org_name', 'مؤسسة الرواتب العالمية');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('country', 'Egypt');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'EGP');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '10');

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_by TEXT DEFAULT 'User',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    country_code TEXT NOT NULL,
    currency TEXT NOT NULL,
    tax_rate REAL DEFAULT 0,
    insurance_emp_rate REAL DEFAULT 0,
    insurance_comp_rate REAL DEFAULT 0,
    settings_json TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    entity_id INTEGER,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities (id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    route_pattern TEXT NOT NULL,
    method TEXT NOT NULL,
    allowed INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    currency TEXT NOT NULL,
    currency_symbol_ar TEXT,
    currency_symbol_en TEXT,
    insurance_type TEXT,
    insurance_emp_rate REAL DEFAULT 0,
    insurance_comp_rate REAL DEFAULT 0,
    insurance_ceiling REAL,
    insurance_floor REAL,
    tax_type TEXT DEFAULT 'none',
    eos_type TEXT,
    eos_months_per_year REAL DEFAULT 0.5,
    eos_max_years INTEGER,
    annual_leave_days INTEGER DEFAULT 21,
    sick_leave_days INTEGER DEFAULT 0,
    maternity_leave_days INTEGER DEFAULT 0,
    paternity_leave_days INTEGER DEFAULT 0,
    working_hours_per_day REAL DEFAULT 8,
    working_days_per_week INTEGER DEFAULT 6,
    weekend_days_json TEXT,
    wps_format TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    country_code TEXT NOT NULL,
    currency TEXT NOT NULL,
    tax_rate REAL DEFAULT 0,
    insurance_emp_rate REAL DEFAULT 0,
    insurance_comp_rate REAL DEFAULT 0,
    settings_json TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (country_code) REFERENCES countries (code)
  );

  -- EAV rule-item table. Kept separate from the flat country_rules definition below
  -- so both schemas can coexist without the first CREATE TABLE silently winning.
  CREATE TABLE IF NOT EXISTS country_rule_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT NOT NULL,
    rule_type TEXT NOT NULL, -- 'insurance', 'tax', 'eos', 'leaves', 'worktime', 'wps'
    rule_key TEXT NOT NULL,
    rule_value TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (country_code) REFERENCES countries (code)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    month INTEGER,
    year INTEGER,
    absence_days INTEGER DEFAULT 0,
    overtime_hours INTEGER DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    total_amount REAL,
    remaining_amount REAL,
    monthly_installment REAL,
    status TEXT DEFAULT 'active', -- active, completed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    manager_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bonuses_penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    type TEXT, -- 'bonus' or 'penalty'
    amount REAL,
    reason TEXT,
    month INTEGER,
    year INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS job_openings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    department_id INTEGER,
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments (id)
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'applied', -- 'applied', 'interview', 'offered', 'hired', 'rejected'
    cv_url TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES job_openings (id)
  );

  CREATE TABLE IF NOT EXISTS expense_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    amount REAL,
    category TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    old_position TEXT,
    new_position TEXT,
    old_salary REAL,
    new_salary REAL,
    promotion_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT
  );

  INSERT OR IGNORE INTO policies (key, value) VALUES ('working_hours', '8');
  INSERT OR IGNORE INTO policies (key, value) VALUES ('weekend_days', 'Friday,Saturday');
  INSERT OR IGNORE INTO policies (key, value) VALUES ('overtime_rate', '1.5');

  CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    item_name TEXT,
    is_completed INTEGER DEFAULT 0,
    type TEXT, -- 'onboarding', 'offboarding'
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS employee_skills (
    employee_id INTEGER,
    skill_id INTEGER,
    level INTEGER, -- 1 to 5
    PRIMARY KEY (employee_id, skill_id),
    FOREIGN KEY (employee_id) REFERENCES employees (id),
    FOREIGN KEY (skill_id) REFERENCES skills (id)
  );

  CREATE TABLE IF NOT EXISTS training_courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    date DATE
  );

  CREATE TABLE IF NOT EXISTS employee_training (
    employee_id INTEGER,
    course_id INTEGER,
    status TEXT DEFAULT 'enrolled', -- 'enrolled', 'completed'
    PRIMARY KEY (employee_id, course_id),
    FOREIGN KEY (employee_id) REFERENCES employees (id),
    FOREIGN KEY (course_id) REFERENCES training_courses (id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    department_id INTEGER,
    status TEXT DEFAULT 'active', -- 'active', 'completed', 'on_hold'
    start_date DATE,
    end_date DATE,
    FOREIGN KEY (department_id) REFERENCES departments (id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    employee_id INTEGER,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
    due_date DATE,
    FOREIGN KEY (project_id) REFERENCES projects (id),
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    type TEXT, -- 'annual', 'sick', 'unpaid', 'emergency'
    start_date DATE,
    end_date DATE,
    days INTEGER,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    is_paid INTEGER DEFAULT 1, -- 1 for paid, 0 for unpaid
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    name TEXT,
    type TEXT,
    expiry_date DATE,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT,
    serial_number TEXT,
    assigned_to INTEGER,
    assigned_at DATETIME,
    status TEXT DEFAULT 'available', -- 'available', 'assigned', 'maintenance'
    FOREIGN KEY (assigned_to) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS appraisals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    rating INTEGER, -- 1 to 5
    comments TEXT,
    period TEXT, -- 'Q1', 'Q2', 'Annual', etc.
    appraisal_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    message TEXT,
    type TEXT, -- 'success', 'error', 'warning'
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT
  );

  CREATE TABLE IF NOT EXISTS allowance_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER,
    name TEXT NOT NULL,
    position TEXT,
    basic_salary REAL DEFAULT 0,
    deductions REAL DEFAULT 0,
    department_id INTEGER,
    job_title TEXT,
    insurance_number TEXT,
    bank_account TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches (id)
  );

  CREATE TABLE IF NOT EXISTS employee_allowances (
    employee_id INTEGER,
    allowance_type_id INTEGER,
    amount REAL DEFAULT 0,
    PRIMARY KEY (employee_id, allowance_type_id),
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (allowance_type_id) REFERENCES allowance_types (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payroll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    month INTEGER,
    year INTEGER,
    basic_salary REAL,
    allowances REAL,
    deductions REAL,
    tax_amount REAL DEFAULT 0,
    net_salary REAL,
    insurance_emp_share REAL DEFAULT 0,
    insurance_comp_share REAL DEFAULT 0,
    bonuses REAL DEFAULT 0,
    penalties REAL DEFAULT 0,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS government_renewals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    type TEXT, -- 'iqama', 'work_permit', 'medical_insurance', 'exit_reentry'
    duration_months INTEGER DEFAULT 12,
    cost REAL DEFAULT 0,
    status TEXT DEFAULT 'completed', -- 'pending', 'paid', 'completed', 'cancelled'
    sadad_number TEXT,
    reference_number TEXT,
    expiry_before DATE,
    expiry_after DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS eos_calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    employee_name TEXT,
    national_id_iqama TEXT,
    start_date DATE,
    end_date DATE,
    basic_salary REAL,
    allowances REAL,
    total_salary REAL,
    reason TEXT,
    reason_text TEXT,
    total_service_years REAL,
    entitlement_percentage REAL,
    final_amount REAL,
    leave_balance_compensation REAL DEFAULT 0,
    other_entitlements REAL DEFAULT 0,
    deductions REAL DEFAULT 0,
    net_payable REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS visas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    visa_type TEXT, -- 'exit_reentry_single', 'exit_reentry_multiple', 'final_exit', 'work_visa'
    visa_number TEXT,
    issue_date DATE,
    travel_before_date DATE,
    duration_days INTEGER DEFAULT 60,
    return_before_date DATE,
    cost REAL DEFAULT 200,
    status TEXT DEFAULT 'active', -- 'active', 'used', 'expired', 'cancelled'
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flight_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    destination TEXT,
    trip_type TEXT DEFAULT 'round_trip', -- 'round_trip', 'one_way'
    departure_date DATE,
    return_date DATE,
    cost REAL DEFAULT 2500,
    allowance_type TEXT DEFAULT 'ticket_issued', -- 'ticket_issued', 'cash_allowance'
    dependents_included INTEGER DEFAULT 0,
    status TEXT DEFAULT 'approved', -- 'pending', 'approved', 'issued', 'rejected'
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS salary_certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    certificate_number TEXT UNIQUE,
    addressed_to TEXT,
    purpose TEXT DEFAULT 'general', -- 'bank_loan', 'credit_card', 'embassy_visa', 'real_estate_rental', 'government_agency', 'general'
    include_allowances INTEGER DEFAULT 1,
    include_bank_iban INTEGER DEFAULT 1,
    qr_verification_code TEXT,
    issue_date DATE,
    valid_until DATE,
    status TEXT DEFAULT 'issued',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS overtime_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    date DATE,
    normal_hours REAL DEFAULT 0,
    weekend_hours REAL DEFAULT 0,
    holiday_hours REAL DEFAULT 0,
    hourly_rate REAL DEFAULT 0,
    total_overtime_pay REAL DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'processed'
    reason TEXT,
    month INTEGER,
    year INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS leave_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    year INTEGER,
    annual_entitlement_days INTEGER DEFAULT 21,
    carry_forward_days INTEGER DEFAULT 0,
    taken_days INTEGER DEFAULT 0,
    remaining_days INTEGER DEFAULT 21,
    encashed_days INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS qiwa_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    contract_number TEXT UNIQUE,
    contract_type TEXT DEFAULT 'fixed_term', -- 'fixed_term', 'indefinite', 'flexible', 'remote', 'part_time'
    job_title TEXT,
    work_location TEXT DEFAULT 'الرياض',
    start_date DATE,
    end_date DATE,
    probation_days INTEGER DEFAULT 90,
    notice_period_days INTEGER DEFAULT 60,
    basic_salary REAL DEFAULT 0,
    housing_allowance REAL DEFAULT 0,
    transport_allowance REAL DEFAULT 0,
    other_allowances REAL DEFAULT 0,
    weekly_working_hours REAL DEFAULT 48,
    annual_leave_days INTEGER DEFAULT 21,
    auto_renew INTEGER DEFAULT 1,
    qiwa_status TEXT DEFAULT 'authenticated', -- 'authenticated', 'pending_approval', 'draft', 'expired', 'terminated'
    qiwa_reference TEXT,
    clauses_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS disciplinary_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    incident_date DATE,
    category TEXT, -- 'attendance_absence', 'delay_departure', 'insubordination', 'negligence', 'behavioral_ethics', 'safety_breach', 'art80_gross_misconduct'
    description TEXT,
    investigation_date DATE,
    investigator_name TEXT,
    employee_statement TEXT,
    committee_decision TEXT,
    penalty_level TEXT, -- 'verbal_notice', 'written_warning_1', 'written_warning_2', 'salary_deduction_1day', 'salary_deduction_3days', 'suspension_5days', 'termination_art80'
    deduction_days INTEGER DEFAULT 0,
    deduction_amount REAL DEFAULT 0,
    payroll_applied INTEGER DEFAULT 0,
    status TEXT DEFAULT 'approved', -- 'under_investigation', 'approved', 'appealed', 'closed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS employee_clearances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    request_date DATE,
    last_working_day DATE,
    reason TEXT, -- 'resignation', 'contract_end', 'art77_termination', 'art80_termination', 'retirement'
    it_status TEXT DEFAULT 'pending', -- 'pending', 'cleared'
    it_notes TEXT,
    it_cleared_by TEXT,
    finance_status TEXT DEFAULT 'pending',
    finance_loans_settled INTEGER DEFAULT 1,
    finance_custody_settled INTEGER DEFAULT 1,
    finance_notes TEXT,
    operations_status TEXT DEFAULT 'pending',
    operations_assets_returned INTEGER DEFAULT 1,
    operations_notes TEXT,
    hr_status TEXT DEFAULT 'pending',
    hr_medical_cancelled INTEGER DEFAULT 1,
    hr_gosi_deregistered INTEGER DEFAULT 1,
    hr_service_cert_issued INTEGER DEFAULT 1,
    overall_status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'rejected'
    final_settlement_amount REAL DEFAULT 0,
    clearance_slip_number TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS work_injuries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    incident_date DATE,
    incident_time TEXT DEFAULT '09:00',
    location_type TEXT DEFAULT 'workplace', -- 'workplace', 'work_trip', 'commuting_traffic'
    injury_type TEXT,
    severity TEXT DEFAULT 'minor', -- 'minor', 'moderate', 'severe', 'fatal'
    description TEXT,
    hospital_name TEXT,
    sick_leave_days INTEGER DEFAULT 0,
    gosi_reported INTEGER DEFAULT 1,
    gosi_report_date DATE,
    gosi_claim_number TEXT,
    daily_allowance_rate REAL DEFAULT 0,
    total_compensation_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'reported', -- 'reported', 'gosi_approved', 'under_treatment', 'closed'
    preventive_actions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hr_generated_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    letter_id TEXT UNIQUE,
    employee_id INTEGER,
    letter_type TEXT,
    title TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS medical_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_number TEXT UNIQUE,
    insurance_company TEXT,
    start_date DATE,
    expiry_date DATE,
    total_members INTEGER DEFAULT 0,
    total_premium REAL DEFAULT 0,
    cchi_approval_number TEXT,
    status TEXT DEFAULT 'active' -- 'active', 'expiring_soon', 'expired'
  );

  CREATE TABLE IF NOT EXISTS medical_dependents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    name TEXT NOT NULL,
    relationship TEXT DEFAULT 'spouse', -- 'spouse', 'son', 'daughter', 'parent'
    national_id_iqama TEXT,
    birth_date DATE,
    gender TEXT DEFAULT 'male',
    category TEXT DEFAULT 'Class A', -- 'VIP', 'Class A', 'Class B', 'Class C'
    card_number TEXT,
    annual_premium REAL DEFAULT 2500,
    status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'pending'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS insurance_endorsements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    type TEXT DEFAULT 'addition', -- 'addition', 'deletion', 'upgrade'
    endorsement_date DATE,
    premium_adjustment REAL DEFAULT 0,
    cchi_reference TEXT,
    status TEXT DEFAULT 'processed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS talent_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER UNIQUE,
    performance_score INTEGER DEFAULT 2, -- 1, 2, 3
    potential_score INTEGER DEFAULT 2, -- 1, 2, 3
    box_category TEXT DEFAULT 'core_player',
    key_strengths TEXT,
    development_needs TEXT,
    readiness_timeline TEXT DEFAULT 'ready_1_year',
    assessed_by TEXT DEFAULT 'لجنة الموارد البشرية',
    assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS succession_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    critical_role_title TEXT NOT NULL,
    department_id INTEGER,
    current_holder_id INTEGER,
    risk_level TEXT DEFAULT 'high', -- 'critical', 'high', 'medium'
    primary_successor_id INTEGER,
    secondary_successor_id INTEGER,
    readiness_status TEXT DEFAULT 'in_development', -- 'ready_now', 'in_development', 'no_successor'
    development_action_plan TEXT,
    is_saudization_target INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments (id),
    FOREIGN KEY (current_holder_id) REFERENCES employees (id),
    FOREIGN KEY (primary_successor_id) REFERENCES employees (id),
    FOREIGN KEY (secondary_successor_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS fleet_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT UNIQUE,
    make_model TEXT NOT NULL,
    year INTEGER DEFAULT 2024,
    vin_number TEXT,
    assigned_employee_id INTEGER,
    assignment_date DATE,
    istimara_expiry DATE,
    insurance_expiry DATE,
    periodic_inspection_expiry DATE,
    status TEXT DEFAULT 'assigned', -- 'assigned', 'available', 'maintenance', 'impounded'
    current_odometer INTEGER DEFAULT 0,
    fuel_card_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_employee_id) REFERENCES employees (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS traffic_fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    employee_id INTEGER,
    fine_number TEXT UNIQUE,
    violation_type TEXT,
    amount REAL DEFAULT 300,
    fine_date DATE,
    deducted_from_payroll INTEGER DEFAULT 0,
    payroll_month INTEGER,
    payroll_year INTEGER,
    status TEXT DEFAULT 'pending', -- 'pending', 'deducted', 'waived'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicles (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flexible_work_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    date DATE,
    hours_worked REAL DEFAULT 4,
    hourly_rate REAL DEFAULT 40,
    total_pay REAL DEFAULT 160,
    mowaamah_hours_accumulated REAL DEFAULT 4,
    qiwa_contract_ref TEXT,
    supervisor_approved INTEGER DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS telework_permits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    permit_type TEXT DEFAULT 'hybrid', -- 'full_time_remote', 'hybrid', 'temporary'
    remote_days_per_week INTEGER DEFAULT 2,
    contract_start DATE,
    contract_end DATE,
    telework_platform_registered INTEGER DEFAULT 1,
    productivity_score REAL DEFAULT 95,
    status TEXT DEFAULT 'active', -- 'active', 'pending_approval', 'suspended'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS employee_grievances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT UNIQUE,
    employee_id INTEGER,
    category TEXT DEFAULT 'work_environment', -- 'work_environment', 'appraisal_dispute', 'harassment_mistreatment', 'unpaid_dues', 'transfer_demotion', 'other'
    subject TEXT NOT NULL,
    details TEXT NOT NULL,
    is_confidential INTEGER DEFAULT 1,
    against_person TEXT,
    status TEXT DEFAULT 'submitted', -- 'submitted', 'under_review', 'committee_assigned', 'hearing_scheduled', 'resolved', 'rejected'
    committee_notes TEXT,
    resolution_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hearing_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grievance_id INTEGER,
    session_title TEXT NOT NULL,
    session_date DATE NOT NULL,
    location TEXT DEFAULT 'غرفة التحقيقات الإدارية والامتثال',
    committee_chair TEXT NOT NULL,
    hr_representative TEXT NOT NULL,
    legal_counsel TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    witnesses TEXT,
    statements_minutes TEXT NOT NULL,
    committee_verdict TEXT NOT NULL,
    recommended_sanction TEXT DEFAULT 'none', -- 'none', 'written_notice', 'first_warning', 'second_warning', 'final_warning', 'salary_deduction', 'termination_art80'
    deduction_days INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed', -- 'scheduled', 'completed', 'adjourned'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (grievance_id) REFERENCES employee_grievances (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS official_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_number TEXT UNIQUE,
    employee_id INTEGER,
    warning_type TEXT NOT NULL, -- 'attention_notice', 'first_warning', 'second_warning', 'final_warning', 'salary_deduction'
    violation_clause TEXT NOT NULL,
    violation_date DATE NOT NULL,
    investigation_ref TEXT,
    penalty_details TEXT NOT NULL,
    deduction_amount REAL DEFAULT 0,
    issued_by TEXT NOT NULL,
    issue_date DATE NOT NULL,
    acknowledgement_status TEXT DEFAULT 'acknowledged', -- 'acknowledged', 'refused_to_sign', 'pending'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS department_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER,
    fiscal_year INTEGER DEFAULT 2026,
    allocated_salaries REAL DEFAULT 0,
    allocated_gosi REAL DEFAULT 0,
    allocated_medical REAL DEFAULT 0,
    allocated_work_permits REAL DEFAULT 0,
    allocated_flight_tickets REAL DEFAULT 0,
    allocated_end_of_service REAL DEFAULT 0,
    allocated_training_rewards REAL DEFAULT 0,
    total_allocated REAL DEFAULT 0,
    actual_spent REAL DEFAULT 0,
    headcount_cap INTEGER DEFAULT 10,
    FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS peer_kudos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    sender_name TEXT NOT NULL,
    recipient_id INTEGER,
    recipient_name TEXT NOT NULL,
    recipient_job TEXT,
    core_value TEXT DEFAULT 'teamwork', -- 'teamwork', 'innovation', 'customer_delight', 'safety_first', 'leadership', 'excellence'
    message TEXT NOT NULL,
    points_awarded INTEGER DEFAULT 50,
    likes_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reward_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'gift_card', -- 'gift_card', 'extra_leave', 'fuel_card', 'wellness', 'tech'
    points_required INTEGER DEFAULT 500,
    stock_quantity INTEGER DEFAULT 50,
    icon_name TEXT DEFAULT 'Gift',
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS reward_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    employee_name TEXT NOT NULL,
    reward_id INTEGER,
    reward_title TEXT NOT NULL,
    points_spent INTEGER NOT NULL,
    redemption_code TEXT UNIQUE,
    status TEXT DEFAULT 'approved', -- 'approved', 'delivered', 'pending'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (reward_id) REFERENCES reward_catalog (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pulse_survey_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    score_percentage REAL DEFAULT 85,
    respondents_count INTEGER DEFAULT 45,
    sentiment TEXT DEFAULT 'positive'
  );

  CREATE TABLE IF NOT EXISTS smart_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_code TEXT UNIQUE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'laptop', -- 'laptop', 'smartphone', 'tablet', 'fuel_card', 'access_key', 'vehicle', 'specialized_tool'
    brand_model TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    purchase_date DATE,
    purchase_value REAL DEFAULT 0,
    current_assigned_to INTEGER,
    assigned_date DATE,
    handover_qr_code TEXT,
    condition TEXT DEFAULT 'good', -- 'new', 'good', 'fair', 'needs_maintenance'
    status TEXT DEFAULT 'assigned', -- 'assigned', 'in_stock', 'maintenance', 'scrapped'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_assigned_to) REFERENCES employees (id) ON DELETE SET NULL
  );


  INSERT OR IGNORE INTO settings (key, value) VALUES ('country', 'المملكة العربية السعودية');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'SAR');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '0');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('cr_number', '1010789456');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('unified_number_700', '7001984523');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('mol_establishment_id', '12-987456');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('gosi_establishment_id', '409823451');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('cchi_policy_number', 'CCHI-SA-98214');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('saudi_gosi_emp_rate', '9.75');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('saudi_gosi_comp_rate', '11.75');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('expat_gosi_comp_rate', '2.0');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('work_permit_annual_fee', '9600');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('iqama_renewal_fee', '650');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('ramadan_mode', 'false');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('ramadan_working_hours', '6');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('standard_working_hours', '8');
`);

  // Add missing columns if they don't exist (for existing databases)
  const empCols = [
    "department_id INTEGER",
    "job_title TEXT",
    "insurance_number TEXT",
    "bank_account TEXT",
    "entity_id INTEGER",
    "nationality TEXT DEFAULT 'سعودي'",
    "is_saudi INTEGER DEFAULT 1",
    "national_id_iqama TEXT",
    "border_number TEXT",
    "iqama_expiry_gregorian DATE",
    "iqama_expiry_hijri TEXT",
    "iqama_profession TEXT",
    "work_permit_number TEXT",
    "work_permit_expiry DATE",
    "work_permit_fee REAL DEFAULT 9600",
    "gosi_number TEXT",
    "gosi_registered_salary REAL DEFAULT 0",
    "housing_allowance REAL DEFAULT 0",
    "transport_allowance REAL DEFAULT 0",
    "other_allowances REAL DEFAULT 0",
    "insurance_company TEXT DEFAULT 'التعاونية للتأمين'",
    "medical_insurance_category TEXT DEFAULT 'Class A'",
    "medical_insurance_policy TEXT",
    "medical_insurance_expiry DATE",
    "medical_dependents_count INTEGER DEFAULT 0",
    "saudi_iban TEXT",
    "bank_name TEXT DEFAULT 'مصرف الراجحي'",
    "contract_type TEXT DEFAULT 'fixed'",
    "contract_start_date DATE",
    "contract_end_date DATE",
    "passport_number TEXT",
    "passport_expiry DATE",
    "health_cert_number TEXT",
    "health_cert_expiry DATE",
    "payment_method TEXT DEFAULT 'bank'",
    "cash_percentage REAL DEFAULT 0",
    "face_template TEXT"
  ];

  for (const col of empCols) {
    try { db.prepare(`ALTER TABLE employees ADD COLUMN ${col}`).run(); } catch(e) {}
  }

  const payCols = [
    "insurance_emp_share REAL DEFAULT 0",
    "insurance_comp_share REAL DEFAULT 0",
    "bonuses REAL DEFAULT 0",
    "penalties REAL DEFAULT 0",
    "national_id_iqama TEXT",
    "is_saudi INTEGER DEFAULT 1",
    "housing_allowance REAL DEFAULT 0",
    "transport_allowance REAL DEFAULT 0",
    "gosi_number TEXT",
    "gosi_salary REAL DEFAULT 0",
    "saudi_iban TEXT",
    "bank_name TEXT"
  ];

  for (const col of payCols) {
    try { db.prepare(`ALTER TABLE payroll ADD COLUMN ${col}`).run(); } catch(e) {}
  }

  try { db.prepare(`ALTER TABLE payroll ADD COLUMN payment_method TEXT DEFAULT 'bank'`).run(); } catch(e) {}
  try { db.prepare(`ALTER TABLE payroll ADD COLUMN cash_amount REAL DEFAULT 0`).run(); } catch(e) {}
  try { db.prepare(`ALTER TABLE payroll ADD COLUMN bank_amount REAL DEFAULT 0`).run(); } catch(e) {}

  // ---- New feature migrations: branches geo + new tables ----
  const branchCols = [
    "latitude REAL",
    "longitude REAL",
    "geofence_radius_m INTEGER DEFAULT 200",
    "work_start_time TEXT DEFAULT '08:00'",
    "work_end_time TEXT DEFAULT '17:00'"
  ];
  for (const col of branchCols) {
    try { db.prepare(`ALTER TABLE branches ADD COLUMN ${col}`).run(); } catch(e) {}
  }
  try { db.prepare(`ALTER TABLE attendance_devices ADD COLUMN bound_fingerprint TEXT`).run(); } catch(e) {}
  try { db.prepare(`ALTER TABLE attendance_devices ADD COLUMN pairing_pin TEXT`).run(); } catch(e) {}
  try { db.prepare(`ALTER TABLE attendance_devices ADD COLUMN phone_bound INTEGER DEFAULT 0`).run(); } catch(e) {}
  try { db.prepare(`ALTER TABLE attendance_devices ADD COLUMN bound_at TEXT`).run(); } catch(e) {}

  db.exec(`
  CREATE TABLE IF NOT EXISTS attendance_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    device_name TEXT,
    device_token TEXT UNIQUE,
    last_latitude REAL,
    last_longitude REAL,
    last_verified_at DATETIME,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    device_id INTEGER,
    check_in_time DATETIME,
    check_out_time DATETIME,
    check_in_lat REAL,
    check_in_lng REAL,
    check_out_lat REAL,
    check_out_lng REAL,
    method TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'present',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches (id),
    FOREIGN KEY (device_id) REFERENCES attendance_devices (id)
  );

  CREATE TABLE IF NOT EXISTS kiosk_security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER,
    reason TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employee_webauthn_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    credential_id TEXT UNIQUE NOT NULL,
    method TEXT DEFAULT 'face',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS employee_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    doc_type TEXT,
    doc_number TEXT,
    issue_date DATE,
    expiry_date DATE,
    file_path TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS employee_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    from_branch_id INTEGER,
    to_branch_id INTEGER NOT NULL,
    effective_date DATE,
    reason TEXT,
    created_by TEXT DEFAULT 'User',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (from_branch_id) REFERENCES branches (id),
    FOREIGN KEY (to_branch_id) REFERENCES branches (id)
  );

  CREATE TABLE IF NOT EXISTS country_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT UNIQUE NOT NULL,
    country_name TEXT NOT NULL,
    currency TEXT DEFAULT 'SAR',
    insurance_emp_rate REAL DEFAULT 0,
    insurance_comp_rate REAL DEFAULT 0,
    tax_type TEXT DEFAULT 'none',
    eosb_months_per_year REAL DEFAULT 0.5,
    annual_leave_days INTEGER DEFAULT 21,
    working_hours INTEGER DEFAULT 8,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS tax_brackets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT NOT NULL,
    lower_bound REAL NOT NULL,
    upper_bound REAL,
    rate REAL NOT NULL,
    FOREIGN KEY (country_code) REFERENCES country_rules (country_code)
  );
`);

  // Seed country payroll rules (approximate standard rates, editable)
  // Defensive: if an older database still carries an incompatible country_rules
  // schema (e.g. the EAV layout), log an actionable warning instead of aborting boot.
  const seedCountries = [
    ['SA', 'السعودية', 'SAR', 9.75, 11.75, 'none', 0.5, 21, 8, 'GOSI: معاشات وساند وأخطار مهنية'],
    ['EG', 'مصر', 'EGP', 11, 18.75, 'progressive', 1, 21, 8, 'هيئة التأمينات الاجتماعية + ضريبة تصاعدية'],
    ['AE', 'الإمارات', 'AED', 0, 0, 'none', 0.7, 30, 8, 'WPS + نهاية خدمة 21-30 يوم/سنة'],
    ['JO', 'الأردن', 'JOD', 7.5, 11, 'progressive', 0.75, 14, 8, 'الضمان الاجتماعي + ضريبة تصاعدية'],
    ['BH', 'البحرين', 'BHD', 7, 12, 'none', 1, 30, 8, 'التأمين الاجتماعي LMRA'],
    ['KW', 'الكويت', 'KWD', 8, 12, 'none', 1, 30, 8, 'التأمينات الاجتماعية PAM']
  ];
  try {
    for (const c of seedCountries) {
      db.prepare(`INSERT OR IGNORE INTO country_rules (country_code, country_name, currency, insurance_emp_rate, insurance_comp_rate, tax_type, eosb_months_per_year, annual_leave_days, working_hours, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...c);
    }
  } catch (e) {
    console.warn(
      "[country_rules] تعذّر إدخال قواعد الدول الافتراضية: " + (e as Error).message +
      " — تحقّق من أن جدول country_rules يطابق التعريف المسطّح (country_code, country_name, currency, insurance_emp_rate, insurance_comp_rate, tax_type, eosb_months_per_year, annual_leave_days, working_hours, notes)." +
      " القواعد المخصّصة تُخزَّن في country_rule_items. لن يتوقف تشغيل الوحدة."
    );
  }

  // Seed tax brackets (progressive) for Egypt & Jordan (approximate)
  // Self-healing tax_brackets: the table carried no UNIQUE constraint, so "INSERT OR IGNORE"
  // had nothing to ignore and every boot appended a fresh copy of all 12 bracket definitions
  // (the live database reached 444 rows for 12 definitions = 432 duplicates). Collapse the
  // historical duplicates once, then lock the table so it can never grow that way again.
  try {
    const rowsBefore = (db.prepare("SELECT COUNT(*) AS c FROM tax_brackets").get() as any).c;
    const distinctDefs = (db.prepare("SELECT COUNT(*) AS c FROM (SELECT DISTINCT country_code, lower_bound, upper_bound, rate FROM tax_brackets)").get() as any).c;
    if (rowsBefore > distinctDefs) {
      // One transaction; grouped on every data column (id excluded) keeping the smallest id,
      // so no information is lost — only exact duplicate rows disappear.
      const removed = db.transaction(() => db.prepare(`
        DELETE FROM tax_brackets
        WHERE id NOT IN (
          SELECT MIN(id) FROM tax_brackets
          GROUP BY country_code, lower_bound, upper_bound, rate
        )
      `).run().changes)();
      const rowsAfter = (db.prepare("SELECT COUNT(*) AS c FROM tax_brackets").get() as any).c;
      console.log(`[tax_brackets] تنظيف التكرارات: ${rowsBefore} → ${rowsAfter} صفًا (حُذف ${removed} صفًا مكرّرًا، التعريفات المميّزة ${distinctDefs}).`);
    }
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_brackets_definition ON tax_brackets (country_code, lower_bound, upper_bound, rate)");
  } catch (e) {
    console.warn(
      "[tax_brackets] تعذّر تنظيف التكرارات أو إنشاء الفهرس الفريد: " + (e as Error).message + " — لن يتوقف تشغيل الوحدة."
    );
  }

  const seedBrackets = [
    ['EG', 0, 15000, 0], ['EG', 15000, 30000, 0.025], ['EG', 30000, 45000, 0.10], ['EG', 45000, 60000, 0.15], ['EG', 60000, 200000, 0.20], ['EG', 200000, 400000, 0.225], ['EG', 400000, null, 0.25],
    ['JO', 0, 5000, 0], ['JO', 5000, 10000, 0.05], ['JO', 10000, 15000, 0.10], ['JO', 15000, 20000, 0.15], ['JO', 20000, null, 0.20]
  ];
  try {
    // Idempotent seed: insert a bracket definition only when it is not stored yet. "INSERT OR
    // IGNORE" could not express this — upper_bound is NULL for the top bracket and SQLite treats
    // NULLs as distinct in UNIQUE indexes, so an explicit EXISTS guard is required.
    const insertBracket = db.prepare(`
      INSERT INTO tax_brackets (country_code, lower_bound, upper_bound, rate)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM tax_brackets
        WHERE country_code = ? AND lower_bound = ? AND upper_bound IS ? AND rate = ?
      )
    `);
    for (const b of seedBrackets) {
      insertBracket.run(b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
    }
  } catch (e) {
    console.warn(
      "[tax_brackets] تعذّر إدخال شرائح الضريبة الافتراضية: " + (e as Error).message +
      " — جدول tax_brackets مرتبط بمفتاح أجنبي إلى country_rules(country_code)، لذا يجب أن يبقى country_rules بالتعريف المسطّح مع UNIQUE على country_code. لن يتوقف تشغيل الوحدة."
    );
  }

  try { db.prepare(`ALTER TABLE employees ADD COLUMN country_code TEXT DEFAULT 'SA'`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE payroll ADD COLUMN country_code TEXT DEFAULT 'SA'`).run(); } catch (e) {}

  // Seed initial Saudi sample employees if employees table is empty and demo not cleared
  const checkEmps = db.prepare("SELECT COUNT(*) as count FROM employees").get() as any;
  const demoSeeded = (db.prepare("SELECT value FROM settings WHERE key = 'demo_seeded'").get() as any)?.value;
  if (checkEmps.count === 0 && demoSeeded !== 'done') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_seeded', 'done')").run();
    // Create default branches
    const b1 = db.prepare("INSERT INTO branches (name, location) VALUES (?, ?)").run("الفرع الرئيسي - الرياض", "طريق الملك فهد، الرياض").lastInsertRowid;
    const b2 = db.prepare("INSERT INTO branches (name, location) VALUES (?, ?)").run("فرع المنطقة الغربية - جدة", "طريق الأندلس، جدة").lastInsertRowid;
    const b3 = db.prepare("INSERT INTO branches (name, location) VALUES (?, ?)").run("فرع المنطقة الشرقية - الخبر", "طريق الأمير تركي، الخبر").lastInsertRowid;

    // Create default departments
    const d1 = db.prepare("INSERT INTO departments (name) VALUES (?)").run("الموارد البشرية والشؤون الحكومية").lastInsertRowid;
    const d2 = db.prepare("INSERT INTO departments (name) VALUES (?)").run("الإدارة المالية والمحاسبة").lastInsertRowid;
    const d3 = db.prepare("INSERT INTO departments (name) VALUES (?)").run("تقنية المعلومات والبرمجيات").lastInsertRowid;
    const d4 = db.prepare("INSERT INTO departments (name) VALUES (?)").run("المبيعات والتسويق").lastInsertRowid;

    // Create standard allowance types
    const at1 = db.prepare("INSERT INTO allowance_types (name) VALUES (?)").run("بدل سكن").lastInsertRowid;
    const at2 = db.prepare("INSERT INTO allowance_types (name) VALUES (?)").run("بدل نقل").lastInsertRowid;
    const at3 = db.prepare("INSERT INTO allowance_types (name) VALUES (?)").run("بدل طبيعة عمل / هاتف").lastInsertRowid;

    // Insert Saudi employees
    const insertEmp = db.prepare(`
      INSERT INTO employees (
        branch_id, department_id, name, position, job_title, basic_salary, deductions,
        nationality, is_saudi, national_id_iqama, border_number, iqama_expiry_gregorian, iqama_expiry_hijri,
        iqama_profession, work_permit_number, work_permit_expiry, work_permit_fee,
        gosi_number, gosi_registered_salary, housing_allowance, transport_allowance, other_allowances,
        insurance_company, medical_insurance_category, medical_insurance_policy, medical_insurance_expiry,
        medical_dependents_count, saudi_iban, bank_name, contract_type, contract_start_date, contract_end_date
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    // 1. Saudi HR Director
    insertEmp.run(
      b1, d1, "عبد الله بن فهد السبيعي", "مدير الموارد البشرية والشؤون الحكومية", "مدير عام الموارد البشرية", 15000, 0,
      "سعودي", 1, "1089456123", "", "2030-05-14", "1451-11-28",
      "مدير موارد بشرية", "", "", 0,
      "10928374", 18750, 3750, 1000, 500,
      "بوبا العربية", "VIP", "BUPA-SA-90112", "2027-04-15",
      3, "SA0380000000608010123456", "مصرف الراجحي", "unlimited", "2020-01-01", "2030-01-01"
    );

    // 2. Saudi Senior Accountant
    insertEmp.run(
      b1, d2, "سارة بنت خالد العتيبي", "أخصائية أولى محاسبة ومالية", "محاسب أول", 11000, 0,
      "سعودي", 1, "1074125896", "", "2029-08-20", "1451-03-10",
      "محاسب مالي", "", "", 0,
      "20847193", 13750, 2750, 800, 300,
      "التعاونية للتأمين", "Class A", "TAW-CORP-45812", "2027-02-28",
      1, "SA4410000001234567890123", "البنك الأهلي السعودي SNB", "fixed", "2022-03-15", "2027-03-14"
    );

    // 3. Expat Senior Full-Stack Engineer (Iqama expiring in 25 days to demonstrate alerts!)
    const exp1Expiry = new Date();
    exp1Expiry.setDate(exp1Expiry.getDate() + 25);
    const exp1Str = exp1Expiry.toISOString().split('T')[0];

    insertEmp.run(
      b1, d3, "أحمد محمود عبد الرحمن", "مهندس برمجيات ونظم أول", "مهندس حاسب آلي", 12500, 0,
      "مصري", 0, "2458963214", "309812456", exp1Str, "1448-03-18",
      "مهندس برمجيات", "WP-2025-9841", exp1Str, 9600,
      "30847192", 15625, 3125, 1000, 400,
      "بوبا العربية", "Class A", "BUPA-SA-90112", exp1Str,
      2, "SA5520000009876543210987", "بنك الرياض", "fixed", "2021-06-01", "2027-05-31"
    );

    // 4. Expat Sales Executive (Iqama expiring in 50 days)
    const exp2Expiry = new Date();
    exp2Expiry.setDate(exp2Expiry.getDate() + 50);
    const exp2Str = exp2Expiry.toISOString().split('T')[0];

    insertEmp.run(
      b2, d4, "محمد طارق الشامي", "مدير مبيعات المنطقة الغربية", "أخصائي تسويق", 9000, 0,
      "أردني", 0, "2389451207", "308741529", exp2Str, "1448-04-12",
      "مندوب مبيعات", "WP-2025-4421", exp2Str, 9600,
      "40982317", 11250, 2250, 750, 500,
      "ميدغلف للتأمين", "Class B", "MED-POL-7712", exp2Str,
      1, "SA8830000004561237894561", "مصرف الإنماء", "fixed", "2023-01-10", "2027-01-09"
    );

    // 5. Expat Network Specialist (Iqama valid for 8 months)
    const exp3Expiry = new Date();
    exp3Expiry.setMonth(exp3Expiry.getMonth() + 8);
    const exp3Str = exp3Expiry.toISOString().split('T')[0];

    insertEmp.run(
      b3, d3, "سلمان خان شمس الدين", "أخصائي شبكات ودعم فني", "فني شبكات حاسب", 7500, 0,
      "باكستاني", 0, "2514789632", "307123984", exp3Str, "1448-11-05",
      "فني اتصالات", "WP-2026-1190", exp3Str, 9600,
      "50912478", 9375, 1875, 600, 200,
      "تكافل الراجحي", "Class B", "RAJ-TAK-6623", exp3Str,
      0, "SA7750000001122334455667", "بنك البلاد", "fixed", "2024-02-01", "2027-01-31"
    );

    // Seed sample renewals
    db.prepare(`
      INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, notes)
      VALUES (3, 'iqama', 12, 10250, 'completed', '982341901', 'MOI-992348', 'تجديد الإقامة ورخصة العمل لمدة سنة كاملة')
    `).run();
  }

  // Refresh employee count used by the health-check guards below (the demo block above may have inserted them).
  checkEmps.count = (db.prepare("SELECT COUNT(*) as count FROM employees").get() as any).count;

  // Seed Medical Policies & Dependents
  const checkMedPol = db.prepare("SELECT COUNT(*) as count FROM medical_policies").get() as any;
  if (checkMedPol.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO medical_policies (policy_number, insurance_company, start_date, expiry_date, total_members, total_premium, cchi_approval_number, status)
        VALUES 
        ('CCHI-TAW-2026-01', 'التعاونية للتأمين', '2026-01-01', '2026-12-31', 18, 48500, 'CCHI-APP-884920', 'active'),
        ('CCHI-BUPA-2026-02', 'بوبا العربية', '2026-03-01', '2027-02-28', 12, 36000, 'CCHI-APP-991204', 'active')
      `).run();

      db.prepare(`
        INSERT INTO medical_dependents (employee_id, name, relationship, national_id_iqama, birth_date, gender, category, card_number, annual_premium, status)
        VALUES 
        (1, 'سارة خالد المنصور', 'spouse', '1098234112', '1992-05-14', 'female', 'VIP', 'MED-VIP-001', 3200, 'active'),
        (1, 'فيصل محمد العتيبي', 'son', '1182390192', '2018-09-20', 'male', 'VIP', 'MED-VIP-002', 1900, 'active'),
        (2, 'فاطمة أحمد الغامدي', 'spouse', '1076239102', '1995-11-03', 'female', 'Class A', 'MED-A-010', 2500, 'active'),
        (3, 'زينب سلمان خان', 'spouse', '2491209341', '1994-02-18', 'female', 'Class B', 'MED-B-022', 2100, 'active')
      `).run();
    } catch(e) {
      console.error("Error seeding medical:", e);
    }
  }

  // Seed Talent Assessments & Succession
  const checkTalent = db.prepare("SELECT COUNT(*) as count FROM talent_assessments").get() as any;
  if (checkTalent.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO talent_assessments (employee_id, performance_score, potential_score, box_category, key_strengths, development_needs, readiness_timeline, assessed_by)
        VALUES 
        (1, 3, 3, 'star', 'قيادة فرق العمل، إدارة الامتثال السعودي، تطوير الاستراتيجيات', 'مهارات التفاوض على مستوى مجالس الإدارة', 'ready_now', 'اللجنة التنفيذية'),
        (2, 3, 2, 'high_performer', 'دقة المحاسبة والتقارير المالية IFRS، إتقان ملفات الزكاة والضريبة', 'التخطيط المالي الاستراتيجي طويل المدى', 'ready_1_year', 'مدير عام المالية'),
        (3, 2, 2, 'core_player', 'دعم البنية التحتية واستقرار الشبكات', 'شهادات الحوسبة السحابية والأمن السيبراني', 'ready_1_year', 'مدير تقنية المعلومات')
      `).run();

      db.prepare(`
        INSERT INTO succession_plans (critical_role_title, department_id, current_holder_id, risk_level, primary_successor_id, readiness_status, development_action_plan, is_saudization_target)
        VALUES 
        ('مدير الموارد البشرية والشؤون الحكومية', 1, 1, 'critical', 2, 'ready_now', 'برنامج القيادة التنفيذية واجتياز شهادة CIPD المستوى السابع', 1),
        ('رئيس الحسابات والامتثال المالي', 2, 2, 'high', 1, 'in_development', 'برنامج التحليل المالي المتقدم وإعداد الموازنات الاستثمارية', 1)
      `).run();
    } catch(e) {
      console.error("Error seeding talent:", e);
    }
  }

  // Seed Fleet Vehicles & Traffic Fines
  const checkFleet = db.prepare("SELECT COUNT(*) as count FROM fleet_vehicles").get() as any;
  if (checkFleet.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO fleet_vehicles (plate_number, make_model, year, vin_number, assigned_employee_id, assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry, status, current_odometer, fuel_card_number)
        VALUES 
        ('أ ب ج 1024', 'تويوتا كامري GLX', 2024, '4T1B11HK5JU102948', 1, '2024-01-15', '2027-01-14', '2026-12-30', '2026-11-15', 'assigned', 34200, 'PETRO-SA-9901'),
        ('د هـ و 5590', 'هيونداي إلنترا Smart', 2023, 'KMHD84LF5NU881029', 2, '2024-03-01', '2026-09-20', '2026-09-15', '2026-08-30', 'assigned', 51400, 'PETRO-SA-9902'),
        ('ر ز س 7741', 'فورد توروس Titanium', 2024, '1FA6P8CF8R5102941', NULL, NULL, '2027-05-10', '2027-04-25', '2027-04-01', 'available', 12300, 'PETRO-SA-9903')
      `).run();

      db.prepare(`
        INSERT INTO traffic_fines (vehicle_id, employee_id, fine_number, violation_type, amount, fine_date, deducted_from_payroll, status)
        VALUES 
        (1, 1, 'FINE-99823410', 'تجاوز السرعة المحددة (ساهر)', 300, '2026-08-10', 0, 'pending'),
        (2, 2, 'FINE-88192044', 'عدم ربط حزام الأمان', 150, '2026-07-22', 1, 'deducted')
      `).run();
    } catch(e) {
      console.error("Error seeding fleet:", e);
    }
  }

  // Seed Flexible & Telework
  const checkFlex = db.prepare("SELECT COUNT(*) as count FROM telework_permits").get() as any;
  if (checkFlex.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO telework_permits (employee_id, permit_type, remote_days_per_week, contract_start, contract_end, telework_platform_registered, productivity_score, status)
        VALUES 
        (1, 'hybrid', 2, '2026-01-01', '2026-12-31', 1, 98.5, 'active'),
        (2, 'hybrid', 1, '2026-01-01', '2026-12-31', 1, 96.0, 'active'),
        (3, 'full_time_remote', 5, '2026-02-01', '2027-01-31', 1, 94.2, 'active')
      `).run();

      db.prepare(`
        INSERT INTO flexible_work_shifts (employee_id, date, hours_worked, hourly_rate, total_pay, mowaamah_hours_accumulated, qiwa_contract_ref, supervisor_approved, notes)
        VALUES 
        (1, '2026-08-20', 6, 50, 300, 6, 'QW-FLX-2026-01', 1, 'إنجاز مراجعة لوائح العمل والامتثال'),
        (2, '2026-08-21', 4, 45, 180, 4, 'QW-FLX-2026-02', 1, 'إعداد كشوفات التسوية البنكية'),
        (3, '2026-08-22', 8, 40, 320, 8, 'QW-FLX-2026-03', 1, 'صيانة الخوادم والنسخ الاحتياطي')
      `).run();
    } catch(e) {
      console.error("Error seeding flex/telework:", e);
    }
  }

  // Seed Initial Notifications
  const checkNotifs = db.prepare("SELECT COUNT(*) as count FROM notifications").get() as any;
  if (checkNotifs.count === 0) {
    try {
      db.prepare(`
        INSERT INTO notifications (title, message, type, is_read)
        VALUES 
        ('تنبيه تجديد إقامة', 'إقامة المهندس أحمد محمود عبد الرحمن تنتهي خلال 25 يوماً. يرجى المبادرة بالتجديد وسداد رخصة العمل عبر مقيم.', 'warning', 0),
        ('اعتماد مسير الرواتب وحماية الأجور', 'تم تدقيق ملف حماية الأجور (WPS SIF) بنجاح وجاهز للمطابقة عبر منصة مدد.', 'success', 0),
        ('مؤشر التوطين ونطاقات', 'المنشأة مصنفة في النطاق الأخضر المرتفع / البلاتيني بنسبة توطين تفوق المستهدف النظامي.', 'info', 0),
        ('طلب سحب راتب على المكشوف', 'تم تقديم طلب جديد لسحب جزء من الراتب المستحق (EWA) بقيمة 2,500 ر.س وهو قيد المراجعة.', 'info', 0)
      `).run();
    } catch (e) {
      console.error("Error seeding notifications:", e);
    }
  }

  // Seed Grievances & Hearings
  const checkGriev = db.prepare("SELECT COUNT(*) as count FROM employee_grievances").get() as any;
  if (checkGriev.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO employee_grievances (ticket_number, employee_id, category, subject, details, is_confidential, against_person, status, committee_notes, resolution_summary)
        VALUES 
        ('GRV-2026-001', 3, 'appraisal_dispute', 'اعتراض على درجة تقييم الأداء السنوي للأهداف البرمجية', 'أرى أن تقييم الربع الثاني لم يعكس إنجاز تسليم نظام حماية الأجور ومطابقة منصة مدد قبل الموعد النهائي.', 1, 'مدير الإدارة التقنية', 'resolved', 'تمت مراجعة مخرجات Git ومحاضر التسليم وثبت استحقاق ترقية درجة الكفاءة.', 'تعديل التقييم السنوي إلى ممتاز وإدراج مكافأة إنجاز استثنائية.'),
        ('GRV-2026-002', 4, 'work_environment', 'طلب توفير تجهيزات مكتبية مريحة وبيئة عمل هادئة لفرع جدة', 'الحاجة لتحديث كراسي العمل وتوفير شاشات إضافية لفريق المبيعات للمساعدة في العروض التقديمية.', 0, 'إدارة الخدمات المساندة', 'under_review', 'تم فحص الموقع وتعميد شراء 5 شاشات تفاعلية وكراسي طبية معتمدة.', NULL)
      `).run();

      db.prepare(`
        INSERT INTO hearing_sessions (grievance_id, session_title, session_date, location, committee_chair, hr_representative, legal_counsel, employee_name, witnesses, statements_minutes, committee_verdict, recommended_sanction, deduction_days, status)
        VALUES 
        (1, 'جلسة مراجعة تظلم التقييم السنوي للأداء', '2026-08-15', 'قاعة الاجتماعات الرئيسية - الدور الرابع', 'عبد الله بن فهد السبيعي', 'سارة بنت خالد العتيبي', 'المستشار القانوني للمنشأة', 'أحمد محمود عبد الرحمن', 'مهندس النظم، مدير المشاريع', 'تم الاستماع لأقوال الموظف ومناقشة المعايير وتدقيق وثائق الإنجاز التقنية.', 'ثبوت صحة ادعاء الموظف وإعادة احتساب نقاط التقييم.', 'none', 0, 'completed')
      `).run();

      db.prepare(`
        INSERT INTO official_warnings (notice_number, employee_id, warning_type, violation_clause, violation_date, investigation_ref, penalty_details, deduction_amount, issued_by, issue_date, acknowledgement_status)
        VALUES 
        ('WRN-2026-089', 5, 'attention_notice', 'المادة (12) من لائحة تنظيم العمل المعتمدة: التأخر الصباحي غير المبرر لأكثر من 3 مرات في الشهر', '2026-08-10', 'INV-2026-04', 'لفت نظر خطي مع التنبيه بضرورة الالتزام بالمواعيد الرسمية المحددة في العقد.', 0, 'عبد الله بن فهد السبيعي - مدير الموارد البشرية', '2026-08-12', 'acknowledged')
      `).run();
    } catch (e) {
      console.error("Error seeding grievances:", e);
    }
  }

  // Seed Department Budgets
  const checkBudgets = db.prepare("SELECT COUNT(*) as count FROM department_budgets").get() as any;
  if (checkBudgets.count === 0) {
    try {
      db.prepare(`
        INSERT INTO department_budgets (department_id, fiscal_year, allocated_salaries, allocated_gosi, allocated_medical, allocated_work_permits, allocated_flight_tickets, allocated_end_of_service, allocated_training_rewards, total_allocated, actual_spent, headcount_cap)
        VALUES 
        (1, 2026, 360000, 42300, 24000, 0, 10000, 30000, 20000, 486300, 298000, 4),
        (2, 2026, 420000, 49350, 28000, 9600, 12000, 35000, 25000, 578950, 345000, 5),
        (3, 2026, 680000, 52000, 45000, 28800, 36000, 56000, 40000, 937800, 580000, 8),
        (4, 2026, 480000, 38000, 32000, 19200, 24000, 40000, 35000, 668200, 410000, 6)
      `).run();
    } catch (e) {
      console.error("Error seeding budgets:", e);
    }
  }

  // Seed Peer Kudos & Rewards Catalog
  const checkKudos = db.prepare("SELECT COUNT(*) as count FROM peer_kudos").get() as any;
  if (checkKudos.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO peer_kudos (sender_id, sender_name, recipient_id, recipient_name, recipient_job, core_value, message, points_awarded, likes_count)
        VALUES 
        (1, 'عبد الله بن فهد السبيعي', 3, 'أحمد محمود عبد الرحمن', 'مهندس برمجيات أول', 'innovation', 'شكراً لك على العمل الدؤوب والمتميز في بناء محرك شهادات الرواتب وربطه بنظام حماية الأجور بكفاءة استثنائية!', 100, 12),
        (2, 'سارة بنت خالد العتيبي', 1, 'عبد الله بن فهد السبيعي', 'مدير الموارد البشرية', 'leadership', 'قيادة نموذجية وتوجيه مستمر لفريق العمل في إدارة ملف التدقيق السنوي والامتثال.', 75, 8),
        (3, 'أحمد محمود عبد الرحمن', 2, 'سارة بنت خالد العتيبي', 'أخصائية مالية ومحاسبة', 'teamwork', 'دقة متميزة في تدقيق مخصصات نهاية الخدمة والمطابقات البنكية الشهرية.', 50, 6)
      `).run();

      db.prepare(`
        INSERT INTO reward_catalog (title, description, category, points_required, stock_quantity, icon_name)
        VALUES 
        ('بطاقة شراء مكتبة جرير بقيمة 300 ر.س', 'قسيمة رقمية فورية صالحة لكافة فروع جرير والمتجر الإلكتروني.', 'gift_card', 300, 25, 'ShoppingBag'),
        ('يوم إجازة مرن إضافي مدفوع الأجر', 'يوم راحة إضافي يُضاف لرصيدك ويُستخدم في أي وقت بالتنسيق مع مديرك المباشر.', 'extra_leave', 600, 15, 'Calendar'),
        ('بطاقة وقود بترومين / الدريس بقيمة 200 ر.س', 'قسيمة وقود رقمية قابلة للاستخدام في كافة المحطات المعتمدة بالمملكة.', 'fuel_card', 250, 40, 'Fuel'),
        ('اشتراك نادي رياضي (Fitness Time) لمدة شهر', 'عضوية لياقة بدنية شهرية مدعومة من برنامج العافية المؤسسية.', 'wellness', 800, 10, 'Activity'),
        ('سماعات لاسلكية عازلة للضوضاء (Sony/Apple)', 'هدية تقنية عينية تسلّم من إدارة الموارد البشرية تكريماً للأداء الاستثنائي.', 'tech', 1500, 5, 'Headphones')
      `).run();

      db.prepare(`
        INSERT INTO reward_redemptions (employee_id, employee_name, reward_id, reward_title, points_spent, redemption_code, status)
        VALUES 
        (3, 'أحمد محمود عبد الرحمن', 1, 'بطاقة شراء مكتبة جرير بقيمة 300 ر.س', 300, 'JARIR-RWD-88910', 'delivered'),
        (2, 'سارة بنت خالد العتيبي', 3, 'بطاقة وقود بترومين / الدريس بقيمة 200 ر.س', 250, 'FUEL-KUD-44102', 'approved')
      `).run();

      db.prepare(`
        INSERT INTO pulse_survey_results (category, score_percentage, respondents_count, sentiment)
        VALUES 
        ('البيئة العامة وثقافة العمل', 92.4, 48, 'positive'),
        ('القيادة والتواصل الداخلي', 88.0, 48, 'positive'),
        ('التوازن بين العمل والحياة', 85.5, 48, 'positive'),
        ('فرص النمو والتطوير الوظيفي', 81.2, 48, 'positive'),
        ('العدالة والتعويضات والمزايا', 79.8, 48, 'neutral')
      `).run();
    } catch (e) {
      console.error("Error seeding kudos:", e);
    }
  }

  // Seed Smart Assets
  const checkAssets = db.prepare("SELECT COUNT(*) as count FROM smart_assets").get() as any;
  if (checkAssets.count === 0 && checkEmps.count > 0) {
    try {
      db.prepare(`
        INSERT INTO smart_assets (asset_code, name, category, brand_model, serial_number, purchase_date, purchase_value, current_assigned_to, assigned_date, handover_qr_code, condition, status)
        VALUES 
        ('AST-LP-001', 'حاسب محمول مخصص للتطوير', 'laptop', 'MacBook Pro 16" M3 Max', 'C02G9981MD6R', '2024-03-01', 14500, 3, '2024-03-05', 'QR-AST-LP-001-EMP3', 'good', 'assigned'),
        ('AST-LP-002', 'حاسب محمول مالي ومكتبي', 'laptop', 'Dell Latitude 7440 Core i7', 'DL-88192044-K', '2024-01-10', 5800, 2, '2024-01-15', 'QR-AST-LP-002-EMP2', 'good', 'assigned'),
        ('AST-MO-001', 'هاتف أعمال ذكي للتواصل الحكومي', 'smartphone', 'iPhone 15 Pro 256GB', 'DNPL982410M8', '2023-11-20', 4700, 1, '2023-11-25', 'QR-AST-MO-001-EMP1', 'good', 'assigned'),
        ('AST-FC-001', 'بطاقة وقود ذكية للمركبات الرسمية', 'fuel_card', 'Petromin Fleet SmartCard', 'PETRO-7788-9900', '2024-01-01', 500, 1, '2024-01-01', 'QR-AST-FC-001-EMP1', 'good', 'assigned'),
        ('AST-LP-003', 'حاسب محمول للمبيعات المتنقلة', 'laptop', 'Lenovo ThinkPad T14s', 'LN-991204-TX', '2024-02-15', 5200, 4, '2024-02-20', 'QR-AST-LP-003-EMP4', 'good', 'assigned'),
        ('AST-LP-004', 'حاسب محمول احتياطي بالمستودع', 'laptop', 'HP EliteBook 840 G10', 'HP-3310984-SA', '2024-05-10', 4900, NULL, NULL, 'QR-AST-LP-004-STOCK', 'new', 'in_stock')
      `).run();
    } catch (e) {
      console.error("Error seeding smart assets:", e);
    }
  }
}