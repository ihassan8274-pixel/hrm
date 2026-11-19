// Schema column reconciliation.
//
// Migration 004 created `work_injuries` with a minimal generic shape
// (injury_date / location / body_part / cause / compensation_amount) while the
// Work Injuries feature — compliance routes and UI — reads and writes a richer,
// GOSI-oriented one. On an existing database every write therefore threw.
//
// SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so missing columns
// must be probed and added individually. That requires PRAGMA inspection, which
// cannot be expressed in a plain .sql migration, so it lives here instead.
//
// Exported as a function over a db handle (rather than closing over the app's
// connection) so it can be tested against an in-memory database.

/** Columns the application expects, per table, with their SQL definitions. */
export const COLUMN_RECONCILIATION: Record<string, Record<string, string>> = {
  // ربط طلب الاعتماد بالسجل الأصلي (سلفة/إجازة/تظلم/مقترح).
  approval_requests: {
    entity_type: 'TEXT',
    entity_id: 'INTEGER',
  },
  work_injuries: {
    incident_date: 'DATE',
    incident_time: 'TEXT',
    location_type: "TEXT DEFAULT 'workplace'",
    injury_type: 'TEXT',
    injury_nature: 'TEXT',
    hospital_name: 'TEXT',
    sick_leave_days: 'INTEGER DEFAULT 0',
    gosi_reported: 'INTEGER DEFAULT 0',
    gosi_report_date: 'DATE',
    gosi_claim_number: 'TEXT',
    daily_allowance_rate: 'REAL DEFAULT 0',
    total_compensation_amount: 'REAL DEFAULT 0',
    preventive_actions: 'TEXT',
  },
  // --- Write-path columns missing from the schema (generated + verified) ---
  //
  // Produced by scripts/generate-additional-columns.cjs, which rewrites every
  // INSERT column list into a SELECT and lets SQLite resolve each name. The
  // SELECT drift test cannot see these: SELECT * resolves no columns.
  // Each one caused a 500 on every write to that endpoint.
  salary_slips: {
    period_start: 'TEXT',
    period_end: 'TEXT',
    ytd_gross: 'REAL DEFAULT 0',
    ytd_taxable: 'REAL DEFAULT 0',
    ytd_tax_paid: 'REAL DEFAULT 0',
    mtd_gross: 'REAL DEFAULT 0',
    currency: 'TEXT',
    exchange_rate: 'REAL DEFAULT 1',
    calculation_details_json: 'TEXT',
    tax_breakup_json: 'TEXT',
    calculated_by: 'TEXT',
    calculated_at: 'TEXT',
    allocated_salaries: 'REAL DEFAULT 0',
    notes: 'TEXT',
  },
  flight_tickets: {
    destination: 'TEXT',
    trip_type: 'TEXT',
    departure_date: 'TEXT',
    return_date: 'TEXT',
    allowance_type: 'TEXT',
    dependents_included: 'INTEGER DEFAULT 0',
    notes: 'TEXT',
  },
  disciplinary_violations: {
    category: 'TEXT',
    investigation_date: 'TEXT',
    investigator_name: 'TEXT',
    employee_statement: 'TEXT',
    committee_decision: 'TEXT',
    penalty_level: 'TEXT',
    deduction_days: 'INTEGER DEFAULT 0',
    deduction_amount: 'REAL DEFAULT 0',
    payroll_applied: 'INTEGER DEFAULT 0',
  },
  medical_dependents: {
    relationship: 'TEXT',
    birth_date: 'TEXT',
    category: 'TEXT',
    card_number: 'TEXT',
    national_id_iqama: 'TEXT',
    employee_id: 'INTEGER',
    status: "TEXT DEFAULT 'active'",
    annual_premium: 'REAL DEFAULT 0',
  },
  medical_policies: {
    start_date: 'TEXT',
    expiry_date: 'TEXT',
    total_members: 'INTEGER DEFAULT 0',
    total_premium: 'REAL DEFAULT 0',
    cchi_approval_number: 'TEXT',
  },
  fleet_vehicles: {
    istimara_expiry: 'TEXT',
    periodic_inspection_expiry: 'TEXT',
    make_model: 'TEXT',
    vin_number: 'TEXT',
    assignment_date: 'TEXT',
    current_odometer: 'REAL DEFAULT 0',
    fuel_card_number: 'TEXT',
  },
  employee_clearances: {
    request_date: 'TEXT',
    last_working_day: 'TEXT',
    reason: 'TEXT',
    overall_status: "TEXT DEFAULT 'in_progress'",
  },
  additional_salaries: {
    component: 'TEXT',
    created_by: 'TEXT',
  },
  payroll_corrections: {
    field: 'TEXT',
    corrected_by: 'TEXT',
  },
  government_renewals: {
    type: 'TEXT',
    duration_months: 'INTEGER DEFAULT 0',
    sadad_number: 'TEXT',
    reference_number: 'TEXT',
    expiry_before: 'TEXT',
    expiry_after: 'TEXT',
    notes: 'TEXT',
  },
  eos_calculations: {
    employee_name: 'TEXT',
    national_id_iqama: 'TEXT',
    start_date: 'TEXT',
    end_date: 'TEXT',
    total_salary: 'REAL DEFAULT 0',
    basic_salary: 'REAL DEFAULT 0',
    allowances: 'REAL DEFAULT 0',
    total_service_years: 'REAL DEFAULT 0',
    entitlement_percentage: 'REAL DEFAULT 0',
    final_amount: 'REAL DEFAULT 0',
    net_payable: 'REAL DEFAULT 0',
    other_entitlements: 'REAL DEFAULT 0',
    leave_balance_compensation: 'REAL DEFAULT 0',
    reason: 'TEXT',
    reason_text: 'TEXT',
  },
  checklists: {
    item_name: 'TEXT',
    item_type: 'TEXT',
    type: 'TEXT',
    is_completed: 'INTEGER DEFAULT 0',
  },
  tasks: {
    employee_id: 'INTEGER',
  },
  // Readiness timeline of the 9-box talent matrix: the assessment screen
  // collects it, but the table had no column for it, so the value was dropped
  // on write and the screen always showed the default.
  talent_assessments: {
    readiness: 'TEXT',
  },
};

/**
 * Backfills the new columns from the legacy 004 columns so historical rows keep
 * their data instead of rendering blank.
 *
 * The CASE on total_compensation_amount is load-bearing: newly added columns
 * carry DEFAULT 0 rather than NULL, so a plain COALESCE would keep the default
 * and silently discard the legacy amount.
 */
const BACKFILL: Record<string, string> = {
  work_injuries: `
    UPDATE work_injuries
       SET incident_date = COALESCE(incident_date, injury_date),
           incident_time = COALESCE(incident_time, injury_time),
           location_type = COALESCE(NULLIF(location_type, ''), 'workplace'),
           injury_type   = COALESCE(NULLIF(injury_type, ''), NULLIF(body_part, ''), cause),
           total_compensation_amount = CASE
             WHEN COALESCE(total_compensation_amount, 0) > 0 THEN total_compensation_amount
             ELSE COALESCE(compensation_amount, 0)
           END
  `,
};

/** Indexes created once the columns are guaranteed to exist. */
const INDEXES: Record<string, string[]> = {
  work_injuries: [
    'CREATE INDEX IF NOT EXISTS idx_work_injuries_status ON work_injuries(status)',
    'CREATE INDEX IF NOT EXISTS idx_work_injuries_date ON work_injuries(incident_date)',
  ],
  employee_grievances: [
    'CREATE INDEX IF NOT EXISTS idx_employee_grievances_status ON employee_grievances(status)',
    'CREATE INDEX IF NOT EXISTS idx_employee_grievances_employee ON employee_grievances(employee_id)',
  ],
  hearing_sessions: [
    'CREATE INDEX IF NOT EXISTS idx_hearing_sessions_grievance ON hearing_sessions(grievance_id)',
  ],
  official_warnings: [
    'CREATE INDEX IF NOT EXISTS idx_official_warnings_employee ON official_warnings(employee_id)',
  ],
  hr_generated_letters: [
    'CREATE INDEX IF NOT EXISTS idx_hr_generated_letters_employee ON hr_generated_letters(employee_id)',
  ],
  documents: [
    'CREATE INDEX IF NOT EXISTS idx_documents_employee ON documents(employee_id)',
    'CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date)',
  ],
  assets: [
    'CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets(assigned_to)',
  ],
  appraisals: [
    'CREATE INDEX IF NOT EXISTS idx_appraisals_employee ON appraisals(employee_id)',
  ],
  promotions: [
    'CREATE INDEX IF NOT EXISTS idx_promotions_employee ON promotions(employee_id)',
  ],
  job_openings: [
    'CREATE INDEX IF NOT EXISTS idx_job_openings_dept ON job_openings(department_id)',
  ],
  candidates: [
    'CREATE INDEX IF NOT EXISTS idx_candidates_job ON candidates(job_id)',
  ],
  tax_exemption_declarations: [
    'CREATE INDEX IF NOT EXISTS idx_tax_exemptions_employee ON tax_exemption_declarations(employee_id)',
  ],
  expense_claims: [
    'CREATE INDEX IF NOT EXISTS idx_expense_claims_employee ON expense_claims(employee_id)',
  ],
  overtime_records: [
    'CREATE INDEX IF NOT EXISTS idx_overtime_records_employee ON overtime_records(employee_id)',
  ],
  department_budgets: [
    'CREATE INDEX IF NOT EXISTS idx_department_budgets_year ON department_budgets(year)',
  ],
  employee_clearances: [
    'CREATE INDEX IF NOT EXISTS idx_employee_clearances_employee ON employee_clearances(employee_id)',
  ],
  government_renewals: [
    'CREATE INDEX IF NOT EXISTS idx_government_renewals_employee ON government_renewals(employee_id)',
  ],
  salary_certificates: [
    'CREATE INDEX IF NOT EXISTS idx_salary_certificates_employee ON salary_certificates(employee_id)',
  ],
  qiwa_contracts: [
    'CREATE INDEX IF NOT EXISTS idx_qiwa_contracts_employee ON qiwa_contracts(employee_id)',
  ],
  traffic_fines: [
    'CREATE INDEX IF NOT EXISTS idx_traffic_fines_vehicle ON traffic_fines(vehicle_id)',
  ],
  flexible_work_shifts: [
    'CREATE INDEX IF NOT EXISTS idx_flexible_work_shifts_employee ON flexible_work_shifts(employee_id)',
  ],
  succession_plans: [
    'CREATE INDEX IF NOT EXISTS idx_succession_plans_position ON succession_plans(position_id)',
  ],
  peer_kudos: [
    'CREATE INDEX IF NOT EXISTS idx_peer_kudos_created ON peer_kudos(created_at)',
  ],
  reward_redemptions: [
    'CREATE INDEX IF NOT EXISTS idx_reward_redemptions_employee ON reward_redemptions(employee_id)',
  ],
};

/**
 * Tables the application queries that no migration ever created.
 *
 * The compliance routes and src/types.ts both describe a Labour Law Article 209
 * grievance flow (ticketed grievances, investigation hearings with committee
 * findings, formal written warnings), but the migration files only defined
 * shorter, differently-named `grievances` / `hearings` / `warnings` tables with
 * an unrelated column set. Every /api/grievances, /api/hearings and
 * /api/warnings request therefore failed with "no such table".
 *
 * The application model is the authoritative one here: it is what the routes
 * write and what the UI reads, and it carries the fields Saudi Labour Law
 * actually requires (committee members, verdict, sanction, penalty amount).
 * The older tables are left in place, untouched, rather than migrated away.
 */
const MISSING_TABLES: Record<string, string> = {
  // Defined in no .sql migration, yet /api/approvals and the workflow engine
  // both read and write it, and server/db/seed.ts inserts demo rows into it.
  // Columns verified against the live schema rather than guessed.
  approval_requests: `
    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER,
      requester_id INTEGER NOT NULL,
      request_type TEXT,
      request_title TEXT,
      amount REAL DEFAULT 0,
      details TEXT,
      current_level INTEGER DEFAULT 1,
      max_levels INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      approval_history_json TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  employee_suggestions: `
    CREATE TABLE IF NOT EXISTS employee_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      suggestion_type TEXT DEFAULT 'suggestion',
      title TEXT,
      details TEXT,
      category TEXT,
      expected_impact TEXT,
      status TEXT DEFAULT 'submitted',
      hr_response TEXT,
      responded_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  employee_grievances: `
    CREATE TABLE IF NOT EXISTS employee_grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT,
      employee_id INTEGER NOT NULL,
      category TEXT DEFAULT 'work_environment',
      subject TEXT,
      details TEXT,
      is_confidential INTEGER DEFAULT 0,
      against_person TEXT,
      status TEXT DEFAULT 'submitted',
      committee_notes TEXT,
      resolution_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  hearing_sessions: `
    CREATE TABLE IF NOT EXISTS hearing_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grievance_id INTEGER,
      session_title TEXT,
      session_date DATE,
      location TEXT,
      committee_chair TEXT,
      hr_representative TEXT,
      legal_counsel TEXT,
      employee_name TEXT,
      witnesses TEXT,
      statements_minutes TEXT,
      committee_verdict TEXT,
      recommended_sanction TEXT DEFAULT 'none',
      deduction_days INTEGER DEFAULT 0,
      status TEXT DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (grievance_id) REFERENCES employee_grievances (id) ON DELETE SET NULL
    )
  `,
  official_warnings: `
    CREATE TABLE IF NOT EXISTS official_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_number TEXT,
      employee_id INTEGER NOT NULL,
      warning_type TEXT,
      violation_clause TEXT,
      violation_date DATE,
      investigation_ref TEXT,
      penalty_details TEXT,
      deduction_amount REAL DEFAULT 0,
      issued_by TEXT,
      issue_date DATE,
      acknowledgement_status TEXT DEFAULT 'acknowledged',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  // AI letter studio: /api/ai/hr-letters and /api/ai/hr-letter-generator both
  // hit this table, which no migration created.
  hr_generated_letters: `
    CREATE TABLE IF NOT EXISTS hr_generated_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      letter_id TEXT,
      employee_id INTEGER NOT NULL,
      letter_type TEXT,
      title TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,

  // --- Core HR screens: documents / assets / appraisals ---
  // /api/documents, /api/assets and /api/appraisals are live screens
  // (DocumentsView, AssetsView, EmployeeDocumentsView, PerformanceView). The
  // column sets below are the ones those routes and screens actually use.
  documents: `
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      name TEXT,
      type TEXT,
      expiry_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  assets: `
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT,
      serial_number TEXT,
      assigned_to INTEGER,
      assigned_at DATETIME,
      status TEXT DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES employees (id) ON DELETE SET NULL
    )
  `,
  appraisals: `
    CREATE TABLE IF NOT EXISTS appraisals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      rating REAL,
      comments TEXT,
      period TEXT,
      appraisal_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  promotions: `
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      old_position TEXT,
      new_position TEXT,
      old_salary REAL,
      new_salary REAL,
      promotion_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,

  // --- Recruitment (workflows.ts) ---
  // Migration 005 created recruitment_jobs / recruitment_candidates, but
  // nothing reads them: /api/recruitment/* is served from job_openings and
  // candidates, and RecruitmentView expects created_at / cv_url which the
  // migration's tables do not have. These are the tables the app actually uses.
  job_openings: `
    CREATE TABLE IF NOT EXISTS job_openings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      department_id INTEGER,
      description TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  candidates: `
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      name TEXT,
      email TEXT,
      phone TEXT,
      cv_url TEXT,
      status TEXT DEFAULT 'applied',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES job_openings (id) ON DELETE CASCADE
    )
  `,

  // --- Payroll support tables ---
  tax_exemption_declarations: `
    CREATE TABLE IF NOT EXISTS tax_exemption_declarations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      exemption_type TEXT,
      amount REAL DEFAULT 0,
      certificate_number TEXT,
      expiry_after TEXT,
      proof_file TEXT,
      year INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  expense_claims: `
    CREATE TABLE IF NOT EXISTS expense_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      category TEXT,
      amount REAL DEFAULT 0,
      description TEXT,
      claim_date TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  overtime_records: `
    CREATE TABLE IF NOT EXISTS overtime_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT,
      hours REAL DEFAULT 0,
      multiplier REAL DEFAULT 1.5,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  department_budgets: `
    CREATE TABLE IF NOT EXISTS department_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      year INTEGER,
      allocated_amount REAL DEFAULT 0,
      spent_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // --- Compliance ---
  employee_clearances: `
    CREATE TABLE IF NOT EXISTS employee_clearances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      clearance_slip_number TEXT,
      status TEXT DEFAULT 'in_progress',
      it_cleared_by INTEGER,
      it_status TEXT,
      it_notes TEXT,
      hr_status TEXT,
      hr_notes TEXT,
      finance_status TEXT,
      finance_notes TEXT,
      finance_loans_settled INTEGER DEFAULT 0,
      finance_custody_settled INTEGER DEFAULT 0,
      operations_status TEXT,
      operations_notes TEXT,
      operations_assets_returned INTEGER DEFAULT 0,
      hr_service_cert_issued INTEGER DEFAULT 0,
      hr_gosi_deregistered INTEGER DEFAULT 0,
      hr_medical_cancelled INTEGER DEFAULT 0,
      final_settlement_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  government_renewals: `
    CREATE TABLE IF NOT EXISTS government_renewals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      renewal_type TEXT,
      authority TEXT,
      identifier TEXT,
      expiry_date TEXT,
      cost REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  salary_certificates: `
    CREATE TABLE IF NOT EXISTS salary_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      certificate_number TEXT,
      addressed_to TEXT,
      purpose TEXT,
      include_allowances INTEGER DEFAULT 1,
      include_bank_iban INTEGER DEFAULT 1,
      qr_verification_code TEXT,
      issue_date TEXT,
      valid_until TEXT,
      status TEXT DEFAULT 'issued',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  qiwa_contracts: `
    CREATE TABLE IF NOT EXISTS qiwa_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      contract_number TEXT,
      contract_type TEXT,
      job_title TEXT,
      work_location TEXT,
      start_date TEXT,
      end_date TEXT,
      probation_days INTEGER DEFAULT 0,
      notice_period_days INTEGER DEFAULT 0,
      basic_salary REAL DEFAULT 0,
      housing_allowance REAL DEFAULT 0,
      transport_allowance REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      weekly_working_hours INTEGER DEFAULT 0,
      annual_leave_days INTEGER DEFAULT 0,
      auto_renew INTEGER DEFAULT 0,
      qiwa_status TEXT,
      qiwa_reference TEXT,
      clauses_json TEXT,
      digital_signature TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,

  // --- Fleet / flexible work / talent ---
  // Migration 005 created fleet_traffic_fines / flexible_shifts / talent_succession
  // with different names and column sets; these match what the routes and
  // FleetManagementView / FlexibleWorkTeleworkView / TalentMatrix9BoxView read.
  traffic_fines: `
    CREATE TABLE IF NOT EXISTS traffic_fines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      employee_id INTEGER,
      fine_number TEXT,
      violation_type TEXT,
      amount REAL DEFAULT 0,
      fine_date TEXT,
      deducted_from_payroll INTEGER DEFAULT 0,
      payroll_month INTEGER,
      payroll_year INTEGER,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  flexible_work_shifts: `
    CREATE TABLE IF NOT EXISTS flexible_work_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT,
      hours_worked REAL DEFAULT 0,
      hourly_rate REAL DEFAULT 0,
      total_pay REAL DEFAULT 0,
      mowaamah_hours_accumulated REAL DEFAULT 0,
      qiwa_contract_ref TEXT,
      supervisor_approved INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
  succession_plans: `
    CREATE TABLE IF NOT EXISTS succession_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER,
      department_id INTEGER,
      department_name TEXT,
      current_holder_id INTEGER,
      current_holder_name TEXT,
      current_holder_position TEXT,
      risk_level TEXT,
      primary_successor_id INTEGER,
      primary_successor_name TEXT,
      primary_successor_position TEXT,
      primary_successor_is_saudi INTEGER DEFAULT 0,
      secondary_successor_id INTEGER,
      secondary_successor_name TEXT,
      secondary_successor_position TEXT,
      readiness_status TEXT DEFAULT 'no_successor',
      development_action_plan TEXT,
      is_saudization_target INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

// --- Recognition & rewards (RewardsKudosView) ---
  peer_kudos: `
    CREATE TABLE IF NOT EXISTS peer_kudos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      sender_name TEXT,
      recipient_id INTEGER,
      recipient_name TEXT,
      recipient_job TEXT,
      core_value TEXT,
      message TEXT,
      points_awarded INTEGER DEFAULT 0,
      likes_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  reward_catalog: `
    CREATE TABLE IF NOT EXISTS reward_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      category TEXT,
      points_required INTEGER DEFAULT 0,
      stock_quantity INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  reward_redemptions: `
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      employee_name TEXT,
      reward_id INTEGER,
      reward_title TEXT,
      points_spent INTEGER DEFAULT 0,
      redemption_code TEXT,
      status TEXT DEFAULT 'approved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  pulse_survey_results: `
    CREATE TABLE IF NOT EXISTS pulse_survey_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      score_percentage REAL DEFAULT 0,
      respondents_count INTEGER DEFAULT 0,
      sentiment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  policies: `
    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      body TEXT,
      category TEXT,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // CCHI endorsement audit trail: every add/remove of a medical dependent
  // writes a row so the premium adjustment is explainable to the insurer.
  insurance_endorsements: `
    CREATE TABLE IF NOT EXISTS insurance_endorsements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      type TEXT,
      endorsement_date TEXT,
      premium_adjustment REAL DEFAULT 0,
      cchi_reference TEXT,
      status TEXT DEFAULT 'processed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // End-of-service benefit (مكافأة نهاية الخدمة) under Labour Law Articles 84/85.
  eos_calculations: `
    CREATE TABLE IF NOT EXISTS eos_calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      last_salary REAL DEFAULT 0,
      service_years REAL DEFAULT 0,
      service_months INTEGER DEFAULT 0,
      termination_type TEXT,
      wage_basic REAL DEFAULT 0,
      housing_allowance REAL DEFAULT 0,
      other_allowances REAL DEFAULT 0,
      gratuity_amount REAL DEFAULT 0,
      notice_period_days INTEGER DEFAULT 0,
      notice_amount REAL DEFAULT 0,
      leave_balance_days INTEGER DEFAULT 0,
      leave_amount REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      loans_deduction REAL DEFAULT 0,
      ewa_balance REAL DEFAULT 0,
      total_settlement REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )
  `,
};

// --- Columns the compliance/HR routes write that the migrations omit ---
export const ADDITIONAL_COLUMNS: Record<string, Record<string, string>> = {
  users: {
    // Forces a password change before the account can be used for anything
    // beyond the login screen. Set on the bootstrap admin; cleared on change.
    must_change_password: 'INTEGER DEFAULT 0',
  },
  visas: {
    travel_before_date: 'TEXT',
    duration_days: 'INTEGER DEFAULT 0',
    return_before_date: 'TEXT',
    cost: 'REAL DEFAULT 0',
  },
  payroll: {
    // Applied by the "apply to payroll" action on disciplinary violations.
    payroll_applied: 'INTEGER DEFAULT 0',
  },
  succession_plans: {
    critical_role_title: 'TEXT',
  },
  telework_permits: {
    permit_type: 'TEXT',
    remote_days_per_week: 'INTEGER DEFAULT 0',
    contract_start: 'TEXT',
    contract_end: 'TEXT',
    telework_platform_registered: 'INTEGER DEFAULT 0',
    productivity_score: 'REAL DEFAULT 0',
  },
  departments: {
    location: 'TEXT',
  },

  // ==========================================================================
  // Write-path columns missing from the schema.
  //
  // Found with scripts/find-write-column-drift.cjs, which rewrites every
  // INSERT/UPDATE column list into a SELECT and lets SQLite resolve it. The
  // schema-drift test could not see these: `SELECT *` resolves no columns, so a
  // whole INSERT/UPDATE class slips through. Each one below caused a 500 on
  // every write to that endpoint.
  // ==========================================================================
  employee_transfers: {
    // The routes write effective_date; migration 003 named it transfer_date.
    effective_date: 'TEXT',
  },
  branches: {
    location: 'TEXT',
  },
  tax_exemption_declarations: {
    // Written by the verify action on /api/tax/exemptions/:id/verify.
    status: "TEXT DEFAULT 'pending'",
    verified_by: 'TEXT',
    verified_at: 'TEXT',
  },
  department_budgets: {
    // The TCOE budget breakdown (budgeting screen).
    allocated_salaries: 'REAL DEFAULT 0',
    allocated_gosi: 'REAL DEFAULT 0',
    allocated_medical: 'REAL DEFAULT 0',
    allocated_work_permits: 'REAL DEFAULT 0',
    allocated_flight_tickets: 'REAL DEFAULT 0',
    allocated_end_of_service: 'REAL DEFAULT 0',
    allocated_training_rewards: 'REAL DEFAULT 0',
    total_allocated: 'REAL DEFAULT 0',
    headcount_cap: 'INTEGER DEFAULT 0',
  },

  // --- Write-path columns missing from the schema ---
  //
  // Each one makes a POST/PUT that previously returned 500 succeed.
  // Found by scripts/find-write-column-drift.cjs, which rewrites every INSERT
  // column list into a SELECT and lets SQLite resolve the names. The SELECT
  // drift test cannot catch this class: `SELECT *` resolves no columns.
  additional_salaries: {
    created_by: 'TEXT',
  },
  checklists: {
    type: 'TEXT',
  },
  employee_clearances: {
    last_working_day: 'TEXT',
    reason: 'TEXT',
    request_date: 'TEXT',
  },
  eos_calculations: {
    allowances: 'TEXT',
    basic_salary: 'REAL DEFAULT 0',
    employee_name: 'TEXT',
    end_date: 'TEXT',
    entitlement_percentage: 'TEXT',
    final_amount: 'REAL DEFAULT 0',
    leave_balance_compensation: 'REAL DEFAULT 0',
    national_id_iqama: 'TEXT',
    net_payable: 'TEXT',
    other_entitlements: 'TEXT',
    reason: 'TEXT',
    reason_text: 'TEXT',
    start_date: 'TEXT',
    total_salary: 'REAL DEFAULT 0',
    total_service_years: 'TEXT',
  },
  fleet_vehicles: {
    istimara_expiry: 'TEXT',
    periodic_inspection_expiry: 'TEXT',
  },
  government_renewals: {
    duration_months: 'TEXT',
    expiry_after: 'TEXT',
    expiry_before: 'TEXT',
    notes: 'TEXT',
    reference_number: 'TEXT',
    sadad_number: 'TEXT',
    type: 'TEXT',
  },
  medical_dependents: {
    birth_date: 'TEXT',
    card_number: 'TEXT',
    category: 'TEXT',
    national_id_iqama: 'TEXT',
  },
  medical_policies: {
    cchi_approval_number: 'TEXT',
    expiry_date: 'TEXT',
    total_members: 'TEXT',
    total_premium: 'REAL DEFAULT 0',
  },
  payroll_corrections: {
    corrected_by: 'TEXT',
  },
  salary_slips: {
    calculated_at: 'TEXT',
    calculated_by: 'TEXT',
    calculation_details_json: 'TEXT',
    currency: 'TEXT',
    exchange_rate: 'REAL DEFAULT 0',
    mtd_gross: 'TEXT',
    period_end: 'TEXT',
    period_start: 'TEXT',
    tax_breakup_json: 'TEXT',
    ytd_gross: 'TEXT',
    ytd_tax_paid: 'TEXT',
    ytd_taxable: 'TEXT',
  },
};

/**
 * Columns for tables this module creates itself.
 *
 * CREATE TABLE IF NOT EXISTS is a no-op once the table exists, so a database
 * that received an earlier, narrower version of one of these tables would
 * never gain later columns. Listing them here makes that self-healing: the
 * CREATE handles new databases, and this handles ones that already have an
 * outdated shape.
 */
export const CREATED_TABLE_COLUMNS: Record<string, Record<string, string>> = {
  promotions: { old_position: 'TEXT', new_position: 'TEXT', old_salary: 'REAL', new_salary: 'REAL', promotion_date: 'TEXT' },
  salary_certificates: {
    certificate_number: 'TEXT', qr_verification_code: 'TEXT',
    include_bank_iban: 'INTEGER DEFAULT 1', issue_date: 'TEXT',
    valid_until: 'TEXT', status: "TEXT DEFAULT 'issued'",
  },
  qiwa_contracts: {
    probation_days: 'INTEGER DEFAULT 0', notice_period_days: 'INTEGER DEFAULT 0',
    basic_salary: 'REAL DEFAULT 0', housing_allowance: 'REAL DEFAULT 0',
    transport_allowance: 'REAL DEFAULT 0', other_allowances: 'REAL DEFAULT 0',
    weekly_working_hours: 'INTEGER DEFAULT 0', annual_leave_days: 'INTEGER DEFAULT 0',
    auto_renew: 'INTEGER DEFAULT 0', qiwa_status: 'TEXT', qiwa_reference: 'TEXT',
    clauses_json: 'TEXT', digital_signature: 'TEXT',
  },
  peer_kudos: { sender_id: 'INTEGER', recipient_job: 'TEXT', core_value: 'TEXT' },
  documents: { expiry_date: 'TEXT' },
  assets: { assigned_to: 'INTEGER', assigned_at: 'DATETIME' },
  appraisals: { period: 'TEXT', appraisal_date: 'TEXT' },
  tax_exemption_declarations: { proof_file: 'TEXT', certificate_number: 'TEXT', expiry_after: 'TEXT', year: 'INTEGER' },
  expense_claims: { claim_date: 'TEXT' },
  overtime_records: {
    multiplier: 'REAL DEFAULT 1.5', reason: 'TEXT',
    // Saudi Labour Law splits overtime by day type, each at 1.5x (Art. 107).
    normal_hours: 'REAL DEFAULT 0',
    weekend_hours: 'REAL DEFAULT 0',
    holiday_hours: 'REAL DEFAULT 0',
    hourly_rate: 'REAL DEFAULT 0',
    total_overtime_pay: 'REAL DEFAULT 0',
    month: 'INTEGER', year: 'INTEGER',
  },
  department_budgets: { allocated_amount: 'REAL DEFAULT 0', spent_amount: 'REAL DEFAULT 0', year: 'INTEGER' },
  employee_clearances: { clearance_slip_number: 'TEXT', status: "TEXT DEFAULT 'in_progress'" },
  government_renewals: { authority: 'TEXT', identifier: 'TEXT', expiry_date: 'TEXT', cost: 'REAL DEFAULT 0' },
  job_openings: { title: 'TEXT', department_id: 'INTEGER', description: 'TEXT', status: "TEXT DEFAULT 'open'" },
  candidates: { cv_url: 'TEXT', status: "TEXT DEFAULT 'applied'", notes: 'TEXT' },
  traffic_fines: { fine_number: 'TEXT', violation_type: 'TEXT', amount: 'REAL DEFAULT 0', fine_date: 'TEXT' },
  flexible_work_shifts: { hours_worked: 'REAL DEFAULT 0', hourly_rate: 'REAL DEFAULT 0', total_pay: 'REAL DEFAULT 0' },
  succession_plans: { critical_role_title: 'TEXT', risk_level: 'TEXT', development_action_plan: 'TEXT' },
  reward_catalog: { points_required: 'INTEGER DEFAULT 0', stock_quantity: 'INTEGER DEFAULT 0' },
  reward_redemptions: { points_spent: 'INTEGER DEFAULT 0', redemption_code: 'TEXT', status: "TEXT DEFAULT 'approved'" },
  pulse_survey_results: { score_percentage: 'REAL DEFAULT 0', respondents_count: 'INTEGER DEFAULT 0', sentiment: 'TEXT' },
  policies: { title: 'TEXT', body: 'TEXT', category: 'TEXT', status: "TEXT DEFAULT 'published'" },
  insurance_endorsements: { cchi_reference: 'TEXT', premium_adjustment: 'REAL DEFAULT 0', status: "TEXT DEFAULT 'processed'" },
  eos_calculations: { gratuity_amount: 'REAL DEFAULT 0', total_settlement: 'REAL DEFAULT 0', notice_amount: 'REAL DEFAULT 0' },
  hr_generated_letters: { letter_id: 'TEXT', letter_type: 'TEXT', title: 'TEXT', content: 'TEXT' },
  employee_grievances: { ticket_number: 'TEXT', committee_notes: 'TEXT', resolution_summary: 'TEXT' },
  hearing_sessions: { session_title: 'TEXT', session_date: 'TEXT', committee_verdict: 'TEXT' },
  official_warnings: { notice_number: 'TEXT', violation_clause: 'TEXT', deduction_amount: 'REAL DEFAULT 0' },
};

/**
 * Creates the tables no migration defines.
 *
 * Split out of applyColumnReconciliation so scripts/build-test-db.cjs can
 * replay the same DDL against a throwaway database without importing
 * server/db/migrate.ts, which would open the real payroll.db.
 */
export function createMissingTablesForTest(db: SqliteLike): number {
  let created = 0;
  const exists = (name: string) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  for (const [table, ddl] of Object.entries(MISSING_TABLES)) {
    if (exists(table)) continue;
    db.exec(ddl);
    created++;
  }
  return created;
}

/** Minimal structural type so this works with better-sqlite3 and test doubles. */
interface SqliteLike {
  prepare(sql: string): { get(...args: any[]): any; all(...args: any[]): any[] };
  exec(sql: string): unknown;
}

export interface ReconcileResult {
  added: string[];
  createdTables: string[];
  skippedTables: string[];
}

/**
 * Creates any missing tables, then adds any missing columns and backfills
 * legacy values. Safe to run on every boot: everything it does is guarded by
 * existence checks.
 */
export function applyColumnReconciliation(
  db: SqliteLike,
  log: (message: string) => void = () => {}
): ReconcileResult {
  const result: ReconcileResult = { added: [], createdTables: [], skippedTables: [] };

  const tableExists = (name: string) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

  // Whole tables the application expects but no migration created.
  for (const [table, ddl] of Object.entries(MISSING_TABLES)) {
    if (tableExists(table)) continue;
    db.exec(ddl);
    result.createdTables.push(table);
    log(`[migrate] Created missing table ${table}`);
  }


  // Merge per table rather than letting a later map overwrite an earlier one.
//
// A plain spread made CREATED_TABLE_COLUMNS silently win for any table present
// in two blocks (employee_clearances, government_renewals, eos_calculations,
// tax_exemption_declarations, department_budgets, succession_plans). The
// migration then reported success while those columns were never added and the
// endpoints kept returning 500.
const allColumnDefs: Record<string, Record<string, string>> = {};
for (const source of [COLUMN_RECONCILIATION, ADDITIONAL_COLUMNS, CREATED_TABLE_COLUMNS]) {
    for (const [table, cols] of Object.entries(source)) {
      if (!cols || Object.keys(cols).length === 0) continue;
      allColumnDefs[table] = { ...(allColumnDefs[table] || {}), ...cols };
    }
  }

  for (const [table, columns] of Object.entries(allColumnDefs)) {
    if (!tableExists(table)) {
      // The table itself is created by the .sql migrations; nothing to do here.
      result.skippedTables.push(table);
      continue;
    }

    const present = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name)
    );

    for (const [col, definition] of Object.entries(columns)) {
      if (present.has(col)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
      result.added.push(`${table}.${col}`);
      log(`[migrate] Added column ${table}.${col}`);
    }

    const backfill = BACKFILL[table];
    if (backfill) db.exec(backfill);
  }

  for (const [table, statements] of Object.entries(INDEXES)) {
    // Guard on table existence: an index cannot be created before its table.
    if (!tableExists(table)) continue;
    for (const sql of statements) db.exec(sql);
  }

  return result;
}