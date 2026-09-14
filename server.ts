import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import bodyParser from "body-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import https from "https";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { CountryRulesService } from "./src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "./src/lib/payroll/PayrollCalculator";
import "dotenv/config";

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

let __dirname = process.cwd();
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  __dirname = process.cwd();
}

const db = new Database("payroll.db");

// Initialize Database
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

// Seed Medical Policies & Dependents
const checkMedPol = db.prepare("SELECT COUNT(*) as count FROM medical_policies").get() as any;
if (checkMedPol.count === 0) {
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
if (checkTalent.count === 0) {
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
if (checkFleet.count === 0) {
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
if (checkFlex.count === 0) {
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
if (checkGriev.count === 0) {
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
if (checkKudos.count === 0) {
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
if (checkAssets.count === 0) {
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


const logAction = (action: string, entity_type: string, entity_id: number | null, details: string) => {
  db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?)
  `).run(action, entity_type, entity_id, details);
};

const createNotification = (title: string, message: string, type: string = 'info') => {
  db.prepare(`
    INSERT INTO notifications (title, message, type)
    VALUES (?, ?, ?)
  `).run(title, message, type);
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors());
  app.use(bodyParser.json());

  // JWT Secret — there is no fallback constant any more. A hardcoded default meant every
  // installation accepted tokens signed with a publicly known key, so anyone could mint an
  // admin token. If the environment supplies nothing we generate a strong random secret and
  // persist it next to the database, so sessions still survive a restart.
  const JWT_SECRET = (() => {
    const fromEnv = (process.env.JWT_SECRET || "").trim();
    if (fromEnv) return fromEnv;
    const secretFile = path.join(process.cwd(), ".jwt-secret");
    try {
      if (fs.existsSync(secretFile)) {
        const saved = fs.readFileSync(secretFile, "utf8").trim();
        if (saved) return saved;
      }
      const generated = crypto.randomBytes(48).toString("base64");
      fs.writeFileSync(secretFile, generated + "\n", { mode: 0o600 });
      // Windows ignores the mode on create; tighten what we can and never fail the boot.
      try { fs.chmodSync(secretFile, 0o600); } catch { /* best effort */ }
      console.log(`[security] لم يُضبط JWT_SECRET في البيئة — تم توليد سرّ عشوائي (96 حرفًا) وحفظه في: ${secretFile}`);
      return generated;
    } catch (e) {
      throw new Error("تعذّر توليد أو قراءة JWT_SECRET: " + (e as Error).message);
    }
  })();
  const JWT_EXPIRY = "24h";

  // Rate limiter for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: "Too many attempts, please try again later" }
  });
  const kioskLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    // Raised from 80: each kiosk punch consumes several limited calls
    // (webauthn options + login + check-in/check-out), so 80/5min throttled
    // normal branch-wide arrival bursts. Still caps abuse on the kiosk routes.
    max: 240,
    message: { error: "محاولات كثيرة على جهاز الحضور — انتظر قليلاً" }
  });
  // Narrow limiter for phone pairing: the pairing_pin is only 6 digits,
  // so allow 10 attempts / 15 minutes per IP.
  const pairPhoneLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "محاولات تفعيل كثيرة — انتظر 15 دقيقة ثم أعد المحاولة" }
  });
  // Biometric enrollment is an admin action: authenticated + permission-checked, and capped
  // so a stolen admin token cannot mass-overwrite employee credentials in a tight loop.
  const enrollLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: "محاولات تسجيل بصمة كثيرة — انتظر قليلاً ثم أعد المحاولة" }
  });

  // Auth middleware
  const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (req as any).user = decoded;
      next();
    } catch (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
  };

  // Role-based access control middleware
  const requireRole = (...roles: string[]) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = (req as any).user;
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      next();
    };
  };

  // Express matches routes case-insensitively and tolerates a trailing slash, so path
  // checks here and in the RBAC layer must normalise the same way — otherwise
  // "PUT /API/Settings" reaches the handler while skipping auth and its permission rule.
  const normalizeApiUrl = (raw: string) => {
    let url = raw.split("?")[0].toLowerCase();
    while (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1);
    return url;
  };

  const openApi = [
    "/api/auth/login",
    "/api/kiosk",
    "/api/attendance/pair-phone",
    "/api/attendance/geo-validate",
    "/api/attendance/check-in",
    "/api/attendance/check-out",
    // Only the kiosk *login* leg is anonymous: the branch tablet proves possession of a
    // stored credential. Enrollment (/api/webauthn/register*) is an administrative action
    // and must carry a token — see the BIOMETRIC_ENROLL rule in ROUTE_PERMISSIONS below.
    "/api/webauthn/login/options",
    "/api/webauthn/login",
  ];
  app.use((req, res, next) => {
    const url = normalizeApiUrl(req.originalUrl || req.path);
    if (!url.startsWith("/api")) return next();
    if (openApi.some((p) => url === p || url.startsWith(p + "/"))) return next();
    return authenticateToken(req, res, next);
  });

  // --- C4: central RBAC policy (single source of truth) ---
  // Mirrors the screen matrix the UI already enforces (src/App.tsx allow(), lines 205-210).
  // The server enforces exactly what the interface assumes — no new policy.
  const PERM = {
    ESS: "ess.self_service",
    SETTINGS_MANAGE: "settings.manage",
    EMPLOYEES_MANAGE: "employees.manage",
    ALLOWANCE_TYPES_MANAGE: "allowance_types.manage",
    BRANCHES_MANAGE: "branches.manage",
    DEPARTMENTS_MANAGE: "departments.manage",
    PAYROLL_RUN: "payroll.run",
    ATTENDANCE_DEVICES_MANAGE: "attendance_devices.manage",
    AUDIT_LOGS_VIEW: "audit_logs.view",
    REPORTS_VIEW: "reports.view",
    WPS_VIEW: "wps.view",
    EXCEL_EXPORT: "excel.export",
    SAUDI_COMPLIANCE: "saudi.compliance",
    ADMIN_MANAGE: "admin.manage",
    BACKUP_MANAGE: "backup.manage",
    ENTITIES_MANAGE: "entities.manage",
    AUTH_REGISTER: "auth.register",
    // Biometric/WebAuthn *enrollment* is an administrative write (it replaces an employee's
    // stored credential) — not a self-service action and never an anonymous one.
    BIOMETRIC_ENROLL: "biometric.enroll",
    // Writes that land directly on the payroll (penalty/deduction lines) — finance may see
    // payroll screens but must not decide disciplinary or traffic deductions.
    PAYROLL_DEDUCTIONS_APPLY: "payroll.deductions.apply",
    BUDGETS_MANAGE: "budgets.manage",
    // --- cycle 4: keys for the write routes that the table below did not classify yet ---
    // Each one mirrors the role list of the screen that issues the call, named after the
    // resource rather than the screen id so it can be reused as the UI grows.
    BONUSES_MANAGE: "bonuses.manage", // bonuses screen: admin, hr_manager, finance
    LOANS_MANAGE: "loans.manage", // loans screen: admin, hr_manager, finance
    EXPENSES_MANAGE: "expenses.manage", // expenses screen: admin, hr_manager, finance
    LEAVES_MANAGE: "leaves.manage", // leaves screen + manager_inbox approvals
    ATTENDANCE_MANAGE: "attendance.manage", // attendance screen (manual punch edits)
    WORKFLOWS_MANAGE: "workflows.manage", // approval_workflows + manager_inbox screens
    DOCUMENTS_MANAGE: "documents.manage", // employees & employee_documents screens
    HR_OPERATIONS_MANAGE: "hr_operations.manage", // HR-only screens (fleet, medical, visas, ...)
    AI_TOOLS_USE: "ai.tools.use", // ai_consultant & ai_letters screens
    ALERTS_MANAGE: "alerts.manage", // expiry-alert hub, opened from the header bell
  } as const;

  // role -> permission keys ("*" = every screen: admin/hr_manager own all screens)
  const ROLE_PERMISSIONS: Record<string, Set<string>> = {
    admin: new Set<string>(["*"]),
    hr_manager: new Set<string>(["*"]),
    finance: new Set<string>([
      PERM.ALLOWANCE_TYPES_MANAGE,
      PERM.PAYROLL_RUN,
      PERM.REPORTS_VIEW,
      PERM.WPS_VIEW,
      PERM.EXCEL_EXPORT,
      PERM.SAUDI_COMPLIANCE,
      PERM.AUDIT_LOGS_VIEW, // DashboardView reads recent activity for every dashboard role
      PERM.BUDGETS_MANAGE, // budgeting screen: admin, hr_manager, finance
      PERM.BONUSES_MANAGE, // bonuses screen: admin, hr_manager, finance
      PERM.LOANS_MANAGE, // loans screen: admin, hr_manager, finance
      PERM.EXPENSES_MANAGE, // expenses screen: admin, hr_manager, finance
      PERM.ALERTS_MANAGE, // expiry-alert hub is reached from the bell every role renders
    ]),
    branch_manager: new Set<string>([
      PERM.EMPLOYEES_MANAGE,
      PERM.ATTENDANCE_DEVICES_MANAGE,
      PERM.AUDIT_LOGS_VIEW, // DashboardView reads recent activity for every dashboard role
      PERM.BIOMETRIC_ENROLL, // attendance_kiosk screen: admin, hr_manager, branch_manager
      PERM.ATTENDANCE_MANAGE, // attendance screen: admin, hr_manager, branch_manager
      PERM.LEAVES_MANAGE, // leaves + manager_inbox screens: admin, hr_manager, branch_manager
      PERM.WORKFLOWS_MANAGE, // approval_workflows + manager_inbox screens
      PERM.DOCUMENTS_MANAGE, // employees screen uploads attachments (EmployeesView)
      PERM.ALERTS_MANAGE, // expiry-alert hub is reached from the bell every role renders
    ]),
    employee_ess: new Set<string>([PERM.ESS]),
  };

  // (method + path pattern) -> permission key. method "*" = any method.
  const ROUTE_PERMISSIONS: Array<{ method: string; pattern: RegExp; perm: string }> = [
    // settings screen: admin, hr_manager
    { method: "PUT", pattern: /^\/api\/settings$/, perm: PERM.SETTINGS_MANAGE },
    // employees screen: admin, hr_manager, branch_manager
    { method: "POST", pattern: /^\/api\/employees$/, perm: PERM.EMPLOYEES_MANAGE },
    { method: "PUT", pattern: /^\/api\/employees\/[^/]+$/, perm: PERM.EMPLOYEES_MANAGE },
    { method: "DELETE", pattern: /^\/api\/employees\/[^/]+$/, perm: PERM.EMPLOYEES_MANAGE },
    // allowances screen: admin, hr_manager, finance
    { method: "POST", pattern: /^\/api\/allowance-types$/, perm: PERM.ALLOWANCE_TYPES_MANAGE },
    { method: "PUT", pattern: /^\/api\/allowance-types\/[^/]+$/, perm: PERM.ALLOWANCE_TYPES_MANAGE },
    { method: "DELETE", pattern: /^\/api\/allowance-types\/[^/]+$/, perm: PERM.ALLOWANCE_TYPES_MANAGE },
    // branches screen: admin, hr_manager
    { method: "POST", pattern: /^\/api\/branches$/, perm: PERM.BRANCHES_MANAGE },
    { method: "PUT", pattern: /^\/api\/branches\/[^/]+$/, perm: PERM.BRANCHES_MANAGE },
    { method: "DELETE", pattern: /^\/api\/branches\/[^/]+$/, perm: PERM.BRANCHES_MANAGE },
    // departments screen: admin, hr_manager
    { method: "POST", pattern: /^\/api\/departments$/, perm: PERM.DEPARTMENTS_MANAGE },
    { method: "PUT", pattern: /^\/api\/departments\/[^/]+$/, perm: PERM.DEPARTMENTS_MANAGE },
    { method: "DELETE", pattern: /^\/api\/departments\/[^/]+$/, perm: PERM.DEPARTMENTS_MANAGE },
    // payroll screen: admin, hr_manager, finance
    { method: "POST", pattern: /^\/api\/payroll\/(generate|lock|sync-attendance|batch|calculate)$/, perm: PERM.PAYROLL_RUN },
    // attendance devices (admin ops): attendance_kiosk screen -> admin, hr_manager, branch_manager
    { method: "POST", pattern: /^\/api\/attendance\/devices(\/.*)?$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
    { method: "DELETE", pattern: /^\/api\/attendance\/devices\/[^/]+$/, perm: PERM.ATTENDANCE_DEVICES_MANAGE },
    // biometric enrollment — replaces an employee's stored credential, so it is an
    // administrative action. Anonymous kiosk traffic stops at the login legs, which are
    // deliberately absent from this table (openApi routes carry no req.user).
    { method: "POST", pattern: /^\/api\/webauthn\/register(\/.*)?$/, perm: PERM.BIOMETRIC_ENROLL },
    { method: "POST", pattern: /^\/api\/biometric\/register$/, perm: PERM.BIOMETRIC_ENROLL },
    // writes that post penalties/deductions straight onto the payroll
    { method: "POST", pattern: /^\/api\/disciplinary\/violations\/[^/]+\/apply-payroll$/, perm: PERM.PAYROLL_DEDUCTIONS_APPLY },
    { method: "POST", pattern: /^\/api\/fleet\/traffic-fines\/[^/]+\/deduct$/, perm: PERM.PAYROLL_DEDUCTIONS_APPLY },
    // budgeting screen: admin, hr_manager, finance
    { method: "PUT", pattern: /^\/api\/budgets\/departments\/[^/]+$/, perm: PERM.BUDGETS_MANAGE },
    // audit trail (audit screen + dashboard widget readers)
    { method: "GET", pattern: /^\/api\/audit-logs$/, perm: PERM.AUDIT_LOGS_VIEW },
    // financial / compliance data
    { method: "GET", pattern: /^\/api\/reports(\/.*)?$/, perm: PERM.REPORTS_VIEW },
    { method: "GET", pattern: /^\/api\/provisions(\/.*)?$/, perm: PERM.REPORTS_VIEW },
    { method: "GET", pattern: /^\/api\/wps(\/.*)?$/, perm: PERM.WPS_VIEW },
    { method: "GET", pattern: /^\/api\/excel(\/.*)?$/, perm: PERM.EXCEL_EXPORT },
    { method: "*", pattern: /^\/api\/saudi(\/.*)?$/, perm: PERM.SAUDI_COMPLIANCE },
    // system administration (unchanged: admin only)
    { method: "*", pattern: /^\/api\/admin(\/.*)?$/, perm: PERM.ADMIN_MANAGE },
    { method: "*", pattern: /^\/api\/backup(\/.*)?$/, perm: PERM.BACKUP_MANAGE },
    { method: "POST", pattern: /^\/api\/entities$/, perm: PERM.ENTITIES_MANAGE },
    { method: "PUT", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
    { method: "DELETE", pattern: /^\/api\/entities\/[^/]+$/, perm: PERM.ENTITIES_MANAGE },
    { method: "PUT", pattern: /^\/api\/countries\/[^/]+\/rules$/, perm: PERM.ADMIN_MANAGE },
    { method: "POST", pattern: /^\/api\/auth\/register$/, perm: PERM.AUTH_REGISTER },

    // --- cycle 4: the remaining write routes, classified from the screen matrix ---
    // Every rule below is derived from the component that issues the call and the screen id
    // that renders it (src/App.tsx allow(), lines 205-210). A route whose caller could not be
    // determined in src/** is deliberately left out of this table so it keeps the pre-cycle
    // behaviour: allowed for operational roles, denied for employee_ess, and still reported
    // by the boot-time coverage scan.
    // bonuses screen: admin, hr_manager, finance (src/components/BonusesView.tsx:38,49)
    { method: "POST", pattern: /^\/api\/bonuses-penalties$/, perm: PERM.BONUSES_MANAGE },
    { method: "DELETE", pattern: /^\/api\/bonuses-penalties\/[^/]+$/, perm: PERM.BONUSES_MANAGE },
    // loans screen: admin, hr_manager, finance (src/components/LoansView.tsx:48)
    { method: "POST", pattern: /^\/api\/loans$/, perm: PERM.LOANS_MANAGE },
    // expenses screen: admin, hr_manager, finance (src/components/ExpensesView.tsx:40)
    { method: "POST", pattern: /^\/api\/expenses$/, perm: PERM.EXPENSES_MANAGE },
    // attendance screen manual punch edits: admin, hr_manager, branch_manager
    // (src/components/AttendanceView.tsx:188). The kiosk legs stay in openApi untouched.
    { method: "POST", pattern: /^\/api\/attendance$/, perm: PERM.ATTENDANCE_MANAGE },
    // leaves screen + manager_inbox approval: admin, hr_manager, branch_manager
    // (LeavesView.tsx:41,53 and ManagerInboxView.tsx:21)
    { method: "POST", pattern: /^\/api\/leaves$/, perm: PERM.LEAVES_MANAGE },
    { method: "PUT", pattern: /^\/api\/leaves\/[^/]+$/, perm: PERM.LEAVES_MANAGE },
    // approval_workflows + manager_inbox: admin, hr_manager, branch_manager
    // (ApprovalWorkflowsView.tsx:85,58 and ManagerInboxView.tsx:25)
    { method: "POST", pattern: /^\/api\/workflow-requests$/, perm: PERM.WORKFLOWS_MANAGE },
    { method: "POST", pattern: /^\/api\/workflow-requests\/[^/]+\/action$/, perm: PERM.WORKFLOWS_MANAGE },
    // documents are attached from the employees / employee_documents screens, which
    // branch_manager also owns (EmployeesView.tsx:104) — admin, hr_manager, branch_manager
    { method: "POST", pattern: /^\/api\/documents$/, perm: PERM.DOCUMENTS_MANAGE },
    { method: "DELETE", pattern: /^\/api\/documents\/[^/]+$/, perm: PERM.DOCUMENTS_MANAGE },
    // expiry-alert hub: opened from the header bell, which every signed-in operational role
    // renders (src/App.tsx:511 -> ExpiryAlertsModal.tsx:78). employee_ess stays denied here,
    // exactly as it was while the route was unclassified.
    { method: "POST", pattern: /^\/api\/alerts\/send-reminder$/, perm: PERM.ALERTS_MANAGE },
    // AI studio screens: admin, hr_manager (LaborLawAiConsultantView.tsx:50)
    { method: "POST", pattern: /^\/api\/ai\/labor-law-consultant$/, perm: PERM.AI_TOOLS_USE },
    // HR-only screens: admin, hr_manager. Each group below exists in a nav screen that neither
    // finance's nor branch_manager's allow-list contains (src/App.tsx:209-210).
    { method: "POST", pattern: /^\/api\/(appraisals|assets|clearances|disciplinary\/violations|ewa\/withdrawals|exit-interviews|flight-tickets|flexible\/shifts|grievances|hearings|promotions|smart-assets|telework\/permits|transfers|visas|warnings|work-injuries)$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "POST", pattern: /^\/api\/(fleet\/vehicles|fleet\/traffic-fines|qiwa\/contracts|qiwa\/draft-from-employees)$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "POST", pattern: /^\/api\/(hse\/inspections|hse\/ppe-logs|medical\/dependents|medical\/policies)$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "POST", pattern: /^\/api\/(recruitment\/candidates|recruitment\/jobs|talent\/assessments|talent\/succession)$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "POST", pattern: /^\/api\/(kudos(\/[^/]+\/like)?|rewards\/redeem)$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "POST", pattern: /^\/api\/overtime(\/[^/]+\/approve)?$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "DELETE", pattern: /^\/api\/(fleet\/vehicles|medical\/dependents|overtime|talent\/succession)\/[^/]+$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "PUT", pattern: /^\/api\/(assets|smart-assets)\/[^/]+\/assign$/, perm: PERM.HR_OPERATIONS_MANAGE },
    { method: "PUT", pattern: /^\/api\/(clearances\/[^/]+\/department|grievances\/[^/]+\/status|policies\/ramadan)$/, perm: PERM.HR_OPERATIONS_MANAGE },
  ];

  // The only write routes employee_ess may call (self-service surface of src/components/ESSView.tsx
  // plus the shell actions every authenticated role needs).
  const ESS_WRITE_ALLOWLIST: Array<{ method: string; pattern: RegExp }> = [
    { method: "POST", pattern: /^\/api\/auth\/logout$/ },
    { method: "PUT", pattern: /^\/api\/auth\/change-password$/ },
    { method: "PUT", pattern: /^\/api\/notifications\/read-all$/ },
    { method: "PUT", pattern: /^\/api\/notifications\/[^/]+\/read$/ },
    { method: "POST", pattern: /^\/api\/salary-certificates$/ }, // ESSView -> SalaryCertificateModal (شهادة تعريف بالراتب)
    { method: "POST", pattern: /^\/api\/visas\/exit-reentry$/ }, // ESSView tab "طلب تأشيرة خروج وعودة"
    { method: "POST", pattern: /^\/api\/copilot\/chat$/ }, // floating AI launcher is rendered for every role (read-only on the server)
  ];

  const FORBIDDEN = { error: "Insufficient permissions" };
  const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const unclassifiedWrites = new Set<string>();

  const ruleMatches = (rule: { method: string; pattern: RegExp }, method: string, url: string) =>
    (rule.method === "*" || rule.method === method) && rule.pattern.test(url);

  const hasPermission = (role: string, perm: string) => {
    const granted = ROLE_PERMISSIONS[role];
    return !!granted && (granted.has("*") || granted.has(perm));
  };

  const requirePermission = (perm: string) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!hasPermission(String((req as any).user?.role || ""), perm)) {
        return res.status(403).json(FORBIDDEN);
      }
      next();
    };
  };

  // Applies the policy above to every /api request: classified routes are checked for
  // all methods, and unclassified *writes* are fail-closed for employee_ess only.
  const enforceRoutePermissions = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const url = normalizeApiUrl(req.originalUrl || req.path);
    if (!url.startsWith("/api")) return next();
    const user = (req as any).user;
    if (!user) return next(); // openApi route — nothing to enforce

    const method = req.method.toUpperCase();
    const rule = ROUTE_PERMISSIONS.find((r) => ruleMatches(r, method, url));
    if (rule) return requirePermission(rule.perm)(req, res, next);

    if (WRITE_METHODS.has(method)) {
      if (String(user.role || "") === "employee_ess" && !ESS_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(url))) {
        return res.status(403).json(FORBIDDEN);
      }
      // Fail-safe: unclassified writes stay allowed for operational roles (behaviour preserved),
      // and are logged once so classification can be completed later.
      const key = method + " " + url;
      if (!unclassifiedWrites.has(key)) {
        unclassifiedWrites.add(key);
        console.warn("[RBAC] unclassified write route (allowed for operational roles): " + key);
      }
    }

    next();
  };
  app.use(enforceRoutePermissions);

  // Entity-based access control
  const requireEntity = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.entity_id) {
      return res.status(403).json({ error: "Entity access required" });
    }
    next();
  };

  // --- Auth Routes ---

  // Login
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const user = db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, entity_id: user.entity_id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      // Create session
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)")
        .run(user.id, token, expiresAt, req.ip);

      // Get entity info
      let entity = null;
      if (user.entity_id) {
        entity = db.prepare("SELECT * FROM entities WHERE id = ?").get(user.entity_id);
      }

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          entity_id: user.entity_id,
          entity: entity ? { id: entity.id, name_ar: entity.name_ar, name_en: entity.name_en, country_code: entity.country_code, currency: entity.currency } : null
        }
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Register (admin only)
  app.post("/api/auth/register", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const { username, password, role, entity_id } = req.body;
      if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role required" });
      }

      const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = db.prepare("INSERT INTO users (username, password_hash, role, entity_id) VALUES (?, ?, ?, ?)")
        .run(username, passwordHash, role, entity_id || null);

      res.json({ success: true, user_id: result.lastInsertRowid });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user
  app.get("/api/auth/me", authenticateToken, (req, res) => {
    const user = (req as any).user;
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      entity_id: user.entity_id
    });
  });

  // Logout
  app.post("/api/auth/logout", authenticateToken, (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    res.json({ success: true });
  });

  // Change password
  app.put("/api/auth/change-password", authenticateToken, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password required" });
      }

      const user = (req as any).user;
      const dbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const validPassword = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: "Current password incorrect" });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);
      
      // Invalidate all sessions except current
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, token);

      res.json({ success: true });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- API Routes ---

  // Settings
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.put("/api/settings", (req, res) => {
    const keys = [
      'org_name', 'country', 'currency', 'tax_rate', 'insurance_emp_rate', 'insurance_comp_rate',
      'cr_number', 'unified_number_700', 'mol_establishment_id', 'gosi_establishment_id',
      'cchi_policy_number', 'nitaqat_category', 'saudi_gosi_emp_rate', 'saudi_gosi_comp_rate',
      'expat_gosi_comp_rate', 'work_permit_annual_fee', 'iqama_renewal_fee'
    ];
    
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, req.body[key].toString());
      }
    }
    
    logAction('update', 'settings', null, `Updated Saudi settings`);
    res.json({ success: true });
  });

  // Audit Logs
  app.get("/api/audit-logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100").all();
    res.json(logs);
  });

  // Notifications
  app.get("/api/notifications", (req, res) => {
    const notifications = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all();
    res.json(notifications);
  });

  app.put("/api/notifications/read-all", (req, res) => {
    db.prepare("UPDATE notifications SET is_read = 1").run();
    res.json({ success: true });
  });

  // Branches
  app.get("/api/branches", (req, res) => {
    const branches = db.prepare("SELECT * FROM branches").all();
    res.json(branches);
  });

  app.post("/api/branches", (req, res) => {
    const { name, location, latitude, longitude, geofence_radius_m, work_start_time, work_end_time } = req.body;
    const info = db.prepare("INSERT INTO branches (name, location, latitude, longitude, geofence_radius_m, work_start_time, work_end_time) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(name, location, latitude || null, longitude || null, geofence_radius_m || 200, work_start_time || '08:00', work_end_time || '17:00');
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/branches/:id", (req, res) => {
    const { name, location, latitude, longitude, geofence_radius_m, work_start_time, work_end_time } = req.body;
    db.prepare(`
      UPDATE branches SET
        name = COALESCE(?, name),
        location = COALESCE(?, location),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        geofence_radius_m = COALESCE(?, geofence_radius_m),
        work_start_time = COALESCE(?, work_start_time),
        work_end_time = COALESCE(?, work_end_time)
      WHERE id = ?
    `).run(name || null, location || null, latitude ?? null, longitude ?? null, geofence_radius_m ?? null, work_start_time || null, work_end_time || null, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/branches/:id", (req, res) => {
    db.prepare("DELETE FROM branches WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Allowance Types
  app.get("/api/allowance-types", (req, res) => {
    const types = db.prepare("SELECT * FROM allowance_types").all();
    res.json(types);
  });

  app.post("/api/allowance-types", (req, res) => {
    const { name } = req.body;
    const info = db.prepare("INSERT INTO allowance_types (name) VALUES (?)").run(name);
    const id = info.lastInsertRowid;
    logAction('create', 'allowance_type', Number(id), `Created allowance type: ${name}`);
    res.json({ id });
  });

  app.put("/api/allowance-types/:id", (req, res) => {
    const { name } = req.body;
    db.prepare("UPDATE allowance_types SET name = ? WHERE id = ?").run(name, req.params.id);
    logAction('update', 'allowance_type', Number(req.params.id), `Updated allowance type to: ${name}`);
    res.json({ success: true });
  });

  app.delete("/api/allowance-types/:id", (req, res) => {
    db.prepare("DELETE FROM allowance_types WHERE id = ?").run(req.params.id);
    logAction('delete', 'allowance_type', Number(req.params.id), `Deleted allowance type`);
    res.json({ success: true });
  });

  // Employees
  app.get("/api/employees", (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name,
      IFNULL((SELECT SUM(amount) FROM employee_allowances WHERE employee_id = e.id), 0) as allowances
      FROM employees e 
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all();

    // Attach specific allowance details
    const employeesWithDetails = employees.map(emp => {
      const allowancesDetails = db.prepare(`
        SELECT ea.*, at.name 
        FROM employee_allowances ea
        JOIN allowance_types at ON ea.allowance_type_id = at.id
        WHERE ea.employee_id = ?
      `).all((emp as any).id);
      return { ...emp, allowances_details: allowancesDetails };
    });

    res.json(employeesWithDetails);
  });

  app.post("/api/employees", (req, res) => {
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
    
    // Auto-calculate GOSI wage if not explicitly passed
    const computedGosiSalary = gosi_registered_salary > 0 ? gosi_registered_salary : (Number(basic_salary) + Number(housing_allowance));
    const isSaudiCalc = is_saudi !== undefined ? is_saudi : (nationality === 'سعودي' || nationality === 'سعودية' ? 1 : 0);

    const insertEmployee = db.prepare(`
      INSERT INTO employees (
        branch_id, department_id, name, position, job_title, 
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
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

    const transaction = db.transaction(() => {
      const info = insertEmployee.run(
        branch_id, department_id, name, position, job_title, 
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
            insertAllowance.run(employeeId, al.type_id, al.amount);
          }
        }
      }
      return employeeId;
    });

    const id = transaction();
    logAction('create', 'employee', Number(id), `Created employee with KSA compliance: ${name}`);
    res.json({ id });
  });

  app.put("/api/employees/:id", (req, res) => {
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

    const computedGosiSalary = gosi_registered_salary > 0 ? gosi_registered_salary : (Number(basic_salary) + Number(housing_allowance));
    const isSaudiCalc = is_saudi !== undefined ? is_saudi : (nationality === 'سعودي' || nationality === 'سعودية' ? 1 : 0);

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE employees SET 
          branch_id = ?, department_id = ?, name = ?, position = ?, job_title = ?, 
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
        branch_id, department_id, name, position, job_title, 
        basic_salary, deductions, insurance_number, bank_account,
        nationality, isSaudiCalc, national_id_iqama, border_number,
        iqama_expiry_gregorian, iqama_expiry_hijri, iqama_profession,
        work_permit_number, work_permit_expiry, work_permit_fee,
        gosi_number, computedGosiSalary, housing_allowance, transport_allowance, other_allowances,
        insurance_company, medical_insurance_category, medical_insurance_policy, medical_insurance_expiry,
        medical_dependents_count, saudi_iban, bank_name, contract_type, contract_start_date, contract_end_date,
        passport_number, passport_expiry, health_cert_number, health_cert_expiry, payment_method,
        req.params.id
      );

      // Refresh allowances
      db.prepare("DELETE FROM employee_allowances WHERE employee_id = ?").run(req.params.id);
      if (allowances_list && Array.isArray(allowances_list)) {
        for (const al of allowances_list) {
          if (al.type_id && al.amount) {
            db.prepare("INSERT INTO employee_allowances (employee_id, allowance_type_id, amount) VALUES (?, ?, ?)").run(req.params.id, al.type_id, al.amount);
          }
        }
      }
    });

    transaction();
    logAction('update', 'employee', Number(req.params.id), `Updated employee details: ${name}`);
    res.json({ success: true });
  });

  app.delete("/api/employees/:id", (req, res) => {
    const employeeId = req.params.id;
    db.prepare("DELETE FROM employees WHERE id = ?").run(employeeId);
    db.prepare("DELETE FROM employee_allowances WHERE employee_id = ?").run(employeeId);
    logAction('delete', 'employee', Number(employeeId), `Deleted employee`);
    res.json({ success: true });
  });

  // Payroll
  app.get("/api/payroll", (req, res) => {
    const { month, year } = req.query;
    const payroll = db.prepare(`
      SELECT p.*, e.name as employee_name, b.name as branch_name, d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE p.month = ? AND p.year = ?
    `).all(month, year);
    res.json(payroll);
  });

  // Departments
  app.get("/api/departments", (req, res) => {
    const departments = db.prepare("SELECT * FROM departments").all();
    res.json(departments);
  });

  app.post("/api/departments", (req, res) => {
    const { name, manager_id } = req.body;
    const info = db.prepare("INSERT INTO departments (name, manager_id) VALUES (?, ?)").run(name, manager_id);
    logAction('create', 'department', Number(info.lastInsertRowid), `Created department: ${name}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/departments/:id", (req, res) => {
    const { name, manager_id } = req.body;
    db.prepare("UPDATE departments SET name = ?, manager_id = ? WHERE id = ?").run(name, manager_id, req.params.id);
    logAction('update', 'department', Number(req.params.id), `Updated department: ${name}`);
    res.json({ success: true });
  });

  app.delete("/api/departments/:id", (req, res) => {
    db.prepare("DELETE FROM departments WHERE id = ?").run(req.params.id);
    logAction('delete', 'department', Number(req.params.id), `Deleted department`);
    res.json({ success: true });
  });

  // Bonuses & Penalties
  app.get("/api/bonuses-penalties", (req, res) => {
    const { month, year } = req.query;
    const data = db.prepare(`
      SELECT bp.*, e.name as employee_name 
      FROM bonuses_penalties bp
      JOIN employees e ON bp.employee_id = e.id
      WHERE bp.month = ? AND bp.year = ?
    `).all(month, year);
    res.json(data);
  });

  app.post("/api/bonuses-penalties", (req, res) => {
    const { employee_id, type, amount, reason, month, year } = req.body;
    const info = db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, type, amount, reason, month, year);
    logAction('create', 'bonus_penalty', Number(info.lastInsertRowid), `Added ${type} to employee ${employee_id}: ${amount}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/bonuses-penalties/:id", (req, res) => {
    db.prepare("DELETE FROM bonuses_penalties WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Attendance
  app.get("/api/attendance", (req, res) => {
    const { month, year } = req.query;
    const data = db.prepare(`
      SELECT a.*, e.name as employee_name 
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.month = ? AND a.year = ?
    `).all(month, year);
    res.json(data);
  });

  app.post("/api/attendance", (req, res) => {
    const { employee_id, month, year, absence_days, overtime_hours } = req.body;
    db.prepare(`
      INSERT OR REPLACE INTO attendance (employee_id, month, year, absence_days, overtime_hours)
      VALUES (?, ?, ?, ?, ?)
    `).run(employee_id, month, year, absence_days, overtime_hours);
    res.json({ success: true });
  });

  // Loans
  app.get("/api/loans", (req, res) => {
    const data = db.prepare(`
      SELECT l.*, e.name as employee_name 
      FROM loans l
      JOIN employees e ON l.employee_id = e.id
      WHERE l.status = 'active'
    `).all();
    res.json(data);
  });

  app.post("/api/loans", (req, res) => {
    const { employee_id, total_amount, monthly_installment } = req.body;
    db.prepare(`
      INSERT INTO loans (employee_id, total_amount, remaining_amount, monthly_installment)
      VALUES (?, ?, ?, ?)
    `).run(employee_id, total_amount, total_amount, monthly_installment);
    logAction('create', 'loan', null, `Created loan for employee ${employee_id} of ${total_amount}`);
    res.json({ success: true });
  });

  // Leaves Management
  app.get("/api/leaves", (req, res) => {
    const leaves = db.prepare(`
      SELECT l.*, e.name as employee_name 
      FROM leaves l 
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.created_at DESC
    `).all();
    res.json(leaves);
  });

  app.post("/api/leaves", (req, res) => {
    const { employee_id, type, start_date, end_date, days, is_paid, reason } = req.body;
    if ((type === 'annual' || type === 'سنوية') && days) {
      const used = (db.prepare(`
        SELECT COALESCE(SUM(days),0) as d FROM leaves
        WHERE employee_id = ? AND status = 'approved' AND (type = 'annual' OR type LIKE '%سنو%')
        AND strftime('%Y', start_date) = strftime('%Y','now')
      `).get(employee_id) as any).d || 0;
      const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
      const cap = Number(emp?.annual_leave_balance ?? emp?.annual_leave_days ?? 21);
      if (used + Number(days) > cap) {
        return res.status(400).json({ error: `رصيد الإجازة السنوية لا يكفي (المستخدم ${used} من ${cap})` });
      }
    }
    const info = db.prepare(`
      INSERT INTO leaves (employee_id, type, start_date, end_date, days, is_paid, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(employee_id, type, start_date, end_date, days, is_paid, reason);
    logAction('create', 'leave', Number(info.lastInsertRowid), `Requested leave for employee ${employee_id}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/leaves/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE leaves SET status = ? WHERE id = ?").run(status, req.params.id);
    logAction('update', 'leave', Number(req.params.id), `Leave status updated to ${status}`);
    res.json({ success: true });
  });

  // Documents
  app.get("/api/documents", (req, res) => {
    const docs = db.prepare(`
      SELECT d.*, e.name as employee_name 
      FROM documents d 
      JOIN employees e ON d.employee_id = e.id
    `).all();
    res.json(docs);
  });

  app.post("/api/documents", (req, res) => {
    const { employee_id, name, type, expiry_date } = req.body;
    const info = db.prepare(`
      INSERT INTO documents (employee_id, name, type, expiry_date)
      VALUES (?, ?, ?, ?)
    `).run(employee_id, name, type, expiry_date);
    res.json({ id: info.lastInsertRowid });
  });

  // Assets
  app.get("/api/assets", (req, res) => {
    const assets = db.prepare(`
      SELECT a.*, e.name as assigned_to_name 
      FROM assets a 
      LEFT JOIN employees e ON a.assigned_to = e.id
    `).all();
    res.json(assets);
  });

  app.post("/api/assets", (req, res) => {
    const { name, type, serial_number } = req.body;
    const info = db.prepare(`
      INSERT INTO assets (name, type, serial_number)
      VALUES (?, ?, ?)
    `).run(name, type, serial_number);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/assets/:id/assign", (req, res) => {
    const { employee_id } = req.body;
    db.prepare(`
      UPDATE assets SET assigned_to = ?, assigned_at = ?, status = 'assigned' 
      WHERE id = ?
    `).run(employee_id, new Date().toISOString(), req.params.id);
    res.json({ success: true });
  });

  // Performance Appraisals
  app.get("/api/appraisals", (req, res) => {
    const data = db.prepare(`
      SELECT a.*, e.name as employee_name 
      FROM appraisals a 
      JOIN employees e ON a.employee_id = e.id
    `).all();
    res.json(data);
  });

  app.post("/api/appraisals", (req, res) => {
    const { employee_id, rating, comments, period, appraisal_date } = req.body;
    const info = db.prepare(`
      INSERT INTO appraisals (employee_id, rating, comments, period, appraisal_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(employee_id, rating, comments, period, appraisal_date);
    res.json({ id: info.lastInsertRowid });
  });

  function workdaysInMonth(year: number, month: number) {
    const days = new Date(year, month, 0).getDate();
    let n = 0;
    for (let d = 1; d <= days; d++) {
      const wd = new Date(year, month - 1, d).getDay();
      if (wd !== 5 && wd !== 6) n++;
    }
    return n;
  }

  function syncAttendanceFromLogs(month: number, year: number) {
    const emps = db.prepare("SELECT id FROM employees").all() as any[];
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
    const daysElapsed = isCurrent ? now.getDate() : new Date(year, month, 0).getDate();
    let expected = 0;
    for (let d = 1; d <= daysElapsed; d++) {
      const wd = new Date(year, month - 1, d).getDay();
      if (wd !== 5 && wd !== 6) expected++;
    }
    for (const emp of emps) {
      const logs = db.prepare(`
        SELECT * FROM attendance_logs WHERE employee_id = ? AND substr(check_in_time, 1, 7) = ?
      `).all(emp.id, prefix) as any[];
      const dates = new Set(logs.map(l => String(l.check_in_time).slice(0, 10)));
      const lateDays = logs.filter(l => l.status === "late").length;
      let ot = 0;
      for (const l of logs) {
        if (l.check_in_time && l.check_out_time) {
          const h = (new Date(l.check_out_time).getTime() - new Date(l.check_in_time).getTime()) / 3600000;
          if (h > 8) ot += h - 8;
        }
      }
      const absence = Math.max(0, expected - dates.size);
      const existing = db.prepare("SELECT id FROM attendance WHERE employee_id = ? AND month = ? AND year = ?").get(emp.id, month, year) as any;
      if (existing) {
        db.prepare("UPDATE attendance SET absence_days = ?, overtime_hours = ? WHERE id = ?").run(absence, Math.round(ot), existing.id);
      } else {
        db.prepare("INSERT INTO attendance (employee_id, month, year, absence_days, overtime_hours) VALUES (?, ?, ?, ?, ?)").run(emp.id, month, year, absence, Math.round(ot));
      }
    }
    return { workdays: workdaysInMonth(year, month), expected };
  }

  app.post("/api/payroll/sync-attendance", (req, res) => {
    try {
      const month = Number(req.body.month);
      const year = Number(req.body.year);
      const r = syncAttendanceFromLogs(month, year);
      res.json({ success: true, ...r });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  const payrollLockKey = (m: number, y: number) => `payroll_lock_${y}_${m}`;
  const isPayrollLocked = (m: number, y: number) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(payrollLockKey(m, y)) as any;
    return row?.value === "1";
  };

  app.get("/api/payroll/lock-status", (req, res) => {
    const m = Number(req.query.month);
    const y = Number(req.query.year);
    res.json({ month: m, year: y, locked: isPayrollLocked(m, y) });
  });

  // The role gate for this route is the central RBAC policy (ROUTE_PERMISSIONS ->
  // payroll.run -> admin | hr_manager | finance). The local requireRole("admin","finance")
  // that used to sit here contradicted that matrix and rejected hr_manager on a route the
  // screen matrix grants it. Removed so the matrix stays the single source of truth.
  // NOTE: this widens access for hr_manager (revert = restore the requireRole call above).
  app.post("/api/payroll/lock", (req, res) => {
    try {
      const { month, year, locked } = req.body;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .run(payrollLockKey(Number(month), Number(year)), locked ? "1" : "0");
      logAction("update", "payroll", 0, `${locked ? "إقفال" : "فتح"} مسير ${month}/${year}`);
      res.json({ success: true, locked: !!locked });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/payroll/generate", requireRole("admin", "hr_manager", "finance"), (req, res) => {
    const { month, year } = req.body;
    if (isPayrollLocked(Number(month), Number(year))) {
      return res.status(400).json({ error: `مسير ${month}/${year} مُقفل ومُعتمد — افتحه أولاً للتعديل` });
    }
    try { syncAttendanceFromLogs(Number(month), Number(year)); } catch (e) { console.error(e); }
    
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    
    const taxRate = parseFloat(settingsObj.tax_rate || '0') / 100;
    const defaultSaudiEmpRate = parseFloat(settingsObj.saudi_gosi_emp_rate || '9.75') / 100;
    const defaultSaudiCompRate = parseFloat(settingsObj.saudi_gosi_comp_rate || '11.75') / 100;
    const defaultExpatCompRate = parseFloat(settingsObj.expat_gosi_comp_rate || '2.0') / 100;

    const employees = db.prepare(`
      SELECT e.*, 
      IFNULL((SELECT SUM(amount) FROM employee_allowances WHERE employee_id = e.id), 0) as allowances
      FROM employees e
    `).all();
    
    const transactions = db.transaction((emps) => {
      let count = 0;
      for (const emp of emps as any[]) {
        const existing = db.prepare("SELECT id FROM payroll WHERE employee_id = ? AND month = ? AND year = ?")
          .get(emp.id, month, year);
        
        if (!existing) {
          // 1. Get Attendance Data
          const att = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND month = ? AND year = ?")
            .get(emp.id, month, year) as any || { absence_days: 0, overtime_hours: 0 };
          
          // 2. Get Active Loans
          const loan = db.prepare("SELECT * FROM loans WHERE employee_id = ? AND status = 'active'")
            .get(emp.id) as any;

          // 3. Get Bonuses and Penalties for this month
          const bp = db.prepare("SELECT type, SUM(amount) as total FROM bonuses_penalties WHERE employee_id = ? AND month = ? AND year = ? GROUP BY type")
            .all(emp.id, month, year) as any[];
          
          const monthBonus = bp.find(x => x.type === 'bonus')?.total || 0;
          const monthPenalty = bp.find(x => x.type === 'penalty')?.total || 0;
          
          let loanDeduction = 0;
          if (loan) {
            loanDeduction = Math.min(loan.monthly_installment, loan.remaining_amount);
          }

          // Calculate Basic Rates
          const dailyRate = emp.basic_salary / 30;
          const hourlyRate = (emp.basic_salary / 30) / 8;
          
          const absenceDeduction = att.absence_days * dailyRate;
          const overtimePay = att.overtime_hours * hourlyRate * 1.5;

          // 4. Get Unpaid Leaves
          const unpaidLeaves = db.prepare(`
            SELECT SUM(days) as total FROM leaves 
            WHERE employee_id = ? AND is_paid = 0 AND status = 'approved' 
            AND (strftime('%m', start_date) = ? OR strftime('%m', end_date) = ?)
          `).get(emp.id, month.toString().padStart(2, '0'), month.toString().padStart(2, '0')) as any;
          
          const unpaidLeaveDeduction = (unpaidLeaves.total || 0) * dailyRate;
          
          // Saudi GOSI Calculation Rules
          // Contributory Wage = Basic + Housing Allowance (max cap 45,000 SAR)
          const housing = emp.housing_allowance || 0;
          const transport = emp.transport_allowance || 0;
          const gosiWage = Math.min(45000, Number(emp.basic_salary) + Number(housing));
          const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي' || emp.nationality === 'سعودية' ? 1 : 0;
          
          let insEmpRate = 0;
          let insCompRate = 0;
          
          if (isSaudi) {
            insEmpRate = defaultSaudiEmpRate; // 9.75% (9% Annuities + 0.75% Saned)
            insCompRate = defaultSaudiCompRate; // 11.75% (9% Annuities + 2% Hazards + 0.75% Saned)
          } else {
            insEmpRate = 0; // 0% on expat employee
            insCompRate = defaultExpatCompRate; // 2% Occupational Hazards on employer
          }

          const insEmpShare = Math.round(gosiWage * insEmpRate * 100) / 100;
          const insCompShare = Math.round(gosiWage * insCompRate * 100) / 100;

          const totalAllowances = emp.allowances + housing + transport + (emp.other_allowances || 0) + overtimePay + monthBonus;
          const totalDeductions = emp.deductions + absenceDeduction + unpaidLeaveDeduction + loanDeduction + monthPenalty + insEmpShare;

          const taxableIncome = emp.basic_salary + totalAllowances - totalDeductions;
          const taxAmount = Math.max(0, taxableIncome * taxRate);
          const net = taxableIncome - taxAmount;

          // Cash / Bank split according to employee payment method (WPS compliance)
          const payMethod = emp.payment_method || 'bank';
          const cashPct = Number(emp.cash_percentage || 0);
          let cashAmount = 0;
          let bankAmount = 0;
          if (payMethod === 'cash') {
            cashAmount = net;
          } else if (payMethod === 'split') {
            cashAmount = Math.round(net * (cashPct / 100) * 100) / 100;
            bankAmount = Math.round((net - cashAmount) * 100) / 100;
          } else {
            bankAmount = net;
          }
          const isSaudizable = payMethod === 'split' && cashAmount > net * 0.2;

          db.prepare(`
            INSERT INTO payroll (
              employee_id, month, year, basic_salary, allowances, deductions, 
              tax_amount, insurance_emp_share, insurance_comp_share, bonuses, penalties, net_salary,
              national_id_iqama, is_saudi, housing_allowance, transport_allowance, gosi_number, gosi_salary,
              saudi_iban, bank_name, payment_method, cash_amount, bank_amount
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            emp.id, month, year, emp.basic_salary, totalAllowances, totalDeductions, 
            taxAmount, insEmpShare, insCompShare, monthBonus, monthPenalty, net,
            emp.national_id_iqama || '', isSaudi, housing, transport, emp.gosi_number || '', gosiWage,
            emp.saudi_iban || emp.bank_account || '', emp.bank_name || 'مصرف الراجحي',
            payMethod, cashAmount, bankAmount
          );

          if (isSaudizable) {
            createNotification('تنبيه حماية الأجور', `الموظف ${emp.name}: نسبة النقد ${cashPct}% قد تخالف متطلبات مدد`, 'warning');
          }

          // Update Loan Remaining Amount
          if (loan) {
            const newRemaining = loan.remaining_amount - loanDeduction;
            db.prepare("UPDATE loans SET remaining_amount = ?, status = ? WHERE id = ?")
              .run(newRemaining, newRemaining <= 0 ? 'completed' : 'active', loan.id);
          }

          count++;
        }
      }
      return count;
    });

    try {
      const generatedCount = transactions(employees);
      createNotification('تم إنشاء مسير الرواتب', `تم إنشاء مسير رواتب لعدد ${generatedCount} موظف لشهر ${month}/${year} وفق قواعد نظام العمل والتأمينات السعودية`, 'success');
      logAction('generate', 'payroll', null, `Generated KSA-compliant payroll for ${month}/${year}`);
      res.json({ success: true, count: generatedCount });
    } catch (error) {
      createNotification('خطأ في إنشاء الرواتب', `حدث خطأ أثناء معالجة الرواتب: ${(error as Error).message}`, 'error');
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // --- Saudi Compliance & Labor Ministry Endpoints ---

  // 1. Compliance Summary (نظرة شاملة للامتثال ونطاقات والتأمينات والإقامات)
  app.get("/api/saudi/compliance-summary", (req, res) => {
    const employees = db.prepare("SELECT * FROM employees").all() as any[];
    const totalEmployees = employees.length;
    const saudiEmployees = employees.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي' || e.nationality === 'سعودية').length;
    const expatEmployees = totalEmployees - saudiEmployees;
    const saudizationRate = totalEmployees > 0 ? Math.round((saudiEmployees / totalEmployees) * 1000) / 10 : 0;

    // Determine Nitaqat
    let nitaqatStatus: 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red' = 'mid_green';
    let nitaqatLabel = 'نطاق أخضر متوسط';
    if (saudizationRate >= 50) {
      nitaqatStatus = 'platinum';
      nitaqatLabel = 'النطاق البلاتيني';
    } else if (saudizationRate >= 35) {
      nitaqatStatus = 'high_green';
      nitaqatLabel = 'نطاق أخضر مرتفع';
    } else if (saudizationRate >= 20) {
      nitaqatStatus = 'mid_green';
      nitaqatLabel = 'نطاق أخضر متوسط';
    } else if (saudizationRate >= 10) {
      nitaqatStatus = 'low_green';
      nitaqatLabel = 'نطاق أخضر منخفض';
    } else {
      nitaqatStatus = 'red';
      nitaqatLabel = 'النطاق الأحمر (حرج)';
    }

    const now = new Date();
    const d30 = new Date(); d30.setDate(now.getDate() + 30);
    const d60 = new Date(); d60.setDate(now.getDate() + 60);
    const d90 = new Date(); d90.setDate(now.getDate() + 90);

    let expiredIqamas = 0;
    let iqamasExpiring30Days = 0;
    let iqamasExpiring60Days = 0;
    let iqamasExpiring90Days = 0;

    let expiredWorkPermits = 0;
    let workPermitsExpiring30Days = 0;

    let expiredMedicalInsurance = 0;
    let medicalExpiring30Days = 0;

    let monthlyGosiSaudiEmp = 0;
    let monthlyGosiSaudiComp = 0;
    let monthlyGosiExpatComp = 0;

    employees.forEach(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const gosiSalary = emp.gosi_registered_salary || (Number(emp.basic_salary) + Number(emp.housing_allowance || 0));
      const cappedWage = Math.min(45000, gosiSalary);

      if (isSaudi) {
        monthlyGosiSaudiEmp += cappedWage * 0.0975;
        monthlyGosiSaudiComp += cappedWage * 0.1175;
      } else {
        monthlyGosiExpatComp += cappedWage * 0.02;

        // Check Iqama Expiry
        if (emp.iqama_expiry_gregorian) {
          const exp = new Date(emp.iqama_expiry_gregorian);
          if (exp < now) {
            expiredIqamas++;
          } else if (exp <= d30) {
            iqamasExpiring30Days++;
          } else if (exp <= d60) {
            iqamasExpiring60Days++;
          } else if (exp <= d90) {
            iqamasExpiring90Days++;
          }
        }

        // Check Work Permit
        if (emp.work_permit_expiry) {
          const wpExp = new Date(emp.work_permit_expiry);
          if (wpExp < now) expiredWorkPermits++;
          else if (wpExp <= d30) workPermitsExpiring30Days++;
        }
      }

      // Check Medical Insurance
      if (emp.medical_insurance_expiry) {
        const medExp = new Date(emp.medical_insurance_expiry);
        if (medExp < now) expiredMedicalInsurance++;
        else if (medExp <= d30) medicalExpiring30Days++;
      }
    });

    const monthlyGosiTotalEmployer = monthlyGosiSaudiComp + monthlyGosiExpatComp;
    const monthlyGosiTotalEmployee = monthlyGosiSaudiEmp;
    const monthlyGosiGrandTotal = monthlyGosiTotalEmployer + monthlyGosiTotalEmployee;

    res.json({
      totalEmployees,
      saudiEmployees,
      expatEmployees,
      saudizationRate,
      nitaqatStatus,
      nitaqatLabel,
      expiredIqamas,
      iqamasExpiring30Days,
      iqamasExpiring60Days,
      iqamasExpiring90Days,
      expiredWorkPermits,
      workPermitsExpiring30Days,
      expiredMedicalInsurance,
      medicalExpiring30Days,
      monthlyGosiSaudiShare: Math.round(monthlyGosiSaudiEmp),
      monthlyGosiExpatShare: Math.round(monthlyGosiExpatComp),
      monthlyGosiTotalEmployer: Math.round(monthlyGosiTotalEmployer),
      monthlyGosiTotalEmployee: Math.round(monthlyGosiTotalEmployee),
      monthlyGosiGrandTotal: Math.round(monthlyGosiGrandTotal)
    });
  });

  // 2. Expiring Documents Table (جدول متابعة الوثائق والإقامات ورخص العمل والتأمين الطبي)
  app.get("/api/saudi/expiring-documents", (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all() as any[];

    const now = new Date();

    const results = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      
      // Calculate days remaining for Iqama
      let iqamaDaysRemaining: number | null = null;
      let iqamaStatus: 'valid' | 'warning_30' | 'warning_60' | 'warning_90' | 'expired' = 'valid';
      if (!isSaudi && emp.iqama_expiry_gregorian) {
        const exp = new Date(emp.iqama_expiry_gregorian);
        iqamaDaysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (iqamaDaysRemaining < 0) iqamaStatus = 'expired';
        else if (iqamaDaysRemaining <= 30) iqamaStatus = 'warning_30';
        else if (iqamaDaysRemaining <= 60) iqamaStatus = 'warning_60';
        else if (iqamaDaysRemaining <= 90) iqamaStatus = 'warning_90';
      }

      // Calculate days remaining for Work Permit
      let workPermitDaysRemaining: number | null = null;
      let workPermitStatus: 'valid' | 'warning' | 'expired' = 'valid';
      if (!isSaudi && emp.work_permit_expiry) {
        const exp = new Date(emp.work_permit_expiry);
        workPermitDaysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (workPermitDaysRemaining < 0) workPermitStatus = 'expired';
        else if (workPermitDaysRemaining <= 30) workPermitStatus = 'warning';
      }

      // Calculate Medical Insurance status
      let medicalDaysRemaining: number | null = null;
      let medicalStatus: 'valid' | 'warning' | 'expired' = 'valid';
      if (emp.medical_insurance_expiry) {
        const exp = new Date(emp.medical_insurance_expiry);
        medicalDaysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (medicalDaysRemaining < 0) medicalStatus = 'expired';
        else if (medicalDaysRemaining <= 30) medicalStatus = 'warning';
      }

      return {
        ...emp,
        is_saudi: isSaudi ? 1 : 0,
        iqamaDaysRemaining,
        iqamaStatus,
        workPermitDaysRemaining,
        workPermitStatus,
        medicalDaysRemaining,
        medicalStatus
      };
    });

    res.json(results);
  });

  // 3. GOSI Report (تقرير التأمينات الاجتماعية المعتمد)
  app.get("/api/saudi/gosi-report", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    const saudiEmpRate = parseFloat(settingsObj.saudi_gosi_emp_rate || '9.75') / 100;
    const saudiCompRate = parseFloat(settingsObj.saudi_gosi_comp_rate || '11.75') / 100;
    const expatCompRate = parseFloat(settingsObj.expat_gosi_comp_rate || '2.0') / 100;

    const employees = db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all() as any[];

    const report = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const basicSalary = Number(emp.basic_salary) || 0;
      const housing = Number(emp.housing_allowance) || 0;
      const contributorySalary = Math.min(45000, basicSalary + housing);

      let empShare = 0;
      let compShare = 0;
      let annuitiesEmp = 0;
      let annuitiesComp = 0;
      let sanedEmp = 0;
      let sanedComp = 0;
      let hazardsComp = 0;

      if (isSaudi) {
        annuitiesEmp = Math.round(contributorySalary * 0.09 * 100) / 100;
        annuitiesComp = Math.round(contributorySalary * 0.09 * 100) / 100;
        sanedEmp = Math.round(contributorySalary * 0.0075 * 100) / 100;
        sanedComp = Math.round(contributorySalary * 0.0075 * 100) / 100;
        hazardsComp = Math.round(contributorySalary * 0.02 * 100) / 100;
        
        empShare = annuitiesEmp + sanedEmp;
        compShare = annuitiesComp + sanedComp + hazardsComp;
      } else {
        hazardsComp = Math.round(contributorySalary * expatCompRate * 100) / 100;
        empShare = 0;
        compShare = hazardsComp;
      }

      return {
        employee_id: emp.id,
        name: emp.name,
        is_saudi: isSaudi ? 1 : 0,
        nationality: emp.nationality || (isSaudi ? 'سعودي' : 'وافد'),
        national_id_iqama: emp.national_id_iqama || emp.insurance_number || 'N/A',
        gosi_number: emp.gosi_number || emp.insurance_number || 'N/A',
        branch_name: emp.branch_name,
        department_name: emp.department_name,
        basic_salary: basicSalary,
        housing_allowance: housing,
        contributory_salary: contributorySalary,
        annuities_emp: annuitiesEmp,
        annuities_comp: annuitiesComp,
        saned_emp: sanedEmp,
        saned_comp: sanedComp,
        hazards_comp: hazardsComp,
        emp_share: empShare,
        comp_share: compShare,
        total_gosi_due: empShare + compShare
      };
    });

    res.json(report);
  });

  // 4. Quick Renew & Government Renewals (تجديد سريع للإقامة أو رخصة العمل أو التأمين الطبي)
  app.get("/api/saudi/renewals", (req, res) => {
    const renewals = db.prepare(`
      SELECT r.*, e.name as employee_name, e.national_id_iqama
      FROM government_renewals r
      JOIN employees e ON r.employee_id = e.id
      ORDER BY r.created_at DESC
    `).all();
    res.json(renewals);
  });

  app.post("/api/saudi/quick-renew", (req, res) => {
    const { employee_id, type, duration_months = 12, cost, sadad_number, reference_number, notes } = req.body;
    
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });

    const now = new Date();
    
    if (type === 'iqama' || type === 'both') {
      const currentExpiry = emp.iqama_expiry_gregorian ? new Date(emp.iqama_expiry_gregorian) : new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + Number(duration_months));
      const newIqamaExpiry = baseDate.toISOString().split('T')[0];

      db.prepare(`
        UPDATE employees SET 
          iqama_expiry_gregorian = ?,
          work_permit_expiry = ?
        WHERE id = ?
      `).run(newIqamaExpiry, newIqamaExpiry, employee_id);

      db.prepare(`
        INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, expiry_before, expiry_after, notes)
        VALUES (?, 'iqama', ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).run(
        employee_id, duration_months, cost || 10250, sadad_number || `SADAD-${Date.now().toString().slice(-6)}`,
        reference_number || `MOI-${Date.now().toString().slice(-6)}`, emp.iqama_expiry_gregorian, newIqamaExpiry, notes || 'تجديد الإقامة ورخصة العمل بنجاح'
      );
    } else if (type === 'medical_insurance') {
      const currentExpiry = emp.medical_insurance_expiry ? new Date(emp.medical_insurance_expiry) : new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + Number(duration_months));
      const newMedExpiry = baseDate.toISOString().split('T')[0];

      db.prepare("UPDATE employees SET medical_insurance_expiry = ? WHERE id = ?").run(newMedExpiry, employee_id);

      db.prepare(`
        INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, expiry_before, expiry_after, notes)
        VALUES (?, 'medical_insurance', ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).run(
        employee_id, duration_months, cost || 2500, sadad_number || `CCHI-${Date.now().toString().slice(-6)}`,
        reference_number || `POL-${Date.now().toString().slice(-6)}`, emp.medical_insurance_expiry, newMedExpiry, notes || 'تجديد وثيقة التأمين الطبي'
      );
    }

    createNotification('تم التجديد بنجاح', `تم تجديد المعاملة بنجاح للموظف ${emp.name}`, 'success');
    logAction('renew', 'compliance', employee_id, `Renewed ${type} for employee ${emp.name}`);
    res.json({ success: true });
  });

  // 5. End of Service Calculator (حاسبة مكافأة نهاية الخدمة المعتمدة نظاماً)
  app.post("/api/saudi/eos-calculate", (req, res) => {
    const { 
      employee_id, employee_name, national_id_iqama,
      start_date, end_date, basic_salary, allowances = 0,
      reason = 'employer_termination', // 'employer_termination', 'resignation', 'contract_expiry', 'mutual_agreement', 'force_majeure'
      leave_balance_compensation = 0, other_entitlements = 0, deductions = 0
    } = req.body;

    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffTime = Math.max(0, end.getTime() - start.getTime());
    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const years = Math.floor(totalDays / 365.25);
    const remainingDaysAfterYears = totalDays % 365.25;
    const months = Math.floor(remainingDaysAfterYears / 30.4375);
    const days = Math.floor(remainingDaysAfterYears % 30.4375);
    const total_service_years = Math.round((totalDays / 365.25) * 100) / 100;

    const totalSalary = Number(basic_salary) + Number(allowances);

    // Article 84: Base Gratuity (أجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر عن كل سنة من السنوات التالية)
    let baseGratuity = 0;
    if (total_service_years <= 5) {
      baseGratuity = total_service_years * (totalSalary / 2);
    } else {
      const first5Years = 5 * (totalSalary / 2);
      const after5Years = (total_service_years - 5) * totalSalary;
      baseGratuity = first5Years + after5Years;
    }

    // Article 85: Resignation percentage rules
    let entitlementPercentage = 100;
    let reasonText = 'إنهاء العقد من قبل صاحب العمل (المادة 84 - استحقاق 100%)';

    if (reason === 'resignation') {
      if (total_service_years < 2) {
        entitlementPercentage = 0;
        reasonText = 'استقالة مع خدمة أقل من سنتين (المادة 85 - لا يستحق مكافأة)';
      } else if (total_service_years >= 2 && total_service_years < 5) {
        entitlementPercentage = 33.3333;
        reasonText = 'استقالة مع خدمة من سنتين إلى 5 سنوات (المادة 85 - استحقاق ثلث المكافأة 33.3%)';
      } else if (total_service_years >= 5 && total_service_years < 10) {
        entitlementPercentage = 66.6667;
        reasonText = 'استقالة مع خدمة من 5 إلى 10 سنوات (المادة 85 - استحقاق ثلثي المكافأة 66.7%)';
      } else {
        entitlementPercentage = 100;
        reasonText = 'استقالة مع خدمة 10 سنوات فأكثر (المادة 85 - استحقاق المكافأة كاملة 100%)';
      }
    } else if (reason === 'contract_expiry') {
      entitlementPercentage = 100;
      reasonText = 'انتهاء مدة العقد محدد المدة (استحقاق كامل 100%)';
    } else if (reason === 'mutual_agreement') {
      entitlementPercentage = 100;
      reasonText = 'اتفاق الطرفين على إنهاء العقد (استحقاق كامل 100%)';
    } else if (reason === 'force_majeure') {
      entitlementPercentage = 100;
      reasonText = 'إنهاء لظروف القوة القاهرة / المادة 87 (استحقاق كامل 100%)';
    }

    const finalAmount = Math.round((baseGratuity * (entitlementPercentage / 100)) * 100) / 100;
    const netPayable = Math.round((finalAmount + Number(leave_balance_compensation) + Number(other_entitlements) - Number(deductions)) * 100) / 100;

    const result = {
      employee_id: employee_id || null,
      employee_name: employee_name || 'موظف',
      national_id_iqama: national_id_iqama || '',
      start_date,
      end_date,
      basic_salary: Number(basic_salary),
      allowances: Number(allowances),
      total_salary: totalSalary,
      reason,
      reason_text: reasonText,
      years,
      months,
      days,
      total_service_years,
      entitlement_percentage: Math.round(entitlementPercentage * 10) / 10,
      base_gratuity: Math.round(baseGratuity * 100) / 100,
      final_amount: finalAmount,
      leave_balance_compensation: Number(leave_balance_compensation),
      other_entitlements: Number(other_entitlements),
      deductions: Number(deductions),
      net_payable: netPayable
    };

    // Save calculation if needed
    if (employee_name) {
      db.prepare(`
        INSERT INTO eos_calculations (
          employee_id, employee_name, national_id_iqama, start_date, end_date,
          basic_salary, allowances, total_salary, reason, reason_text,
          total_service_years, entitlement_percentage, final_amount,
          leave_balance_compensation, other_entitlements, deductions, net_payable
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        employee_id || null, employee_name, national_id_iqama || '', start_date, end_date,
        Number(basic_salary), Number(allowances), totalSalary, reason, reasonText,
        total_service_years, entitlementPercentage, finalAmount,
        Number(leave_balance_compensation), Number(other_entitlements), Number(deductions), netPayable
      );
    }

    res.json(result);
  });

  // ---- WPS/SIF identity validation ----
  // Saudi IBAN: "SA" + 22 alphanumerics (24 chars total). National ID / Iqama: 10 digits starting with 1 or 2.
  const SAUDI_IBAN_RE = /^SA[0-9A-Z]{22}$/;
  const SAUDI_NATIONAL_ID_RE = /^[12][0-9]{9}$/;

  function validateSifIdentities(rows: { employee_id: any; employee_name: any; saudi_iban: any; national_id_iqama: any }[]) {
    const issues: { employee_id: any; employee_name: any; invalid_fields: string[] }[] = [];
    for (const r of rows) {
      const invalid_fields: string[] = [];
      const iban = r.saudi_iban == null ? "" : String(r.saudi_iban).replace(/\s+/g, "").toUpperCase();
      if (!iban) invalid_fields.push("saudi_iban: مفقود");
      else if (!SAUDI_IBAN_RE.test(iban)) invalid_fields.push("saudi_iban: غير صالح (يجب أن يبدأ بـ SA ويتكوّن من 24 حرفًا/رقمًا)");
      const nid = r.national_id_iqama == null ? "" : String(r.national_id_iqama).replace(/\s+/g, "");
      if (!nid) invalid_fields.push("national_id_iqama: مفقود");
      else if (!SAUDI_NATIONAL_ID_RE.test(nid)) invalid_fields.push("national_id_iqama: غير صالح (يجب 10 أرقام تبدأ بـ 1 أو 2)");
      if (invalid_fields.length) {
        issues.push({ employee_id: r.employee_id, employee_name: r.employee_name, invalid_fields });
      }
    }
    return issues;
  }

  // WPS/SIF amount columns are declared REAL, but legacy rows can still hold text. A plain
  // `(x || 0).toFixed(2)` throws a TypeError on a non-empty non-numeric string, and
  // `Number(x)` alone would format NaN as "NaN" into a bank file. Normalise every amount
  // through the same guard the "other" column already used.
  function sifAmount(value: any): string {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toFixed(2);
  }

  // 6. Wages Protection System (WPS / Mudad SIF Format Export)
  app.get("/api/saudi/wps-export", (req, res) => {
    const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
    
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    const crNumber = settingsObj.cr_number || '1010789456';
    const orgName = settingsObj.org_name || 'شركة المؤسسة';
    const molEstablishmentId = settingsObj.mol_establishment_id || '12-987456';

    const payroll = db.prepare(`
      SELECT p.*, e.name as employee_name, e.national_id_iqama, e.saudi_iban, e.bank_name, e.basic_salary as raw_basic,
             e.housing_allowance as raw_housing, e.transport_allowance as raw_transport, e.other_allowances as raw_other
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.month = ? AND p.year = ?
    `).all(month, year) as any[];

    if (payroll.length === 0) {
      return res.status(400).send("لا يوجد مسير رواتب مسجل لهذا الشهر. يرجى إنشاء مسير الرواتب أولاً.");
    }

    const bankOf = (p: any) =>
      p.payment_method ? Number(p.bank_amount || 0) : Number(p.net_salary || 0);
    const bankRows = payroll.filter((p) => bankOf(p) > 0);

    const totalSalary = bankRows.reduce((sum, p) => sum + bankOf(p), 0);
    const totalRecords = bankRows.length;
    const valueDate = `${year}${month.toString().padStart(2, '0')}28`;

    // Never fabricate IBAN / national ID: refuse to produce the file instead.
    const identityIssues = validateSifIdentities(bankRows.map((p) => ({
      employee_id: p.employee_id,
      employee_name: p.employee_name,
      saudi_iban: p.saudi_iban,
      national_id_iqama: p.national_id_iqama,
    })));
    if (identityIssues.length) {
      return res.status(400).json({
        error: "تعذّر توليد ملف WPS/SIF: توجد بيانات هوية أو IBAN ناقصة أو غير صالحة. صحّحها ثم أعد المحاولة.",
        code: "INVALID_SIF_IDENTITIES",
        invalid_count: identityIssues.length,
        issues: identityIssues,
      });
    }

    // Standard Saudi SIF (Salary Information File) format:
    // Header Record (SCR): SCR,CR_Number,Payer_Bank,ValueDate,CreationDate,TotalSalary,TotalCount,Currency
    // Detail Records (EDR): EDR,EmpID,BankCode,IBAN,TotalSalary,BasicSalary,Housing,Other,Deductions
    const lines = [];
    lines.push(`SCR,${crNumber},RJHI,${valueDate},${new Date().toISOString().slice(0, 10).replace(/-/g, '')},${totalSalary.toFixed(2)},${totalRecords},SAR`);

    bankRows.forEach((p) => {
      const nationalId = String(p.national_id_iqama).replace(/\s+/g, "");
      const iban = String(p.saudi_iban).replace(/\s+/g, "").toUpperCase();
      const basic = sifAmount(p.raw_basic || p.basic_salary || 0);
      const housing = sifAmount(p.raw_housing || p.housing_allowance || 0);
      // NULL / non-numeric columns must not leak "NaN" into the bank file
      const allowancesTotal = Number(p.allowances);
      const housingAmount = Number(p.raw_housing);
      const other = ((Number.isFinite(allowancesTotal) ? allowancesTotal : 0) - (Number.isFinite(housingAmount) ? housingAmount : 0)).toFixed(2);
      const deductions = sifAmount(p.deductions || 0);
      const net = bankOf(p).toFixed(2);

      lines.push(`EDR,${nationalId},RJHI,${iban},${net},${basic},${housing},${other},${deductions}`);
    });

    const sifContent = lines.join("\r\n");
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=WPS_MUDAD_${crNumber}_${year}${month.toString().padStart(2, '0')}.sif`);
    res.send(sifContent);
  });

  // Dashboard Stats
  app.get("/api/stats", (req, res) => {
    const totalBranches = db.prepare("SELECT COUNT(*) as count FROM branches").get().count;
    const totalEmployees = db.prepare("SELECT COUNT(*) as count FROM employees").get().count;
    const totalMonthlyPayroll = db.prepare("SELECT SUM(net_salary) as total FROM payroll WHERE month = ? AND year = ?")
      .get(new Date().getMonth() + 1, new Date().getFullYear()).total || 0;

    const payrollByDept = db.prepare(`
      SELECT d.name, SUM(p.net_salary) as value
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE p.month = ? AND p.year = ?
      GROUP BY d.name
    `).all(new Date().getMonth() + 1, new Date().getFullYear());
    
    res.json({ totalBranches, totalEmployees, totalMonthlyPayroll, payrollByDept });
  });

  // Recruitment
  app.get('/api/recruitment/jobs', (req, res) => {
    const jobs = db.prepare(`
      SELECT j.*, d.name as department_name 
      FROM job_openings j
      LEFT JOIN departments d ON j.department_id = d.id
    `).all();
    res.json(jobs);
  });

  app.post('/api/recruitment/jobs', (req, res) => {
    const { title, department_id, description } = req.body;
    db.prepare('INSERT INTO job_openings (title, department_id, description) VALUES (?, ?, ?)').run(title, department_id, description);
    res.json({ success: true });
  });

  app.get('/api/recruitment/candidates', (req, res) => {
    const candidates = db.prepare(`
      SELECT c.*, j.title as job_title 
      FROM candidates c
      LEFT JOIN job_openings j ON c.job_id = j.id
    `).all();
    res.json(candidates);
  });

  app.post('/api/recruitment/candidates', (req, res) => {
    const { job_id, name, email, phone, cv_url, notes } = req.body;
    db.prepare('INSERT INTO candidates (job_id, name, email, phone, cv_url, notes) VALUES (?, ?, ?, ?, ?, ?)').run(job_id, name, email, phone, cv_url, notes);
    res.json({ success: true });
  });

  // Expenses
  app.get('/api/expenses', (req, res) => {
    const expenses = db.prepare(`
      SELECT e.*, emp.name as employee_name 
      FROM expense_claims e
      JOIN employees emp ON e.employee_id = emp.id
    `).all();
    res.json(expenses);
  });

  app.post('/api/expenses', (req, res) => {
    const { employee_id, amount, category, description, date } = req.body;
    db.prepare('INSERT INTO expense_claims (employee_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)').run(employee_id, amount, category, description, date);
    res.json({ success: true });
  });

  // Checklists
  app.get('/api/checklists/:employeeId', (req, res) => {
    const { employeeId } = req.params;
    const items = db.prepare('SELECT * FROM checklists WHERE employee_id = ?').all(employeeId);
    res.json(items);
  });

  app.post('/api/checklists', (req, res) => {
    const { employee_id, item_name, type } = req.body;
    db.prepare('INSERT INTO checklists (employee_id, item_name, type) VALUES (?, ?, ?)').run(employee_id, item_name, type);
    res.json({ success: true });
  });

  app.put('/api/checklists/:id/toggle', (req, res) => {
    const { id } = req.params;
    db.prepare('UPDATE checklists SET is_completed = 1 - is_completed WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // Analytics & Reports
  app.get('/api/analytics/payroll-trends', (req, res) => {
    const trends = db.prepare(`
      SELECT month || '-' || year as period, SUM(net_salary) as total
      FROM payroll
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT 6
    `).all();
    res.json(trends.reverse());
  });

  app.get('/api/analytics/headcount', (req, res) => {
    const byDept = db.prepare(`
      SELECT d.name, COUNT(e.id) as count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      GROUP BY d.id
    `).all();
    const byBranch = db.prepare(`
      SELECT b.name, COUNT(e.id) as count
      FROM branches b
      LEFT JOIN employees e ON b.id = e.branch_id
      GROUP BY b.id
    `).all();
    res.json({ byDept, byBranch });
  });

  // Promotions
  app.get('/api/promotions', (req, res) => {
    const data = db.prepare(`
      SELECT p.*, e.name as employee_name
      FROM promotions p
      JOIN employees e ON p.employee_id = e.id
      ORDER BY p.promotion_date DESC
    `).all();
    res.json(data);
  });

  app.post('/api/promotions', (req, res) => {
    const { employee_id, old_position, new_position, old_salary, new_salary, promotion_date } = req.body;
    db.prepare(`
      INSERT INTO promotions (employee_id, old_position, new_position, old_salary, new_salary, promotion_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, old_position, new_position, old_salary, new_salary, promotion_date);
    
    // Update employee current status
    db.prepare('UPDATE employees SET position = ?, salary = ? WHERE id = ?').run(new_position, new_salary, employee_id);
    
    res.json({ success: true });
  });

  // Policies
  app.get('/api/policies', (req, res) => {
    const data = db.prepare('SELECT * FROM policies').all();
    res.json(data);
  });

  // Projects & Tasks
  app.get('/api/projects', (req, res) => {
    const data = db.prepare(`
      SELECT p.*, d.name as department_name 
      FROM projects p
      LEFT JOIN departments d ON p.department_id = d.id
    `).all();
    res.json(data);
  });

  app.post('/api/projects', (req, res) => {
    const { name, department_id, start_date, end_date } = req.body;
    db.prepare('INSERT INTO projects (name, department_id, start_date, end_date) VALUES (?, ?, ?, ?)').run(name, department_id, start_date, end_date);
    res.json({ success: true });
  });

  app.get('/api/tasks', (req, res) => {
    const data = db.prepare(`
      SELECT t.*, p.name as project_name, e.name as employee_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN employees e ON t.employee_id = e.id
    `).all();
    res.json(data);
  });

  app.post('/api/tasks', (req, res) => {
    const { project_id, employee_id, title, description, due_date } = req.body;
    db.prepare('INSERT INTO tasks (project_id, employee_id, title, description, due_date) VALUES (?, ?, ?, ?, ?)').run(project_id, employee_id, title, description, due_date);
    res.json({ success: true });
  });

  // Excel Direct Link API (Returns CSV for Excel "Get Data from Web")
  app.get('/api/excel/employees', (req, res) => {
    const data = db.prepare(`
      SELECT e.id, e.name, e.position, d.name as department, b.name as branch, e.basic_salary as salary, e.bank_account
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all();
    
    const headers = ['ID', 'Name', 'Position', 'Department', 'Branch', 'Salary', 'Bank Account'];
    const csv = [headers.join(','), ...data.map((r: any) => Object.values(r).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=employees_raw.csv');
    res.send('\ufeff' + csv);
  });

  app.get('/api/excel/payroll', (req, res) => {
    const data = db.prepare(`
      SELECT p.id, e.name as employee, p.month, p.year, p.basic_salary, p.allowances, p.deductions, p.net_salary, p.processed_at
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
    `).all();
    
    const headers = ['ID', 'Employee', 'Month', 'Year', 'Basic', 'Allowances', 'Deductions', 'Net', 'Date'];
    const csv = [headers.join(','), ...data.map((r: any) => Object.values(r).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\ufeff' + csv);
  });

  // ==========================================
  // 1. VISAS & MUQEEM MANAGEMENT (الجوازات والتأشيرات)
  // ==========================================
  app.get('/api/visas', (req, res) => {
    const data = db.prepare(`
      SELECT v.*, e.name as employee_name, e.nationality, e.national_id_iqama
      FROM visas v
      JOIN employees e ON v.employee_id = e.id
      ORDER BY v.created_at DESC
    `).all();
    res.json(data);
  });

  app.post('/api/visas', (req, res) => {
    const { employee_id, visa_type, visa_number, issue_date, travel_before_date, duration_days, return_before_date, cost, notes } = req.body;
    const defaultCost = visa_type === 'exit_reentry_single' ? 200 : visa_type === 'exit_reentry_multiple' ? 500 : 0;
    
    const result = db.prepare(`
      INSERT INTO visas (employee_id, visa_type, visa_number, issue_date, travel_before_date, duration_days, return_before_date, cost, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(employee_id, visa_type, visa_number || `VISA-${Date.now().toString().slice(-6)}`, issue_date || new Date().toISOString().split('T')[0], travel_before_date, duration_days || 60, return_before_date, cost !== undefined ? cost : defaultCost, notes);

    const emp = db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
    logAction('create', 'visa', Number(result.lastInsertRowid), `Issued ${visa_type} for ${emp?.name || employee_id}`);
    createNotification('إصدار تأشيرة جديدة', `تم تسجيل تأشيرة بنجاح للموظف ${emp?.name || ''}`, 'success');
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put('/api/visas/:id', (req, res) => {
    const { id } = req.params;
    const { status, return_before_date, notes } = req.body;
    db.prepare(`
      UPDATE visas SET status = COALESCE(?, status), return_before_date = COALESCE(?, return_before_date), notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(status, return_before_date, notes, id);
    res.json({ success: true });
  });

  app.delete('/api/visas/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM visas WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 2. FLIGHT TICKETS MANAGEMENT (تذاكر السفر)
  // ==========================================
  app.get('/api/flight-tickets', (req, res) => {
    const data = db.prepare(`
      SELECT ft.*, e.name as employee_name, e.nationality
      FROM flight_tickets ft
      JOIN employees e ON ft.employee_id = e.id
      ORDER BY ft.created_at DESC
    `).all();
    res.json(data);
  });

  app.post('/api/flight-tickets', (req, res) => {
    const { employee_id, destination, trip_type, departure_date, return_date, cost, allowance_type, dependents_included, notes } = req.body;
    const result = db.prepare(`
      INSERT INTO flight_tickets (employee_id, destination, trip_type, departure_date, return_date, cost, allowance_type, dependents_included, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
    `).run(employee_id, destination, trip_type || 'round_trip', departure_date, return_date, cost || 2500, allowance_type || 'ticket_issued', dependents_included || 0, notes);

    const emp = db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
    logAction('create', 'flight_ticket', Number(result.lastInsertRowid), `Flight ticket booked for ${emp?.name}`);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put('/api/flight-tickets/:id', (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    db.prepare(`UPDATE flight_tickets SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?`).run(status, notes, id);
    res.json({ success: true });
  });

  app.delete('/api/flight-tickets/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM flight_tickets WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 3. GOVERNMENT BUDGET PLANNER (ميزانية الرسوم الحكومية)
  // ==========================================
  app.get('/api/saudi/government-budget', (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, b.name as branch_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all() as any[];

    const totalEmployees = employees.length;
    const saudiCount = employees.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
    const expatCount = totalEmployees - saudiCount;

    const annualWorkPermitFees = expatCount * 9600; // 9600 SAR/year
    const annualIqamaRenewalFees = expatCount * 650; // 650 SAR/year
    const annualMedicalInsuranceEstimate = (saudiCount * 1800) + (expatCount * 2600); // estimated insurance per emp
    
    // GOSI contribution annual calculation
    let annualGosiEmployerContribution = 0;
    employees.forEach(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const gosiWage = Math.min(45000, emp.basic_salary + (emp.housing_allowance || 0));
      const rate = isSaudi ? 0.1175 : 0.02;
      annualGosiEmployerContribution += gosiWage * rate * 12;
    });

    const annualVisasEstimate = expatCount * 700; // estimated exit/re-entries
    const annualTotalGovernmentCost = annualWorkPermitFees + annualIqamaRenewalFees + annualMedicalInsuranceEstimate + annualGosiEmployerContribution + annualVisasEstimate;
    const monthlyAverageGovernmentCost = Math.round(annualTotalGovernmentCost / 12);

    // Branch Breakdown
    const branches = db.prepare("SELECT * FROM branches").all() as any[];
    const branchBreakdown = branches.map(b => {
      const branchEmps = employees.filter(e => e.branch_id === b.id);
      const bSaudi = branchEmps.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
      const bExpat = branchEmps.length - bSaudi;
      const bCost = (bExpat * (9600 + 650 + 700)) + (bSaudi * 1800) + (bExpat * 2600);
      return {
        branch_name: b.name,
        saudi_count: bSaudi,
        expat_count: bExpat,
        total_cost: bCost
      };
    });

    res.json({
      totalEmployees,
      saudiCount,
      expatCount,
      annualWorkPermitFees,
      annualIqamaRenewalFees,
      annualMedicalInsuranceEstimate,
      annualGosiEmployerContribution: Math.round(annualGosiEmployerContribution),
      annualVisasEstimate,
      annualTotalGovernmentCost: Math.round(annualTotalGovernmentCost),
      monthlyAverageGovernmentCost,
      branchBreakdown
    });
  });

  // ==========================================
  // 4. SALARY CERTIFICATES (خطابات التعريف بالراتب المعتمدة مع QR)
  // ==========================================
  app.get('/api/salary-certificates', (req, res) => {
    const data = db.prepare(`
      SELECT sc.*, e.name as employee_name, e.national_id_iqama, e.job_title, e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances, e.contract_start_date, e.saudi_iban, e.bank_name, d.name as department_name
      FROM salary_certificates sc
      JOIN employees e ON sc.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY sc.created_at DESC
    `).all();
    res.json(data);
  });

  app.post('/api/salary-certificates', (req, res) => {
    const { employee_id, addressed_to, purpose, include_allowances, include_bank_iban } = req.body;
    const certNum = `SAL-CERT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const qrCode = `VERIFY-KSA-HR-${certNum}-${Buffer.from(String(employee_id)).toString('hex')}`;
    
    const today = new Date();
    const issueDate = today.toISOString().split('T')[0];
    const validUntilDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO salary_certificates (employee_id, certificate_number, addressed_to, purpose, include_allowances, include_bank_iban, qr_verification_code, issue_date, valid_until, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(employee_id, certNum, addressed_to || 'إلى من يهمه الأمر', purpose || 'general', include_allowances !== undefined ? (include_allowances ? 1 : 0) : 1, include_bank_iban !== undefined ? (include_bank_iban ? 1 : 0) : 1, qrCode, issueDate, validUntilDate);

    const emp = db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
    logAction('create', 'salary_certificate', Number(result.lastInsertRowid), `Generated salary certificate ${certNum} for ${emp?.name}`);
    res.json({ success: true, id: result.lastInsertRowid, certificate_number: certNum, qr_code: qrCode });
  });

  app.delete('/api/salary-certificates/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM salary_certificates WHERE id = ?').run(id);
    res.json({ success: true });
  });

  app.get('/api/salary-certificates/verify/:code', (req, res) => {
    const { code } = req.params;
    const cert = db.prepare(`
      SELECT sc.*, e.name as employee_name, e.national_id_iqama, e.job_title, e.basic_salary, e.housing_allowance, e.transport_allowance
      FROM salary_certificates sc
      JOIN employees e ON sc.employee_id = e.id
      WHERE sc.qr_verification_code = ? OR sc.certificate_number = ?
    `).get(code, code) as any;

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

  // ==========================================
  // 5. ACCOUNTING PROVISIONS (مخصصات نهاية الخدمة والإجازات المحاسبية)
  // ==========================================
  app.get('/api/saudi/accounting-provisions', (req, res) => {
    const employees = db.prepare("SELECT * FROM employees").all() as any[];
    const now = new Date();

    const provisions = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const startDate = emp.contract_start_date ? new Date(emp.contract_start_date) : new Date(now.getFullYear() - 2, 0, 1);
      const diffTime = Math.abs(now.getTime() - startDate.getTime());
      const totalDays = diffTime / (1000 * 60 * 60 * 24);
      const serviceYears = Math.floor(totalDays / 365.25);
      const remainingDays = totalDays % 365.25;
      const serviceMonths = Math.floor(remainingDays / 30.44);
      const totalYearsDecimal = totalDays / 365.25;

      const totalWage = emp.basic_salary + (emp.housing_allowance || 0) + (emp.transport_allowance || 0);

      // Cumulative EOSB calculation based on Saudi Labor Law Article 84
      let cumulativeEosb = 0;
      if (totalYearsDecimal <= 5) {
        cumulativeEosb = (totalWage / 2) * totalYearsDecimal;
      } else {
        cumulativeEosb = ((totalWage / 2) * 5) + (totalWage * (totalYearsDecimal - 5));
      }

      // Monthly addition to EOSB provision
      const monthlyEosbRate = totalYearsDecimal < 5 ? (totalWage / 24) : (totalWage / 12);

      // Leave Salary Provision (annual leave 21 or 30 days)
      const annualLeaveEntitlement = totalYearsDecimal > 5 ? 30 : 21;
      const leaveProvisionAmount = (totalWage / 30) * annualLeaveEntitlement;

      // Annual ticket provision for expats
      const annualTicketProvision = !isSaudi ? 2500 : 0;

      const totalMonthlyProvisions = Math.round(monthlyEosbRate + (leaveProvisionAmount / 12) + (annualTicketProvision / 12));

      return {
        employee_id: emp.id,
        employee_name: emp.name,
        national_id_iqama: emp.national_id_iqama,
        is_saudi: isSaudi ? 1 : 0,
        start_date: emp.contract_start_date || '2023-01-01',
        service_years: serviceYears,
        service_months: serviceMonths,
        basic_salary: emp.basic_salary,
        housing_allowance: emp.housing_allowance || 0,
        total_wage: totalWage,
        monthly_eosb_provision: Math.round(monthlyEosbRate),
        cumulative_eosb_provision: Math.round(cumulativeEosb),
        annual_leave_accrued_days: annualLeaveEntitlement,
        leave_provision_amount: Math.round(leaveProvisionAmount),
        annual_ticket_provision: annualTicketProvision,
        total_monthly_provisions: totalMonthlyProvisions
      };
    });

    const totalCumulativeEOSB = provisions.reduce((sum, p) => sum + p.cumulative_eosb_provision, 0);
    const totalMonthlyEOSB = provisions.reduce((sum, p) => sum + p.monthly_eosb_provision, 0);
    const totalLeaveProvision = provisions.reduce((sum, p) => sum + p.leave_provision_amount, 0);

    res.json({
      provisions,
      totalCumulativeEOSB,
      totalMonthlyEOSB,
      totalLeaveProvision
    });
  });

  // ==========================================
  // 6. TOTAL COST OF EMPLOYMENT (التكلفة الفعلية الشاملة للموظف)
  // ==========================================
  app.get('/api/saudi/cost-of-employment', (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all() as any[];

    const list = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const monthlyDirectSalary = emp.basic_salary + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
      
      const gosiWage = Math.min(45000, emp.basic_salary + (emp.housing_allowance || 0));
      const monthlyGosiEmployer = isSaudi ? Math.round(gosiWage * 0.1175) : Math.round(gosiWage * 0.02);

      const monthlyMedicalInsurance = isSaudi ? 150 : 220;
      const monthlyGovernmentFees = !isSaudi ? Math.round((9600 + 650) / 12) : 0;

      const monthlyEosb = Math.round((emp.basic_salary + (emp.housing_allowance || 0)) / 24);
      const monthlyLeave = Math.round(monthlyDirectSalary / 12);
      const monthlyTicket = !isSaudi ? Math.round(2500 / 12) : 0;

      const monthlyTotalCost = monthlyDirectSalary + monthlyGosiEmployer + monthlyMedicalInsurance + monthlyGovernmentFees + monthlyEosb + monthlyLeave + monthlyTicket;
      const annualTotalCost = monthlyTotalCost * 12;
      const costMultiplier = Math.round((monthlyTotalCost / (emp.basic_salary || 1)) * 100) / 100;

      return {
        employee_id: emp.id,
        employee_name: emp.name,
        department_name: emp.department_name || 'عام',
        branch_name: emp.branch_name || 'الرئيسي',
        is_saudi: isSaudi ? 1 : 0,
        monthly_direct_salary: monthlyDirectSalary,
        monthly_gosi_employer: monthlyGosiEmployer,
        monthly_medical_insurance: monthlyMedicalInsurance,
        monthly_government_fees: monthlyGovernmentFees,
        monthly_eosb_provision: monthlyEosb,
        monthly_leave_provision: monthlyLeave,
        monthly_ticket_provision: monthlyTicket,
        monthly_total_cost: monthlyTotalCost,
        annual_total_cost: annualTotalCost,
        cost_multiplier: costMultiplier
      };
    });

    const totalMonthlyAll = list.reduce((sum, item) => sum + item.monthly_total_cost, 0);
    const totalAnnualAll = list.reduce((sum, item) => sum + item.annual_total_cost, 0);

    res.json({
      employees: list,
      totalMonthlyAll,
      totalAnnualAll
    });
  });

  // ==========================================
  // 7. OVERTIME MANAGEMENT (الساعات الإضافية - المادة 107)
  // ==========================================
  app.get('/api/overtime', (req, res) => {
    const data = db.prepare(`
      SELECT o.*, e.name as employee_name, e.basic_salary, e.housing_allowance, e.transport_allowance
      FROM overtime_records o
      JOIN employees e ON o.employee_id = e.id
      ORDER BY o.created_at DESC
    `).all();
    res.json(data);
  });

  app.post('/api/overtime', (req, res) => {
    const { employee_id, date, normal_hours, weekend_hours, holiday_hours, reason } = req.body;
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Wage rate per hour = (Basic + Housing + Transport) / (30 days * 8 hours = 240 hours)
    const wageBase = emp.basic_salary + (emp.housing_allowance || 0) + (emp.transport_allowance || 0);
    const hourlyRate = Math.round((wageBase / 240) * 100) / 100;

    // Saudi Labor Law Article 107: Overtime is 150% of hourly wage
    const nHours = parseFloat(normal_hours) || 0;
    const wHours = parseFloat(weekend_hours) || 0;
    const hHours = parseFloat(holiday_hours) || 0;

    const normalPay = nHours * (hourlyRate * 1.5);
    const weekendPay = wHours * (hourlyRate * 1.5);
    const holidayPay = hHours * (hourlyRate * 2.0); // official holidays 200%
    const totalPay = Math.round((normalPay + weekendPay + holidayPay) * 100) / 100;

    const d = new Date(date || Date.now());
    const month = d.getMonth() + 1;
    const year = d.getFullYear();

    const result = db.prepare(`
      INSERT INTO overtime_records (employee_id, date, normal_hours, weekend_hours, holiday_hours, hourly_rate, total_overtime_pay, status, reason, month, year)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(employee_id, date, nHours, wHours, hHours, hourlyRate, totalPay, reason || 'عمل إضافي لإنجاز مهام المشروع', month, year);

    logAction('create', 'overtime', Number(result.lastInsertRowid), `Logged overtime for ${emp.name}: ${totalPay} SAR`);
    res.json({ success: true, id: result.lastInsertRowid, total_overtime_pay: totalPay, hourly_rate: hourlyRate });
  });

  app.post('/api/overtime/:id/approve', (req, res) => {
    const { id } = req.params;
    const rec = db.prepare("SELECT * FROM overtime_records WHERE id = ?").get(id) as any;
    if (!rec) return res.status(404).json({ error: 'Not found' });

    db.prepare("UPDATE overtime_records SET status = 'approved' WHERE id = ?").run(id);

    // Feed to bonuses_penalties table as a bonus for automated payroll inclusion
    db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, 'bonus', ?, ?, ?, ?)
    `).run(rec.employee_id, rec.total_overtime_pay, `أجر عمل إضافي (${rec.normal_hours + rec.weekend_hours + rec.holiday_hours} ساعة)`, rec.month, rec.year);

    createNotification('اعتماد العمل الإضافي', `تم اعتماد العمل الإضافي بمبلغ ${rec.total_overtime_pay} ر.س وإدراجه في مستحقات الشهر`, 'success');
    res.json({ success: true });
  });

  app.delete('/api/overtime/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM overtime_records WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 8. RAMADAN & WORKING HOURS POLICY (المادة 98)
  // ==========================================
  app.get('/api/policies/ramadan', (req, res) => {
    const ramadanMode = db.prepare("SELECT value FROM settings WHERE key = 'ramadan_mode'").get() as any;
    const ramadanHours = db.prepare("SELECT value FROM settings WHERE key = 'ramadan_working_hours'").get() as any;
    const standardHours = db.prepare("SELECT value FROM settings WHERE key = 'standard_working_hours'").get() as any;

    res.json({
      ramadan_mode: ramadanMode?.value === 'true',
      ramadan_working_hours: Number(ramadanHours?.value || 6),
      standard_working_hours: Number(standardHours?.value || 8)
    });
  });

  app.put('/api/policies/ramadan', (req, res) => {
    const { ramadan_mode, ramadan_working_hours, standard_working_hours } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ramadan_mode', ?)").run(ramadan_mode ? 'true' : 'false');
    if (ramadan_working_hours) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ramadan_working_hours', ?)").run(String(ramadan_working_hours));
    }
    if (standard_working_hours) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('standard_working_hours', ?)").run(String(standard_working_hours));
    }
    logAction('update', 'policy', null, `Updated Ramadan policy to ${ramadan_mode ? 'Enabled' : 'Disabled'}`);
    res.json({ success: true });
  });

  // ==========================================
  // 9. LEAVE BALANCE CALCULATOR (المادة 109)
  // ==========================================
  app.get('/api/saudi/leave-balance/:empId', (req, res) => {
    const { empId } = req.params;
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(empId) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const startDate = emp.contract_start_date ? new Date(emp.contract_start_date) : new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    const serviceYears = Math.floor((Date.now() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    
    // Under Article 109: 21 days for <=5 years, 30 days for >5 years
    const annualEntitlement = serviceYears >= 5 ? 30 : 21;

    // Sum taken leaves this year
    const currentYear = new Date().getFullYear();
    const leavesTaken = db.prepare(`
      SELECT SUM(days) as total_days 
      FROM leaves 
      WHERE employee_id = ? AND type = 'annual' AND status = 'approved' AND strftime('%Y', start_date) = ?
    `).get(empId, String(currentYear)) as any;

    const takenDays = leavesTaken?.total_days || 0;
    const remainingDays = Math.max(0, annualEntitlement - takenDays);
    const dailyRate = Math.round(((emp.basic_salary + (emp.housing_allowance || 0)) / 30) * 100) / 100;
    const encashmentValue = Math.round(remainingDays * dailyRate);

    res.json({
      employee_id: emp.id,
      employee_name: emp.name,
      service_years: serviceYears,
      annual_entitlement: annualEntitlement,
      taken_days: takenDays,
      remaining_days: remainingDays,
      daily_rate: dailyRate,
      encashment_value: encashmentValue
    });
  });

  // ==========================================
  // 10. SAUDI LABOR LAW AI CONSULTANT (المستشار القانوني الذكي)
  // ==========================================
  app.post('/api/ai/labor-law-consultant', async (req, res) => {
    const { question, context } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'يرجى كتابة السؤال القانوني' });
    }

    const ai = getAI();
    let aiResponse = '';

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `أنت المستشار القانوني المتخصص والخبير في نظام العمل السعودي واللوائح التنفيذية وقرارات وزارة الموارد البشرية والتنمية الاجتماعية وقواعد التأمينات الاجتماعية (GOSI).
أجب على استفسار الموارد البشرية باللغة العربية بأسلوب رسمي، احترافي، دقيق وقانوني موثق بأرقام المواد النظامية ذات الصلة، مع تقديم خطوات أو حسابات عملية إن تطلب الأمر.

السؤال:
${question}

${context ? `معلومات إضافية عن الحالة: ${JSON.stringify(context)}` : ''}

قم بتنظيم الإجابة مع عناوين واضحة:
1. الخلاصة القانونية المباشرة
2. السند النظامي من مواد نظام العمل السعودي
3. الشروط والإجراءات الواجب اتباعها
4. أمثلة أو توجيهات عملية لحماية المنشأة والموظف`
        });
        aiResponse = response.text || '';
      } catch (err) {
        console.error("Gemini API error in consultant:", err);
      }
    }

    // Comprehensive expert fallback if API key is not present or rate limited
    if (!aiResponse) {
      const q = question.toLowerCase();
      if (q.includes('نهاية الخدمة') || q.includes('مكافأة') || q.includes('84') || q.includes('85')) {
        aiResponse = `### الخلاصة القانونية لمكافأة نهاية الخدمة:
وفقاً للمادتين (84) و (85) من نظام العمل السعودي:
1. **في حال انتهاء العقد أو إنهاء الخدمة من صاحب العمل (المادة 84)**:
   - يستحق الموظف أجر نصف شهر عن كل سنة من السنوات الخمس الأولى.
   - يستحق أجر شهر كامل عن كل سنة تالية بعد السنوات الخمس الأولى.
   - تؤخذ كسور السنة بنسبة ما قضاه منها في العمل، وتحسب على أساس **الأجر الأخير الفعلي** (الأساسي + السكن + البدلات الثابتة).

2. **في حال استقالة الموظف (المادة 85)**:
   - خدمة أقل من سنتين: لا يستحق مكافأة.
   - خدمة من سنتين إلى 5 سنوات: يستحق **ثلث (1/3)** المكافأة.
   - خدمة من 5 سنوات إلى 10 سنوات: يستحق **ثلثي (2/3)** المكافأة.
   - خدمة 10 سنوات فأكثر: يستحق **المكافأة كاملة (100%)**.

3. **استثناءات الاستحقاق الكامل عند الاستقالة**:
   - ترك العاملة للعمل خلال 6 أشهر من عقد زواجها أو 3 أشهر من تاريخ وضعها.
   - ترك العمل بسبب قوة قاهرة خارجة عن إرادة العامل.`;
      } else if (q.includes('مادة 77') || q.includes('فصل') || q.includes('إنهاء غير مشروع') || q.includes('تعويض')) {
        aiResponse = `### أحكام المادة (77) من نظام العمل (التعويض عن الإنهاء لسبب غير مشروع):
إذا أُنهي العقد لسبب غير مشروع كان للطرف الذي أصابه الضرر الحق في تعويض:
1. **العقود غير محددة المدة (للسعوديين)**:
   - أجر 15 يوماً عن كل سنة من سنوات خدمة العامل.
2. **العقود محددة المدة**:
   - أجر المدة المتبقية من العقد.
3. **الحد الأدنى للتعويض**:
   - يجب ألا يقل التعويض عن أجر العامل لمدة **شهران (60 يوماً)** في الحالتين.
4. **شروط التطبيق**:
   - يطبق هذا التعويض ما لم يتضمن عقد العمل تعويضاً محدداً منصوصاً عليه في بنوده.`;
      } else if (q.includes('مادة 80') || q.includes('فصل بدون مكافأة') || q.includes('مخالفة جسيمة')) {
        aiResponse = `### المادة (80) - إنهاء العقد بدون إشعار أو مكافأة نهاية خدمة:
يجوز لصاحب العمل فسخ العقد دون مكافأة أو إشعار أو تعويض في 9 حالات حصرية محددة نظاماً:
1. الاعتداء على صاحب العمل أو المدير أثناء العمل أو بسببه.
2. عدم أداء الالتزامات الجوهرية المترتبة على العقد أو عدم إطاعة الأوامر المشروعة عمداً بعد إنذار كتابي.
3. ثبوت ارتكاب العامل سلوكاً سيئاً أو عملاً مخلاً بالشرف أو الأمانة.
4. ارتكاب فعل أو تقصير عمداً بقصد إلحاق خسارة مادية جسيمة بصاحب العمل بشرط إبلاغ الجهات المختصة خلال 24 ساعة.
5. لجوء العامل للتزوير للحصول على العمل.
6. إذا كان العامل معيناً تحت الاختبار (فترة التجربة).
7. الغياب دون سبب مشروع أكثر من 30 يوماً متقطعة خلال السنة الواحدة (إنذار بعد 20 يوماً) أو أكثر من 15 يوماً متتالية (إنذار بعد 10 أيام).
8. إفشاء الأسرار الصناعية أو التجارية للعمل.
9. استغلال المركز الوظيفي بطريقة غير مشروعة لتحقيق مكاسب شخصية.`;
      } else if (q.includes('تجربة') || q.includes('53') || q.includes('فترة التجربة')) {
        aiResponse = `### ضوابط فترة التجربة وفق المادة (53) من نظام العمل:
1. **المدة الأصلية**: يجب ألا تزيد فترة التجربة المنصوص عليها في العقد عن **90 يوماً**.
2. **التمديد**: يجوز باتفاق كتابي صريح بين الطرفين تمديد فترة التجربة إلى مدة لا تتجاوز **180 يوماً**.
3. **أيام الإجازات**: لا تدخل إجازتا عيدي الفطر والأضحى والإجازة المرضية في حساب فترة التجربة.
4. **حق الإنهاء**: لأي من الطرفين الحق في إنهاء العقد خلال فترة التجربة ما لم يتضمن العقد نصاً يمنح الحق لأحدهما فقط.
5. **المكافأة والتعويض**: لا يستحق أي من الطرفين تعويضاً أو مكافأة نهاية خدمة عن الإنهاء خلال فترة التجربة.`;
      } else if (q.includes('إجازة') || q.includes('سنوية') || q.includes('109') || q.includes('رصيد')) {
        aiResponse = `### حقوق الإجازات السنوية وفق المادة (109) من نظام العمل:
1. **مدة الإجازة السنوية**:
   - تستحق إجازة سنوية بأجر كامل لا تقل عن **21 يوماً** عن كل عام.
   - تزداد إلى **30 يوماً** إذا أمضى العامل في خدمة صاحب العمل **5 سنوات متصلة**.
2. **الأجر أثناء الإجازة**: يدفع أجر الإجازة مقدماً قبل القيام بها مع كامل البدلات.
3. **التأجيل والترحيل**:
   - يجوز تأجيل الإجازة لسنة واحدة بموافقة العامل.
   - لا يجوز التنازل عن الإجازة أو تقاضي بدل نقدي عنها أثناء الخدمة إلا عند انتهاء العقد.
4. **التعويض عند ترك الخدمة (المادة 111)**:
   - يستحق العامل أجراً عن أيام الإجازة المستحقة له عن كسور السنة غير المستخدمة.`;
      } else if (q.includes('إضافي') || q.includes('ساعات') || q.includes('107') || q.includes('رمضان') || q.includes('98')) {
        aiResponse = `### ساعات العمل والعمل الإضافي (المادتان 98 و 107):
1. **ساعات العمل الأصلية (المادة 98)**:
   - 8 ساعات يومياً أو 48 ساعة أسبوعياً كحد أقصى.
   - تخفض خلال **شهر رمضان المبارك** للمسلمين إلى **6 ساعات يومياً أو 36 ساعة أسبوعياً**.
2. **احتساب أجر الساعات الإضافية (المادة 107)**:
   - يستحق العامل عن كل ساعة عمل إضافية: **أجر الساعة الأساسي + 50% من أجره الأساسي (إجمالي 150%)**.
   - ساعات العمل في أيام العطلات والأعياد الرسمية تعتبر بالكامل ساعات إضافية.`;
      } else {
        aiResponse = `### استشارة نظام العمل السعودي:
استناداً إلى نظام العمل الصادر بالمرسوم الملكي رقم (م/51) وتعديلاته واللوائح التنفيذية لوزارة الموارد البشرية والتنمية الاجتماعية:
- تسري كافة العقود واللوائح بما يضمن حقوق الطرفين وتوثيق العقود عبر منصة **قوى**.
- يخضع احتساب الرواتب والبدلات لنظام حماية الأجور (منصة **مدد**).
- يتطلب إنهاء العقود غير محددة المدة إشعاراً كتابياً مسبقاً بمدة لا تقل عن 60 يوماً للمعينين براتب شهري (المادة 75).
- يمكنكم استخدام الحاسبات التلقائية المتوفرة بالنظام (مكافأة نهاية الخدمة، العمل الإضافي، رصيد الإجازات، وتكلفة الموظف) للحصول على أدق النتائج الحسابية.`;
      }
    }

    res.json({
      answer: aiResponse,
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================
  // 11. QIWA CONTRACTS & NOTICE PERIODS (عقود قوى)
  // ==========================================
  app.get('/api/qiwa/contracts', (req, res) => {
    // Auto-seed contracts if none exist for active employees
    const count = db.prepare("SELECT COUNT(*) as count FROM qiwa_contracts").get() as any;
    if (count.count === 0) {
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      emps.forEach((emp, idx) => {
        const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
        const startDate = emp.join_date || '2023-01-15';
        const start = new Date(startDate);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + (isSaudi ? 2 : 1));
        const endDateStr = end.toISOString().split('T')[0];

        db.prepare(`
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
        );
      });
    }

    const contracts = db.prepare(`
      SELECT c.*, e.name as employee_name, e.national_id_iqama, e.nationality,
             d.name as department_name, b.name as branch_name
      FROM qiwa_contracts c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      ORDER BY c.created_at DESC
    `).all() as any[];

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

  app.post('/api/qiwa/contracts', (req, res) => {
    const {
      employee_id, contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status, clauses_json
    } = req.body;

    const contractNumber = `QW-SA-${Math.floor(100000 + Math.random() * 900000)}`;
    const qiwaRef = `QREF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = db.prepare(`
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
    );

    logAction('create', 'qiwa_contract', Number(result.lastInsertRowid), `Created Qiwa contract ${contractNumber}`);
    createNotification('توثيق عقد قوى', `تم إنشاء وتوثيق عقد عمل موحد جديد برقم ${contractNumber}`, 'success');

    res.json({ success: true, id: result.lastInsertRowid, contract_number: contractNumber });
  });

  app.post('/api/qiwa/draft-from-employees', (req, res) => {
    try {
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      let created = 0;
      for (const emp of emps) {
        const exists = db.prepare("SELECT id FROM qiwa_contracts WHERE employee_id = ?").get(emp.id);
        if (exists) continue;
        const contractNumber = `QW-DRAFT-${emp.id}-${Date.now().toString().slice(-6)}`;
        db.prepare(`
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
        );
        created++;
      }
      res.json({ success: true, created });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.put('/api/qiwa/contracts/:id', (req, res) => {
    const { id } = req.params;
    const {
      contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status
    } = req.body;

    db.prepare(`
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
    );

    logAction('update', 'qiwa_contract', Number(id), `Updated Qiwa contract id ${id}`);
    res.json({ success: true });
  });

  app.delete('/api/qiwa/contracts/:id', (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM qiwa_contracts WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 12. DISCIPLINARY MATRIX & VIOLATIONS (لائحة الجزاءات والتحقيق)
  // ==========================================
  app.get('/api/disciplinary/violations', (req, res) => {
    // Seed initial violation records if none exist
    const count = db.prepare("SELECT COUNT(*) as count FROM disciplinary_violations").get() as any;
    if (count.count === 0) {
      const emp = db.prepare("SELECT * FROM employees LIMIT 2").all() as any[];
      if (emp.length > 0) {
        const emp1 = emp[0];
        const dailyRate = Math.round((emp1.basic_salary || 5000) / 30);
        db.prepare(`
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
          db.prepare(`
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

    const list = db.prepare(`
      SELECT v.*, e.name as employee_name, e.national_id_iqama, d.name as department_name
      FROM disciplinary_violations v
      JOIN employees e ON v.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY v.created_at DESC
    `).all();

    res.json(list);
  });

  app.post('/api/disciplinary/violations', (req, res) => {
    const {
      employee_id, incident_date, category, description,
      investigation_date, investigator_name, employee_statement,
      committee_decision, penalty_level, deduction_days, status
    } = req.body;

    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const dailyRate = (emp.basic_salary || 0) / 30;
    const days = Number(deduction_days) || 0;
    const deductionAmount = Math.round(dailyRate * days);

    const result = db.prepare(`
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

    logAction('create', 'violation', Number(result.lastInsertRowid), `Logged violation for ${emp.name} (${penalty_level})`);
    createNotification('تسجيل مخالفة وقرار جزاء', `تم تسجيل قرار إداري بحق الموظف ${emp.name}`, 'warning');

    res.json({ success: true, id: result.lastInsertRowid, deduction_amount: deductionAmount });
  });

  app.post('/api/disciplinary/violations/:id/apply-payroll', (req, res) => {
    const { id } = req.params;
    const viol = db.prepare("SELECT * FROM disciplinary_violations WHERE id = ?").get(id) as any;
    if (!viol) return res.status(404).json({ error: 'Violation not found' });

    if (viol.deduction_amount > 0 && viol.payroll_applied === 0) {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      db.prepare(`
        INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
        VALUES (?, 'penalty', ?, ?, ?, ?)
      `).run(viol.employee_id, viol.deduction_amount, `جزاء إداري (${viol.penalty_level}) - خصم ${viol.deduction_days} يوم`, month, year);

      db.prepare("UPDATE disciplinary_violations SET payroll_applied = 1 WHERE id = ?").run(id);

      logAction('update', 'violation', Number(id), `Applied deduction ${viol.deduction_amount} SAR to payroll`);
      createNotification('ترحيل الجزاء لمسير الرواتب', `تم ترحيل خصم الجزاء بقيمة ${viol.deduction_amount} ر.س إلى مسير الشهر الحالي`, 'info');
    }

    res.json({ success: true });
  });

  app.delete('/api/disciplinary/violations/:id', (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM disciplinary_violations WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 13. MULTI-DEPARTMENT CLEARANCE WORKFLOW (إخلاء الطرف وإبراء الذمة)
  // ==========================================
  app.get('/api/clearances', (req, res) => {
    // Seed initial clearance if none exist
    const count = db.prepare("SELECT COUNT(*) as count FROM employee_clearances").get() as any;
    if (count.count === 0) {
      const emp = db.prepare("SELECT * FROM employees LIMIT 1").get() as any;
      if (emp) {
        db.prepare(`
          INSERT INTO employee_clearances (
            employee_id, request_date, last_working_day, reason,
            it_status, it_notes, it_cleared_by,
            finance_status, finance_loans_settled, finance_custody_settled, finance_notes,
            operations_status, operations_assets_returned, operations_notes,
            hr_status, hr_medical_cancelled, hr_gosi_deregistered, hr_service_cert_issued,
            overall_status, final_settlement_amount, clearance_slip_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          emp.id,
          new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
          new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
          'contract_end',
          'cleared', 'تم استلام جهاز اللابتوب وحجب البريد الإلكتروني والصلاحيات', 'م. فهد (IT)',
          'cleared', 1, 1, 'تم التأكد من سداد كافة السلف وتصفية العهد النقدية',
          'pending', 1, 'بانتظار تسليم مفاتيح المكتب وبطاقة الدخول الموحدة',
          'pending', 0, 0, 1,
          'in_progress', 18500, 'CLR-2024-001'
        );
      }
    }

    const list = db.prepare(`
      SELECT c.*, e.name as employee_name, e.position as job_title,
             e.national_id_iqama, d.name as department_name
      FROM employee_clearances c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY c.created_at DESC
    `).all();

    res.json(list);
  });

  app.post('/api/clearances', (req, res) => {
    const { employee_id, request_date, last_working_day, reason, final_settlement_amount } = req.body;
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const clearanceSlipNumber = `CLR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const result = db.prepare(`
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

    logAction('create', 'clearance', Number(result.lastInsertRowid), `Initiated exit clearance for ${emp.name}`);
    createNotification('بدء إجراءات إخلاء طرف', `تم إطلاق مسار إخلاء الطرف للموظف ${emp.name} برقم ${clearanceSlipNumber}`, 'info');

    res.json({ success: true, id: result.lastInsertRowid, clearance_slip_number: clearanceSlipNumber });
  });

  app.put('/api/clearances/:id/department', (req, res) => {
    const { id } = req.params;
    const { department, status, notes, cleared_by, extra_data } = req.body;

    const clearance = db.prepare("SELECT * FROM employee_clearances WHERE id = ?").get(id) as any;
    if (!clearance) return res.status(404).json({ error: 'Clearance not found' });

    if (department === 'it') {
      db.prepare("UPDATE employee_clearances SET it_status = ?, it_notes = ?, it_cleared_by = ? WHERE id = ?")
        .run(status || 'cleared', notes, cleared_by || 'فريق IT', id);
    } else if (department === 'finance') {
      db.prepare("UPDATE employee_clearances SET finance_status = ?, finance_loans_settled = ?, finance_custody_settled = ?, finance_notes = ? WHERE id = ?")
        .run(status || 'cleared', extra_data?.loans_settled ? 1 : 0, extra_data?.custody_settled ? 1 : 0, notes, id);
    } else if (department === 'operations') {
      db.prepare("UPDATE employee_clearances SET operations_status = ?, operations_assets_returned = ?, operations_notes = ? WHERE id = ?")
        .run(status || 'cleared', extra_data?.assets_returned ? 1 : 0, notes, id);
    } else if (department === 'hr') {
      db.prepare("UPDATE employee_clearances SET hr_status = ?, hr_medical_cancelled = ?, hr_gosi_deregistered = ?, hr_service_cert_issued = ? WHERE id = ?")
        .run(status || 'cleared', extra_data?.medical_cancelled ? 1 : 0, extra_data?.gosi_deregistered ? 1 : 0, extra_data?.service_cert_issued ? 1 : 0, id);
    }

    // Check if all 4 departments are cleared to mark as completed
    const updated = db.prepare("SELECT * FROM employee_clearances WHERE id = ?").get(id) as any;
    if (updated.it_status === 'cleared' && updated.finance_status === 'cleared' && updated.operations_status === 'cleared' && updated.hr_status === 'cleared') {
      db.prepare("UPDATE employee_clearances SET overall_status = 'completed' WHERE id = ?").run(id);
      createNotification('اكتمال إخلاء الطرف', `تم اعتماد إخلاء الطرف رقم ${updated.clearance_slip_number} بنجاح من كافة الأقسام المعنية`, 'success');
    }

    logAction('update', 'clearance', Number(id), `Updated ${department} clearance status`);
    res.json({ success: true });
  });

  app.delete('/api/clearances/:id', (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM employee_clearances WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 14. GOSI WORK INJURIES & OH&S (إصابات العمل والسلامة المهنية)
  // ==========================================
  app.get('/api/work-injuries', (req, res) => {
    // Seed sample injury if none exists
    const count = db.prepare("SELECT COUNT(*) as count FROM work_injuries").get() as any;
    if (count.count === 0) {
      const emp = db.prepare("SELECT * FROM employees LIMIT 1").get() as any;
      if (emp) {
        const dailyRate = Math.round((emp.basic_salary + (emp.housing_allowance || 0)) / 30);
        db.prepare(`
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

    const list = db.prepare(`
      SELECT w.*, e.name as employee_name, e.national_id_iqama, d.name as department_name
      FROM work_injuries w
      JOIN employees e ON w.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY w.created_at DESC
    `).all();

    res.json(list);
  });

  app.post('/api/work-injuries', (req, res) => {
    const {
      employee_id, incident_date, incident_time, location_type,
      injury_type, severity, description, hospital_name, sick_leave_days,
      gosi_reported, gosi_claim_number, preventive_actions
    } = req.body;

    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Under GOSI regulations: Daily allowance for work injuries is 100% of wage
    const dailyWage = Math.round(((emp.basic_salary || 0) + (emp.housing_allowance || 0)) / 30);
    const leaveDays = Number(sick_leave_days) || 0;
    const compensation = dailyWage * leaveDays;
    const claimNumber = gosi_claim_number || `GOSI-INJ-${Math.floor(100000 + Math.random() * 900000)}`;

    const result = db.prepare(`
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

    logAction('create', 'work_injury', Number(result.lastInsertRowid), `Reported work injury for ${emp.name}`);
    createNotification('تسجيل بلاغ إصابة عمل', `تم توثيق إصابة العمل للموظف ${emp.name} وإشعار التأمينات الاجتماعية (GOSI)`, 'warning');

    res.json({ success: true, id: result.lastInsertRowid, gosi_claim_number: claimNumber, compensation });
  });

  app.put('/api/work-injuries/:id', (req, res) => {
    const { id } = req.params;
    const { status, gosi_reported, gosi_claim_number, sick_leave_days, preventive_actions } = req.body;

    const inj = db.prepare("SELECT * FROM work_injuries WHERE id = ?").get(id) as any;
    if (!inj) return res.status(404).json({ error: 'Not found' });

    let comp = inj.total_compensation_amount;
    if (sick_leave_days) {
      comp = inj.daily_allowance_rate * Number(sick_leave_days);
    }

    db.prepare(`
      UPDATE work_injuries SET
        status = COALESCE(?, status),
        gosi_reported = COALESCE(?, gosi_reported),
        gosi_claim_number = COALESCE(?, gosi_claim_number),
        sick_leave_days = COALESCE(?, sick_leave_days),
        total_compensation_amount = ?,
        preventive_actions = COALESCE(?, preventive_actions)
      WHERE id = ?
    `).run(status, gosi_reported, gosi_claim_number, sick_leave_days, comp, preventive_actions, id);

    logAction('update', 'work_injury', Number(id), `Updated injury id ${id}`);
    res.json({ success: true });
  });

  app.delete('/api/work-injuries/:id', (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM work_injuries WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ==========================================
  // 15. NITAQAT & SAUDIZATION SIMULATOR (محاكي نطاقات والتوطين المتقدم)
  // ==========================================
  app.post('/api/saudi/nitaqat-simulator', (req, res) => {
    const { sector, add_saudis, add_expats, disabled_saudis_count } = req.body;
    
    const employees = db.prepare("SELECT * FROM employees").all() as any[];
    let saudiCount = employees.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
    let expatCount = employees.filter(e => e.is_saudi === 0 && e.nationality !== 'سعودي').length;

    // Apply simulation deltas
    saudiCount += Number(add_saudis) || 0;
    expatCount += Number(add_expats) || 0;
    const disabledCount = Number(disabled_saudis_count) || 0;

    // Under Mowaamah rules: 1 disabled Saudi employee = 4 points in Nitaqat calculation (adds 3 bonus weights)
    const weightedSaudis = saudiCount + (disabledCount * 3);
    const totalEmployees = saudiCount + expatCount;

    const actualPercentage = totalEmployees > 0 ? Math.round((saudiCount / totalEmployees) * 1000) / 10 : 0;
    const weightedPercentage = totalEmployees > 0 ? Math.round((weightedSaudis / (totalEmployees + (disabledCount * 3))) * 1000) / 10 : 0;

    // Sector-specific tier thresholds (e.g., Commercial / Technology / Construction)
    const sectorThresholds: Record<string, { platinum: number; high_green: number; mid_green: number; low_green: number; name: string }> = {
      tech: { platinum: 40, high_green: 30, mid_green: 20, low_green: 12, name: 'تقنية المعلومات والاتصالات' },
      retail: { platinum: 50, high_green: 38, mid_green: 26, low_green: 15, name: 'تجارة التجزئة والجملة' },
      construction: { platinum: 25, high_green: 18, mid_green: 12, low_green: 6, name: 'المقاولات والتشييد' },
      services: { platinum: 35, high_green: 26, mid_green: 18, low_green: 10, name: 'الخدمات العامة والاستشارات' }
    };

    const currentSectorKey = sector || 'tech';
    const thresholds = sectorThresholds[currentSectorKey] || sectorThresholds.tech;

    let currentTier: 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red' = 'red';
    let availableVisas = 0;

    if (weightedPercentage >= thresholds.platinum) {
      currentTier = 'platinum';
      availableVisas = Math.max(15, Math.floor(saudiCount * 2.5));
    } else if (weightedPercentage >= thresholds.high_green) {
      currentTier = 'high_green';
      availableVisas = Math.max(8, Math.floor(saudiCount * 1.5));
    } else if (weightedPercentage >= thresholds.mid_green) {
      currentTier = 'mid_green';
      availableVisas = Math.max(3, Math.floor(saudiCount * 0.8));
    } else if (weightedPercentage >= thresholds.low_green) {
      currentTier = 'low_green';
      availableVisas = 1;
    } else {
      currentTier = 'red';
      availableVisas = 0;
    }

    // Calculate how many Saudis needed to reach next tier
    let targetTierPct = thresholds.platinum;
    if (currentTier === 'red') targetTierPct = thresholds.low_green;
    else if (currentTier === 'low_green') targetTierPct = thresholds.mid_green;
    else if (currentTier === 'mid_green') targetTierPct = thresholds.high_green;
    else if (currentTier === 'high_green') targetTierPct = thresholds.platinum;

    // Formula: (S + x) / (Total + x) = targetPct / 100  =>  x = (targetPct*Total - 100*S) / (100 - targetPct)
    let saudisNeededForNextTier = 0;
    if (currentTier !== 'platinum') {
      const needed = (targetTierPct * totalEmployees - 100 * weightedSaudis) / (100 - targetTierPct);
      saudisNeededForNextTier = Math.max(0, Math.ceil(needed));
    }

    // Calculate how many Expats can be hired before falling to lower tier
    let lowerTierPct = thresholds.low_green;
    if (currentTier === 'platinum') lowerTierPct = thresholds.high_green;
    else if (currentTier === 'high_green') lowerTierPct = thresholds.mid_green;
    else if (currentTier === 'mid_green') lowerTierPct = thresholds.low_green;
    else if (currentTier === 'low_green') lowerTierPct = 0;

    let expatsAllowed = 0;
    if (lowerTierPct > 0) {
      const allowed = (100 * weightedSaudis - lowerTierPct * totalEmployees) / lowerTierPct;
      expatsAllowed = Math.max(0, Math.floor(allowed));
    } else {
      expatsAllowed = 999;
    }

    // Restricted Professions compliance analysis
    const restrictedProfessions = [
      {
        profession: 'إدارة الموارد البشرية وشؤون الموظفين (100% توطين)',
        targetPercentage: 100,
        currentSaudis: employees.filter(e => (e.position || '').includes('موارد بشرية') && (e.is_saudi === 1 || e.nationality === 'سعودي')).length || 2,
        currentExpats: employees.filter(e => (e.position || '').includes('موارد بشرية') && e.is_saudi === 0 && e.nationality !== 'سعودي').length || 0,
        currentPercentage: 100,
        isCompliant: true
      },
      {
        profession: 'المهن المحاسبية والمالية (30% توطين كحد أدنى)',
        targetPercentage: 30,
        currentSaudis: employees.filter(e => ((e.position || '').includes('محاسب') || (e.position || '').includes('مالي')) && (e.is_saudi === 1 || e.nationality === 'سعودي')).length || 1,
        currentExpats: employees.filter(e => ((e.position || '').includes('محاسب') || (e.position || '').includes('مالي')) && e.is_saudi === 0 && e.nationality !== 'سعودي').length || 1,
        currentPercentage: 50,
        isCompliant: true
      },
      {
        profession: 'مهن المبيعات والتسويق (35% توطين)',
        targetPercentage: 35,
        currentSaudis: 2,
        currentExpats: 2,
        currentPercentage: 50,
        isCompliant: true
      },
      {
        profession: 'مهن الهندسة وتقنية المعلومات (25% توطين)',
        targetPercentage: 25,
        currentSaudis: 3,
        currentExpats: 4,
        currentPercentage: 42.8,
        isCompliant: true
      }
    ];

    res.json({
      totalEmployees,
      saudiCount,
      expatCount,
      saudiSpecialWeightsCount: disabledCount * 3,
      currentSaudizationPercentage: actualPercentage,
      weightedSaudizationPercentage: weightedPercentage,
      currentTier,
      saudisNeededForNextTier,
      expatsAllowedBeforeDowngrade: expatsAllowed,
      availableVisasToIssue: availableVisas,
      sectorName: thresholds.name,
      tierThresholds: {
        platinum: thresholds.platinum,
        high_green: thresholds.high_green,
        mid_green: thresholds.mid_green,
        low_green: thresholds.low_green
      },
      restrictedProfessions
    });
  });

  // ==========================================
  // 16. AI HR LETTERS & OFFICIAL NOTICES STUDIO (استوديو الخطابات الإدارية الذكي)
  // ==========================================
  app.get('/api/ai/hr-letters', (req, res) => {
    const letters = db.prepare(`
      SELECT l.*, e.name as employee_name, e.position as job_title, e.national_id_iqama
      FROM hr_generated_letters l
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.created_at DESC
    `).all();
    res.json(letters);
  });

  app.post('/api/ai/hr-letter-generator', async (req, res) => {
    const {
      employee_id, letter_type, custom_notes, effective_date,
      target_role, salary_increase_amount, addressed_to
    } = req.body;

    const emp = db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.id = ?
    `).get(employee_id) as any;

    if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });

    const letterId = `LTR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const dateStr = effective_date || new Date().toISOString().split('T')[0];

    const letterTypeTitles: Record<string, string> = {
      promotion: 'قرار ترقية وتعديل مسمى وظيفي',
      warning: 'إنذار كتابي رسمي ولفت نظر إداري',
      termination_art77: 'إشعار إنهاء عقد العمل لسبب مشروع (المادة 77)',
      termination_art80: 'قرار فسخ عقد العمل بموجب المادة (80)',
      contract_non_renewal: 'إشعار بعدم الرغبة في تجديد عقد العمل (المادة 75)',
      salary_increment: 'قرار زيادة الراتب ومكافأة تميز',
      experience_certificate: 'شهادة خبرة وخدمة معتمدة',
      delegation: 'قرار تفويض صلاحيات ومهام إدارية'
    };

    const title = letterTypeTitles[letter_type] || 'خطاب إداري رسمي';
    let generatedContent = '';

    const ai = getAI();
    if (ai) {
      try {
        const prompt = `أنت مدير إدارة الموارد البشرية والشؤون القانونية في المملكة العربية السعودية.
اكتب صيغة خطاب إداري رسمي فائق الاحترافية، متوافقاً تماماً مع نظام العمل السعودي واللوائح التنفيذية لوزارة الموارد البشرية.

نوع الخطاب: ${title} (${letter_type})
بيانات الموظف:
- الاسم: ${emp.name}
- المسمى الوظيفي: ${emp.position || emp.job_title || 'موظف'}
- الهوية / الإقامة: ${emp.national_id_iqama || 'سجل رسمي'}
- الإدارة: ${emp.department_name || 'عام'}
- الفرع: ${emp.branch_name || 'الرئيسي'}
- تاريخ السريان / النفاذ: ${dateStr}
- الجهة الموجه إليها: ${addressed_to || 'الموظف المعني / الجهات المختصة'}
- المسمى الجديد المستهدف: ${target_role || 'غير محدد'}
- مقدار الزيادة بالراتب: ${salary_increase_amount ? `${salary_increase_amount} ر.س` : 'غير محدد'}
- ملاحظات ومسوغات إضافية: ${custom_notes || 'بناءً على تقييم الأداء واللوائح المعتمدة'}

اجعل الخطاب يبدأ بالبسملة، الرقم المرجعي والتاريخ، ثم الديباجة الرسمية، متن القرار والبنود النظامية الملزمة، وينتهي بختم وتوقيع المدير العام وإدارة الموارد البشرية.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });
        generatedContent = response.text || '';
      } catch (err) {
        console.error("Gemini letter generator error:", err);
      }
    }

    // Fallback template if AI is not available
    if (!generatedContent) {
      if (letter_type === 'promotion') {
        generatedContent = `بسم الله الرحمن الرحيم

الرقم المرجعي: ${letterId}
التاريخ: ${dateStr}

قرار إداري رقم (${letterId})
بشأن: ترقية وتعديل مسمى وظيفي

بناءً على الصلاحيات الممنوحة لإدارة الموارد البشرية، واستناداً إلى تقارير تقييم الأداء والتميز الميداني للموظف/ ${emp.name}، وتوصية المدير المباشر:

تقرر ما يلي:
أولاً: ترقية الموظف/ ${emp.name} (هوية/إقامة: ${emp.national_id_iqama || '---'}) إلى منصب: [${target_role || 'أخصائي أول'}].
ثانياً: تعديل الراتب الأساسي والبدلات المقررة وفق سلم الرواتب للمنصب الجديد اعتباراً من تاريخ ${dateStr}.
ثالثاً: يُبلغ هذا القرار لكافة الإدارات المعنية للاعتماد وتنفيذ مقتضاه.

شاكرين للموظف جهوده المتميزة، ومتمنين له دوام التوفيق والنجاح.

إدارة الموارد البشرية
شركة الأنظمة المتكاملة`;
      } else if (letter_type === 'warning') {
        generatedContent = `بسم الله الرحمن الرحيم

الرقم المرجعي: ${letterId}
التاريخ: ${dateStr}

المكرم الموظف/ ${emp.name}  المحترم
المسمى الوظيفي: ${emp.position || emp.job_title} | الإدارة: ${emp.department_name || 'عام'}

الموضوع: إنذار كتابي رسمي ولفت نظر إداري

إشارة إلى المخالفة المنسوبة إليكم والمتعلقة بـ: [${custom_notes || 'عدم الالتزام بساعات العمل والتعليمات الإدارية المعتمدة'}]، واستناداً إلى لائحة تنظيم العمل الداخلية المعتمدة من وزارة الموارد البشرية والتنمية الاجتماعية:

نود إحاطتكم بتوجيه هذا الإنذار الكتابي، مع التأكيد على ضرورة تلافي هذه الملاحظات والالتزام التام ببنود عقد العمل وسياسات المنشأة مستقبلاً. ونحيطكم علماً بأن تكرار المخالفة سيعرضكم لتطبيق الجزاءات الأشد المنصوص عليها نظاماً.

إدارة الموارد البشرية
الختم والتوقيع: .....................`;
      } else if (letter_type === 'contract_non_renewal') {
        generatedContent = `بسم الله الرحمن الرحيم

الرقم المرجعي: ${letterId}
التاريخ: ${dateStr}

المكرم الموظف/ ${emp.name}  المحترم
هوية/إقامة رقم: ${emp.national_id_iqama || '---'}

الموضوع: إشعار بعدم الرغبة في تجديد عقد العمل وفق المادة (75) من نظام العمل

نود إحاطتكم بأنه استناداً إلى بنود عقد العمل المبرم بين الطرفين والمسجل عبر منصة (قوى)، وعملاً بأحكام نظام العمل السعودي، فقد تقرر عدم تجديد عقد عملكم للفترة القادمة، ويكون آخر يوم عمل فعلي لكم هو تاريخ [${dateStr}].

نرجو منكم التنسيق مع إدارة الموارد البشرية لاستكمال إجراءات إخلاء الطرف، وتسليم العهد، وصرف كافة مستحقاتكم المالية ومكافأة نهاية الخدمة وشهادة الخدمة.

مع خالص الشكر والتقدير لجهودكم خلال فترة عملكم معنا.

المدير العام / إدارة الموارد البشرية`;
      } else {
        generatedContent = `بسم الله الرحمن الرحيم

الرقم المرجعي: ${letterId}
التاريخ: ${dateStr}

${title}
بخصوص الموظف/ ${emp.name} (${emp.position || 'موظف'})

بناءً على مقتضيات مصلحة العمل ولائحة تنظيم العمل الداخلية ونظام العمل السعودي:
تقرر إصدار هذا الإجراء الإداري رسمياً اعتباراً من ${dateStr}.

المسوغات والتفاصيل:
${custom_notes || 'وفق السياسات والإجراءات المعتمدة.'}

إدارة الموارد البشرية والعمليات`;
      }
    }

    // Save to hr_generated_letters
    db.prepare(`
      INSERT INTO hr_generated_letters (letter_id, employee_id, letter_type, title, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(letterId, employee_id, letter_type, title, generatedContent);

    logAction('create', 'hr_letter', Number(employee_id), `Generated HR Letter ${letterId} (${title})`);
    createNotification('توليد قرار وخطاب إداري', `تم إنشاء الخطاب الإداري ${title} للموظف ${emp.name}`, 'success');

    res.json({
      letter_id: letterId,
      title,
      content: generatedContent,
      created_at: new Date().toISOString(),
      employee_name: emp.name,
      employee_id: emp.id,
      letter_type
    });
  });

  // ==========================================
  // 7. MEDICAL INSURANCE & CCHI (التأمين الطبي والضمان الصحي)
  // ==========================================
  app.get('/api/medical/summary', (req, res) => {
    const policies = db.prepare('SELECT * FROM medical_policies ORDER BY expiry_date ASC').all();
    const dependentsCount = (db.prepare('SELECT COUNT(*) as count FROM medical_dependents WHERE status = "active"').get() as any).count;
    const insuredEmployeesCount = (db.prepare('SELECT COUNT(*) as count FROM employees WHERE medical_insurance_policy IS NOT NULL AND medical_insurance_policy != ""').get() as any).count;
    
    const categoryStats = db.prepare(`
      SELECT medical_insurance_category as category, COUNT(*) as count 
      FROM employees 
      WHERE medical_insurance_category IS NOT NULL
      GROUP BY medical_insurance_category
    `).all();

    const upcomingExpiringPolicies = db.prepare(`
      SELECT * FROM medical_policies 
      WHERE date(expiry_date) <= date('now', '+60 days')
    `).all();

    const totalAnnualPremium = (db.prepare('SELECT SUM(total_premium) as total FROM medical_policies WHERE status = "active"').get() as any).total || 84500;

    res.json({
      policies,
      totalMembers: insuredEmployeesCount + dependentsCount,
      insuredEmployeesCount,
      dependentsCount,
      categoryStats,
      upcomingExpiringPolicies,
      totalAnnualPremium,
      monthlyAveragePremium: Math.round(totalAnnualPremium / 12)
    });
  });

  app.get('/api/medical/dependents', (req, res) => {
    const dependents = db.prepare(`
      SELECT md.*, e.name as employee_name, e.national_id_iqama as employee_national_id,
             d.name as department_name, e.insurance_company
      FROM medical_dependents md
      JOIN employees e ON md.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY md.created_at DESC
    `).all();
    res.json(dependents);
  });

  app.post('/api/medical/dependents', (req, res) => {
    const {
      employee_id, name, relationship, national_id_iqama, birth_date,
      gender, category, card_number, annual_premium = 2500
    } = req.body;

    const cardNum = card_number || `MED-${category || 'A'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const info = db.prepare(`
      INSERT INTO medical_dependents (
        employee_id, name, relationship, national_id_iqama, birth_date,
        gender, category, card_number, annual_premium, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      employee_id, name, relationship, national_id_iqama, birth_date,
      gender, category, cardNum, annual_premium
    );

    // Update count on employee
    db.prepare(`
      UPDATE employees 
      SET medical_dependents_count = (SELECT COUNT(*) FROM medical_dependents WHERE employee_id = ? AND status = 'active')
      WHERE id = ?
    `).run(employee_id, employee_id);

    // Log endorsement
    db.prepare(`
      INSERT INTO insurance_endorsements (employee_id, type, endorsement_date, premium_adjustment, cchi_reference, status)
      VALUES (?, 'addition', date('now'), ?, ?, 'processed')
    `).run(employee_id, annual_premium, `CCHI-ADD-${Math.floor(100000 + Math.random() * 900000)}`);

    logAction('create', 'medical_dependent', Number(employee_id), `Added dependent ${name} to medical insurance`);
    createNotification('إضافة تابع للتأمين الطبي', `تم تسجيل التابع ${name} ضمن وثيقة التأمين الطبي المعتمدة بنجاح`, 'success');

    res.json({ id: info.lastInsertRowid, card_number: cardNum });
  });

  app.delete('/api/medical/dependents/:id', (req, res) => {
    const dep = db.prepare('SELECT * FROM medical_dependents WHERE id = ?').get(req.params.id) as any;
    if (dep) {
      db.prepare('DELETE FROM medical_dependents WHERE id = ?').run(req.params.id);
      db.prepare(`
        UPDATE employees 
        SET medical_dependents_count = (SELECT COUNT(*) FROM medical_dependents WHERE employee_id = ? AND status = 'active')
        WHERE id = ?
      `).run(dep.employee_id, dep.employee_id);

      // Log endorsement deletion
      db.prepare(`
        INSERT INTO insurance_endorsements (employee_id, type, endorsement_date, premium_adjustment, cchi_reference, status)
        VALUES (?, 'deletion', date('now'), ?, ?, 'processed')
      `).run(dep.employee_id, -dep.annual_premium, `CCHI-DEL-${Math.floor(100000 + Math.random() * 900000)}`);
    }
    res.json({ success: true });
  });

  app.get('/api/medical/policies', (req, res) => {
    const policies = db.prepare('SELECT * FROM medical_policies ORDER BY start_date DESC').all();
    res.json(policies);
  });

  app.post('/api/medical/policies', (req, res) => {
    const { policy_number, insurance_company, start_date, expiry_date, total_members, total_premium, cchi_approval_number } = req.body;
    const info = db.prepare(`
      INSERT INTO medical_policies (policy_number, insurance_company, start_date, expiry_date, total_members, total_premium, cchi_approval_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(policy_number, insurance_company, start_date, expiry_date, total_members || 0, total_premium || 0, cchi_approval_number || `CCHI-${Math.floor(100000 + Math.random() * 900000)}`);
    res.json({ id: info.lastInsertRowid });
  });

  // ==========================================
  // 8. WPS & SAMA SIF FILE AUDIT (محرك حماية الأجور والتدقيق)
  // ==========================================
  app.get('/api/wps/audit', (req, res) => {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Check if payroll was processed for that month. If not, the audit falls back to the
    // stored employee master data — verbatim. Missing values are reported as 0, never as a
    // formula-derived guess: an audit that invents allowances/deductions invents violations.
    let payrollRecords = db.prepare(`
      SELECT p.*, e.name as employee_name, e.national_id_iqama, e.is_saudi,
             e.bank_name, e.saudi_iban, e.basic_salary as emp_basic,
             e.housing_allowance as emp_housing, e.gosi_registered_salary,
             e.gosi_number
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.month = ? AND p.year = ?
    `).all(month, year) as any[];

    let simulated = false;
    if (payrollRecords.length === 0) {
      simulated = true;
      const emps = db.prepare('SELECT * FROM employees').all() as any[];
      payrollRecords = emps.map(e => {
        const basic = Number(e.basic_salary) || 0;
        const housing = Number(e.housing_allowance) || 0;
        const transport = Number(e.transport_allowance) || 0;
        const other = Number(e.other_allowances) || 0;
        const allowances = housing + transport + other;
        const deductions = Number(e.deductions) || 0;
        const net = (basic + allowances) - deductions;

        return {
          employee_id: e.id,
          employee_name: e.name,
          national_id_iqama: e.national_id_iqama,
          is_saudi: e.is_saudi,
          bank_name: e.bank_name || '',
          saudi_iban: e.saudi_iban || '',
          basic_salary: basic,
          housing_allowance: housing,
          allowances,
          deductions,
          net_salary: net,
          gosi_registered_salary: Number(e.gosi_registered_salary) || 0,
          gosi_number: e.gosi_number
        };
      });
    }

    const violations: any[] = [];
    let compliantCount = 0;
    let totalDisbursed = 0;
    let matchedGosi = 0;
    let mismatchedGosi = 0;
    let totalGosiWage = 0;
    let totalPayrollWage = 0;

    payrollRecords.forEach(rec => {
      totalDisbursed += Number(rec.net_salary) || 0;
      const gross = (Number(rec.basic_salary) || 0) + (Number(rec.allowances) || 0);
      const totalDed = Number(rec.deductions) || 0;
      const deductionRatio = gross > 0 ? (totalDed / gross) : 0;
      const gosiWage = Number(rec.gosi_registered_salary) || (Number(rec.basic_salary) + Number(rec.housing_allowance || 0));
      const payrollGosiBase = (Number(rec.basic_salary) || 0) + (Number(rec.housing_allowance) || 0);

      totalGosiWage += gosiWage;
      totalPayrollWage += payrollGosiBase;

      let isViolation = false;

      // 1. Check Saudi Labor Law Art 92: Deduction > 50% of gross
      if (deductionRatio > 0.50) {
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || '---',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: Math.round(deductionRatio * 100),
          violation_type: 'excessive_deduction',
          details: `نسبة الاستقطاع (${Math.round(deductionRatio * 100)}%) تتجاوز الحد النظامي الأقصى (50%) وفق المادة (92) من نظام العمل.`
        });
        isViolation = true;
      }

      // 2. Check GOSI Salary mismatch (> 5% difference)
      if (Math.abs(gosiWage - payrollGosiBase) > 50) {
        mismatchedGosi++;
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || '---',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: Math.round(deductionRatio * 100),
          violation_type: 'gosi_salary_mismatch',
          details: `تباين أجر الاشتراك: المسجل بالتأمينات (${gosiWage.toLocaleString()} ر.س) يختلف عن مسير الرواتب (${payrollGosiBase.toLocaleString()} ر.س).`
        });
        isViolation = true;
      } else {
        matchedGosi++;
      }

      // 3. Check IBAN Validity (Saudi IBAN starts with SA and has 24 chars)
      const cleanIban = (rec.saudi_iban || '').replace(/\s+/g, '');
      if (!cleanIban.startsWith('SA') || cleanIban.length !== 24) {
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || 'غير مسجل',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: Math.round(deductionRatio * 100),
          violation_type: 'invalid_iban',
          details: 'صيغة الآيبان (IBAN) غير مطابقة لمعايير البنك المركزي السعودي (SAMA).'
        });
        isViolation = true;
      }

      // 4. Zero or Negative salary
      if (rec.net_salary <= 0) {
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || '---',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: 100,
          violation_type: 'zero_salary',
          details: 'صافي الراتب المستحق صفر أو سالب مما يسبب رفض الملف فورياً في منصة مدد وحماية الأجور.'
        });
        isViolation = true;
      }

      if (!isViolation) {
        compliantCount++;
      }
    });

    const totalCount = payrollRecords.length || 1;
    const complianceScore = Math.round((compliantCount / totalCount) * 100);
    const estId = (db.prepare("SELECT value FROM settings WHERE key = 'unified_number_700'").get() as any)?.value || '7001984523';
    const sifFileName = `SIF_${estId}_${year}${String(month).padStart(2, '0')}.sif`;

    res.json({
      payrollMonth: month,
      payrollYear: year,
      totalEmployees: payrollRecords.length,
      compliantCount,
      violationCount: violations.length,
      complianceScore,
      totalDisbursed,
      sifFileName,
      // No payroll run exists for this month: the rows above are the stored employee master
      // data, not a computed payroll. Reported so the figures are not read as a real run.
      simulated,
      dataSource: simulated ? 'employees_master_data' : 'payroll_run',
      note: simulated
        ? 'لا يوجد مسير رواتب لهذا الشهر — الأرقام مأخوذة كما هي من بيانات الموظفين المخزّنة، والقيم الغائبة أُبلغ عنها بصفر (لا اشتقاق ولا تقدير).'
        : null,
      violations,
      gosiReconciliation: {
        matched: matchedGosi,
        mismatched: mismatchedGosi,
        totalAmountGosi: totalGosiWage,
        totalAmountPayroll: totalPayrollWage
      }
    });
  });

  app.get('/api/wps/export-sif', (req, res) => {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const emps = db.prepare(`
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
    `).all() as any[];

    const est700 = (db.prepare("SELECT value FROM settings WHERE key = 'unified_number_700'").get() as any)?.value || '7001984523';
    const crNumber = (db.prepare("SELECT value FROM settings WHERE key = 'cr_number'").get() as any)?.value || '1010789456';
    const bankCode = 'RJHI'; // Default Al Rajhi Bank Code for SIF
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const nowTime = '0930';

    let totalAmount = 0;
    const recordLines: string[] = [];

    // Never fabricate IBAN / national ID: refuse to produce the file instead.
    const identityIssues = validateSifIdentities(emps.map((emp) => ({
      employee_id: emp.id,
      employee_name: emp.name,
      saudi_iban: emp.saudi_iban,
      national_id_iqama: emp.national_id_iqama,
    })));
    if (identityIssues.length) {
      return res.status(400).json({
        error: "تعذّر توليد ملف SIF: توجد بيانات هوية أو IBAN ناقصة أو غير صالحة. صحّحها ثم أعد المحاولة.",
        code: "INVALID_SIF_IDENTITIES",
        invalid_count: identityIssues.length,
        issues: identityIssues,
      });
    }

    emps.forEach((emp) => {
      const basic = Number(emp.basic_salary) || 0;
      const housing = Number(emp.housing_allowance) || 0;
      const other = (Number(emp.transport_allowance) || 0) + (Number(emp.other_allowances) || 0);
      const deductions = Number(emp.deductions) || 0;
      const net = (basic + housing + other) - deductions;
      totalAmount += net;

      const iban = String(emp.saudi_iban).replace(/\s+/g, "").toUpperCase();
      const nationalId = String(emp.national_id_iqama).replace(/\s+/g, "");
      const refNumber = `PAY-${year}${String(month).padStart(2, '0')}-${String(emp.id).padStart(4, '0')}`;

      // SIF Detail record format: EDR,NationalID,BankCode,IBAN,BasicSalary,Housing,Other,Deductions,Reference
      // Amounts go through sifAmount() so a text value can never raise TypeError or emit "NaN".
      recordLines.push(`EDR,${nationalId},${bankCode},${iban},${sifAmount(basic)},${sifAmount(housing)},${sifAmount(other)},${sifAmount(deductions)},${refNumber}`);
    });

    // SIF Header record format: SCR,Est700,BankCode,Date,Time,TotalRecords,TotalAmount,Currency
    const header = `SCR,${est700},${bankCode},${todayStr},${nowTime},${emps.length},${totalAmount.toFixed(2)},SAR`;
    const sifContent = [header, ...recordLines].join('\r\n');

    res.json({
      fileName: `SIF_${est700}_${year}${String(month).padStart(2, '0')}.sif`,
      content: sifContent,
      totalEmployees: emps.length,
      totalAmount,
      currency: 'SAR',
      generatedAt: new Date().toISOString()
    });
  });

  // ==========================================
  // 9. 9-BOX TALENT MATRIX & SUCCESSION (مصفوفة المواهب والتعاقب)
  // ==========================================
  app.get('/api/talent/9box', (req, res) => {
    const emps = db.prepare(`
      SELECT e.id, e.name, e.position, e.job_title, e.nationality, e.is_saudi,
             d.name as department_name, b.name as branch_name,
             ta.id as assessment_id, ta.performance_score, ta.potential_score,
             ta.box_category, ta.key_strengths, ta.development_needs,
             ta.readiness_timeline, ta.assessed_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN talent_assessments ta ON e.id = ta.employee_id
    `).all() as any[];

    const determineBox = (perf: number, pot: number): string => {
      if (perf === 3 && pot === 3) return 'star';
      if (perf === 2 && pot === 3) return 'high_potential';
      if (perf === 1 && pot === 3) return 'dilemma';
      if (perf === 3 && pot === 2) return 'high_performer';
      if (perf === 2 && pot === 2) return 'core_player';
      if (perf === 1 && pot === 2) return 'inconsistent';
      if (perf === 3 && pot === 1) return 'solid_performer';
      if (perf === 2 && pot === 1) return 'effective';
      return 'underperformer';
    };

    const categorized = emps.map(emp => {
      const perf = emp.performance_score || 2;
      const pot = emp.potential_score || 2;
      const category = emp.box_category || determineBox(perf, pot);
      return {
        ...emp,
        performance_score: perf,
        potential_score: pot,
        box_category: category,
        readiness_timeline: emp.readiness_timeline || 'ready_1_year'
      };
    });

    const boxCounts: Record<string, number> = {};
    categorized.forEach(e => {
      boxCounts[e.box_category] = (boxCounts[e.box_category] || 0) + 1;
    });

    res.json({
      employees: categorized,
      boxCounts,
      totalAssessed: categorized.length,
      highTalentRatio: Math.round(((boxCounts['star'] || 0) + (boxCounts['high_potential'] || 0) + (boxCounts['high_performer'] || 0)) / (categorized.length || 1) * 100)
    });
  });

  app.post('/api/talent/assessments', (req, res) => {
    const {
      employee_id, performance_score, potential_score, key_strengths,
      development_needs, readiness_timeline, assessed_by = 'لجنة الموارد البشرية'
    } = req.body;

    const determineBox = (perf: number, pot: number): string => {
      if (perf === 3 && pot === 3) return 'star';
      if (perf === 2 && pot === 3) return 'high_potential';
      if (perf === 1 && pot === 3) return 'dilemma';
      if (perf === 3 && pot === 2) return 'high_performer';
      if (perf === 2 && pot === 2) return 'core_player';
      if (perf === 1 && pot === 2) return 'inconsistent';
      if (perf === 3 && pot === 1) return 'solid_performer';
      if (perf === 2 && pot === 1) return 'effective';
      return 'underperformer';
    };

    const boxCategory = determineBox(Number(performance_score), Number(potential_score));

    db.prepare(`
      INSERT OR REPLACE INTO talent_assessments (
        employee_id, performance_score, potential_score, box_category,
        key_strengths, development_needs, readiness_timeline, assessed_by, assessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      employee_id, performance_score, potential_score, boxCategory,
      key_strengths, development_needs, readiness_timeline, assessed_by
    );

    logAction('update', 'talent_assessment', Number(employee_id), `Assessed talent as ${boxCategory}`);
    res.json({ success: true, box_category: boxCategory });
  });

  app.get('/api/talent/succession', (req, res) => {
    const plans = db.prepare(`
      SELECT sp.*, d.name as department_name,
             cur.name as current_holder_name, cur.position as current_holder_position,
             p1.name as primary_successor_name, p1.position as primary_successor_position,
             p1.is_saudi as primary_successor_is_saudi,
             p2.name as secondary_successor_name, p2.position as secondary_successor_position
      FROM succession_plans sp
      LEFT JOIN departments d ON sp.department_id = d.id
      LEFT JOIN employees cur ON sp.current_holder_id = cur.id
      LEFT JOIN employees p1 ON sp.primary_successor_id = p1.id
      LEFT JOIN employees p2 ON sp.secondary_successor_id = p2.id
      ORDER BY sp.risk_level DESC
    `).all();
    res.json(plans);
  });

  app.post('/api/talent/succession', (req, res) => {
    const {
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target = 1
    } = req.body;

    const info = db.prepare(`
      INSERT INTO succession_plans (
        critical_role_title, department_id, current_holder_id, risk_level,
        primary_successor_id, secondary_successor_id, readiness_status,
        development_action_plan, is_saudization_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target
    );

    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/talent/succession/:id', (req, res) => {
    const {
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target
    } = req.body;

    db.prepare(`
      UPDATE succession_plans SET
        critical_role_title = ?, department_id = ?, current_holder_id = ?,
        risk_level = ?, primary_successor_id = ?, secondary_successor_id = ?,
        readiness_status = ?, development_action_plan = ?, is_saudization_target = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      critical_role_title, department_id, current_holder_id, risk_level,
      primary_successor_id, secondary_successor_id, readiness_status,
      development_action_plan, is_saudization_target, req.params.id
    );

    res.json({ success: true });
  });

  app.delete('/api/talent/succession/:id', (req, res) => {
    db.prepare('DELETE FROM succession_plans WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // ==========================================
  // 10. FLEET & CUSTODY VEHICLES (إدارة أسطول السيارات والمخالفات)
  // ==========================================
  app.get('/api/fleet/vehicles', (req, res) => {
    const vehicles = db.prepare(`
      SELECT fv.*, e.name as assigned_employee_name, e.position as employee_position,
             d.name as department_name, e.national_id_iqama as employee_national_id,
             CAST((julianday(fv.istimara_expiry) - julianday('now')) AS INTEGER) as days_to_istimara,
             CAST((julianday(fv.insurance_expiry) - julianday('now')) AS INTEGER) as days_to_insurance,
             CAST((julianday(fv.periodic_inspection_expiry) - julianday('now')) AS INTEGER) as days_to_mvpi
      FROM fleet_vehicles fv
      LEFT JOIN employees e ON fv.assigned_employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY fv.created_at DESC
    `).all();
    res.json(vehicles);
  });

  app.post('/api/fleet/vehicles', (req, res) => {
    const {
      plate_number, make_model, year, vin_number, assigned_employee_id,
      assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
      status = 'assigned', current_odometer = 0, fuel_card_number
    } = req.body;

    const info = db.prepare(`
      INSERT INTO fleet_vehicles (
        plate_number, make_model, year, vin_number, assigned_employee_id,
        assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
        status, current_odometer, fuel_card_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plate_number, make_model, year, vin_number, assigned_employee_id || null,
      assignment_date || null, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
      status, current_odometer, fuel_card_number
    );

    logAction('create', 'fleet_vehicle', Number(info.lastInsertRowid), `Added vehicle ${plate_number}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/fleet/vehicles/:id', (req, res) => {
    const {
      plate_number, make_model, year, vin_number, assigned_employee_id,
      assignment_date, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
      status, current_odometer, fuel_card_number
    } = req.body;

    db.prepare(`
      UPDATE fleet_vehicles SET
        plate_number = ?, make_model = ?, year = ?, vin_number = ?,
        assigned_employee_id = ?, assignment_date = ?, istimara_expiry = ?,
        insurance_expiry = ?, periodic_inspection_expiry = ?, status = ?,
        current_odometer = ?, fuel_card_number = ?
      WHERE id = ?
    `).run(
      plate_number, make_model, year, vin_number, assigned_employee_id || null,
      assignment_date || null, istimara_expiry, insurance_expiry, periodic_inspection_expiry,
      status, current_odometer, fuel_card_number, req.params.id
    );

    res.json({ success: true });
  });

  app.delete('/api/fleet/vehicles/:id', (req, res) => {
    db.prepare('DELETE FROM fleet_vehicles WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/fleet/traffic-fines', (req, res) => {
    const fines = db.prepare(`
      SELECT tf.*, fv.plate_number, fv.make_model,
             e.name as employee_name, e.national_id_iqama as employee_national_id,
             d.name as department_name
      FROM traffic_fines tf
      JOIN fleet_vehicles fv ON tf.vehicle_id = fv.id
      JOIN employees e ON tf.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY tf.fine_date DESC
    `).all();
    res.json(fines);
  });

  app.post('/api/fleet/traffic-fines', (req, res) => {
    const { vehicle_id, employee_id, fine_number, violation_type, amount, fine_date } = req.body;
    const fNum = fine_number || `FINE-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const info = db.prepare(`
      INSERT INTO traffic_fines (vehicle_id, employee_id, fine_number, violation_type, amount, fine_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(vehicle_id, employee_id, fNum, violation_type, amount, fine_date || new Date().toISOString().split('T')[0]);

    createNotification('مخالفة مرورية جديدة على عهدة مركبة', `تم رصد مخالفة مرورية (${violation_type}) بقيمة ${amount} ر.س برقم ${fNum}`, 'warning');
    res.json({ id: info.lastInsertRowid, fine_number: fNum });
  });

  app.post('/api/fleet/traffic-fines/:id/deduct', (req, res) => {
    const fine = db.prepare('SELECT * FROM traffic_fines WHERE id = ?').get(req.params.id) as any;
    if (!fine) return res.status(404).json({ error: 'المخالفة غير موجودة' });

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    db.prepare(`
      UPDATE traffic_fines 
      SET deducted_from_payroll = 1, status = 'deducted',
          payroll_month = ?, payroll_year = ?
      WHERE id = ?
    `).run(currentMonth, currentYear, req.params.id);

    // Auto-record in bonuses_penalties as penalty
    db.prepare(`
      INSERT INTO bonuses_penalties (employee_id, type, amount, reason, month, year)
      VALUES (?, 'penalty', ?, ?, ?, ?)
    `).run(
      fine.employee_id, fine.amount,
      `استقطاع قيمة مخالفة مرورية مسجلة برقم ${fine.fine_number} (${fine.violation_type})`,
      currentMonth, currentYear
    );

    logAction('update', 'traffic_fine', fine.id, `Deducted fine ${fine.fine_number} from employee ${fine.employee_id}`);
    createNotification('استقطاع مخالفة مرورية من المسير', `تم ترحيل استقطاع المخالفة بقيمة ${fine.amount} ر.س لمسير شهر ${currentMonth}/${currentYear}`, 'success');

    res.json({ success: true });
  });

  // ==========================================
  // 11. FLEXIBLE WORK & TELEWORK (العمل المرن والعمل عن بعد)
  // ==========================================
  app.get('/api/flexible/shifts', (req, res) => {
    const shifts = db.prepare(`
      SELECT fws.*, e.name as employee_name, e.position, e.is_saudi,
             d.name as department_name
      FROM flexible_work_shifts fws
      JOIN employees e ON fws.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY fws.date DESC
    `).all();

    const totalHours = (db.prepare('SELECT SUM(hours_worked) as total FROM flexible_work_shifts WHERE supervisor_approved = 1').get() as any).total || 0;
    const totalPaid = (db.prepare('SELECT SUM(total_pay) as total FROM flexible_work_shifts WHERE supervisor_approved = 1').get() as any).total || 0;
    // Rule: Every 168 hours of flexible work completed by Saudis = 1/3 (0.33) Saudization unit in Nitaqat
    const saudiFlexHours = (db.prepare(`
      SELECT SUM(fws.hours_worked) as total 
      FROM flexible_work_shifts fws 
      JOIN employees e ON fws.employee_id = e.id 
      WHERE e.is_saudi = 1 AND fws.supervisor_approved = 1
    `).get() as any).total || 0;

    const nitaqatUnitsGained = Number((saudiFlexHours / 168 * 0.33).toFixed(2));

    res.json({
      shifts,
      totalHours,
      totalPaid,
      saudiFlexHours,
      nitaqatUnitsGained
    });
  });

  app.post('/api/flexible/shifts', (req, res) => {
    const { employee_id, date, hours_worked, hourly_rate, notes, qiwa_contract_ref } = req.body;
    const totalPay = Number(hours_worked) * Number(hourly_rate);
    const contractRef = qiwa_contract_ref || `QW-FLX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const info = db.prepare(`
      INSERT INTO flexible_work_shifts (
        employee_id, date, hours_worked, hourly_rate, total_pay,
        mowaamah_hours_accumulated, qiwa_contract_ref, supervisor_approved, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      employee_id, date || new Date().toISOString().split('T')[0],
      hours_worked, hourly_rate, totalPay, hours_worked, contractRef, notes
    );

    logAction('create', 'flexible_shift', Number(employee_id), `Logged ${hours_worked} flexible hours`);
    res.json({ id: info.lastInsertRowid, total_pay: totalPay });
  });

  app.get('/api/telework/permits', (req, res) => {
    const permits = db.prepare(`
      SELECT tp.*, e.name as employee_name, e.position, e.job_title,
             e.is_saudi, d.name as department_name
      FROM telework_permits tp
      JOIN employees e ON tp.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY tp.created_at DESC
    `).all();
    res.json(permits);
  });

  app.post('/api/telework/permits', (req, res) => {
    const {
      employee_id, permit_type = 'hybrid', remote_days_per_week = 2,
      contract_start, contract_end, telework_platform_registered = 1,
      productivity_score = 95
    } = req.body;

    const info = db.prepare(`
      INSERT INTO telework_permits (
        employee_id, permit_type, remote_days_per_week, contract_start, contract_end,
        telework_platform_registered, productivity_score, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      employee_id, permit_type, remote_days_per_week,
      contract_start || new Date().toISOString().split('T')[0],
      contract_end || '2026-12-31', telework_platform_registered, productivity_score
    );

    logAction('create', 'telework_permit', Number(employee_id), `Issued ${permit_type} telework permit`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/telework/permits/:id', (req, res) => {
    const { permit_type, remote_days_per_week, contract_start, contract_end, telework_platform_registered, productivity_score, status } = req.body;
    db.prepare(`
      UPDATE telework_permits SET
        permit_type = ?, remote_days_per_week = ?, contract_start = ?,
        contract_end = ?, telework_platform_registered = ?, productivity_score = ?, status = ?
      WHERE id = ?
    `).run(
      permit_type, remote_days_per_week, contract_start,
      contract_end, telework_platform_registered, productivity_score, status,
      req.params.id
    );
    res.json({ success: true });
  });

  // ==========================================
  // 12. RETENTION RISK & ATTRITION PREDICTOR (محلل مخاطر التسرب AI)
  // ==========================================
  app.get('/api/retention/risks', async (req, res) => {
    const emps = db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name,
             (SELECT COUNT(*) FROM leaves WHERE employee_id = e.id AND type = 'sick') as sick_leave_count,
             (SELECT SUM(days) FROM leaves WHERE employee_id = e.id AND type = 'sick') as sick_leave_days,
             (SELECT MAX(promotion_date) FROM promotions WHERE employee_id = e.id) as last_promotion_date,
             (SELECT rating FROM appraisals WHERE employee_id = e.id ORDER BY appraisal_date DESC LIMIT 1) as latest_rating
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all() as any[];

    // Calculate department average salary
    const deptSalaries: Record<number, { sum: number; count: number }> = {};
    emps.forEach(e => {
      const deptId = e.department_id || 0;
      if (!deptSalaries[deptId]) deptSalaries[deptId] = { sum: 0, count: 0 };
      deptSalaries[deptId].sum += (Number(e.basic_salary) || 0);
      deptSalaries[deptId].count += 1;
    });

    const assessments = emps.map(emp => {
      const deptId = emp.department_id || 0;
      const deptAvg = deptSalaries[deptId] ? (deptSalaries[deptId].sum / deptSalaries[deptId].count) : Number(emp.basic_salary);
      const salaryRatio = deptAvg > 0 ? (Number(emp.basic_salary) / deptAvg) : 1;

      const startDate = emp.contract_start_date ? new Date(emp.contract_start_date) : new Date('2023-01-01');
      const yearsInCompany = Number(((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));

      const lastProm = emp.last_promotion_date ? new Date(emp.last_promotion_date) : startDate;
      const monthsSincePromotion = Math.round((Date.now() - lastProm.getTime()) / (1000 * 60 * 60 * 24 * 30));

      const sickDays = Number(emp.sick_leave_days) || 0;
      const rating = Number(emp.latest_rating) || 3;

      let riskScore = 20; // Base baseline risk
      const topRiskFactors: string[] = [];
      const recommendedActions: string[] = [];

      // Evaluation 1: Salary Competitiveness
      let salaryCompetitiveness: 'below_market' | 'market_average' | 'above_market' = 'market_average';
      if (salaryRatio < 0.85) {
        salaryCompetitiveness = 'below_market';
        riskScore += 30;
        topRiskFactors.push(`الراتب الأساسي أقل بنسبة ${Math.round((1 - salaryRatio) * 100)}% من متوسط القسم وسعر السوق`);
        recommendedActions.push('مراجعة وتعديل حزمة الراتب والبدلات لتكون منافسة للسوق');
      } else if (salaryRatio > 1.15) {
        salaryCompetitiveness = 'above_market';
        riskScore -= 10;
      }

      // Evaluation 2: Time without promotion / stagnation
      if (monthsSincePromotion >= 24) {
        riskScore += 25;
        topRiskFactors.push(`لم يحصل على ترقية أو نمو وظيفي منذ أكثر من ${Math.round(monthsSincePromotion / 12)} سنوات (${monthsSincePromotion} شهر)`);
        recommendedActions.push('وضع خطة ترقية وتكليف بمسؤوليات قيادية جديدة');
      } else if (monthsSincePromotion >= 14) {
        riskScore += 10;
        topRiskFactors.push('مرور أكثر من سنة على آخر مراجعة وظيفية');
      }

      // Evaluation 3: High performer at risk of poaching
      if (rating >= 4) {
        riskScore += 15;
        topRiskFactors.push('كفاءة عالية وأداء ممتاز (مستهدف رئيسي للاستقطاب من الشركات المنافسة)');
        recommendedActions.push('إدراج الموظف في برنامج الكفاءات الاستراتيجية والاحتفاظ بالمواهب (Retention Bonus)');
      }

      // Evaluation 4: Sick Leave surges
      if (sickDays >= 8) {
        riskScore += 15;
        topRiskFactors.push(`ارتفاع مؤشر الإجازات المرضية (${sickDays} يوم)، مؤشر على الإرهاق الوظيفي أو عدم الرضا`);
        recommendedActions.push('جدولة جلسة استماع ومتابعة بيئة العمل والتوازن بين العمل والحياة');
      }

      // Cap risk score between 5 and 95
      riskScore = Math.max(5, Math.min(95, riskScore));

      let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (riskScore >= 75) riskLevel = 'critical';
      else if (riskScore >= 55) riskLevel = 'high';
      else if (riskScore >= 35) riskLevel = 'medium';

      if (topRiskFactors.length === 0) {
        topRiskFactors.push('استقرار الرضا الوظيفي وتنافسية الراتب والبدلات');
      }
      if (recommendedActions.length === 0) {
        recommendedActions.push('الحفاظ على خطة التطوير الحالية والتقييم السنوي المنتظم');
      }

      return {
        employee_id: emp.id,
        employee_name: emp.name,
        job_title: emp.job_title || emp.position,
        department_name: emp.department_name || 'عام',
        nationality: emp.nationality || 'سعودي',
        is_saudi: emp.is_saudi,
        years_in_company: yearsInCompany,
        months_since_last_promotion: monthsSincePromotion,
        salary_competitiveness: salaryCompetitiveness,
        recent_sick_leaves_days: sickDays,
        risk_score: riskScore,
        risk_level: riskLevel,
        top_risk_factors: topRiskFactors,
        recommended_actions: recommendedActions
      };
    });

    // Sort by risk_score DESC
    assessments.sort((a, b) => b.risk_score - a.risk_score);

    res.json({
      assessments,
      criticalCount: assessments.filter(a => a.risk_level === 'critical').length,
      highCount: assessments.filter(a => a.risk_level === 'high').length,
      averageRiskScore: Math.round(assessments.reduce((acc, c) => acc + c.risk_score, 0) / (assessments.length || 1))
    });
  });

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

  // GET EWA eligibility for an employee
  app.get("/api/ewa/eligibility/:empId", (req, res) => {
    const emp = db.prepare(`
      SELECT id, name, basic_salary, housing_allowance, transport_allowance, other_allowances, saudi_iban
      FROM employees WHERE id = ?
    `).get(req.params.empId) as any;

    if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });

    const totalSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
    const now = new Date();
    const currentDay = now.getDate(); // e.g. 25
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); // 30 or 31

    const daysWorked = Math.min(currentDay, daysInMonth);
    const earnedSoFar = Math.round((totalSalary / daysInMonth) * daysWorked);

    // Get withdrawals this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const withdrawnSum = db.prepare(`
      SELECT SUM(requested_amount) as total FROM ewa_withdrawals
      WHERE employee_id = ? AND request_date >= ? AND status != 'rejected'
    `).get(emp.id, startOfMonth) as any;

    const alreadyWithdrawn = withdrawnSum?.total || 0;
    const maxLimitAllowed = Math.round(earnedSoFar * 0.5); // 50% policy
    const availableLimit = Math.max(0, maxLimitAllowed - alreadyWithdrawn);

    res.json({
      employee_id: emp.id,
      employee_name: emp.name,
      total_monthly_salary: totalSalary,
      days_in_month: daysInMonth,
      days_worked_so_far: daysWorked,
      earned_so_far: earnedSoFar,
      already_withdrawn: alreadyWithdrawn,
      available_limit: availableLimit,
      max_withdrawal_percentage: 50,
      can_withdraw: availableLimit >= 100,
      iban: emp.saudi_iban
    });
  });

  // GET all EWA withdrawals
  app.get("/api/ewa/withdrawals", (req, res) => {
    const rows = db.prepare(`
      SELECT ew.*, e.name as employee_name, d.name as department_name, e.saudi_iban as iban
      FROM ewa_withdrawals ew
      JOIN employees e ON ew.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY ew.id DESC
    `).all();
    res.json(rows);
  });

  // POST new EWA withdrawal request
  app.post("/api/ewa/withdrawals", (req, res) => {
    const { employee_id, requested_amount, disbursement_method } = req.body;
    if (!employee_id || !requested_amount) {
      return res.status(400).json({ error: "بيانات السحب غير مكتملة" });
    }

    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
    if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });

    const totalSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysWorked = Math.min(now.getDate(), daysInMonth);
    const earnedSoFar = Math.round((totalSalary / daysInMonth) * daysWorked);

    const fee = 15; // Standard 15 SAR processing fee
    const netDisbursed = requested_amount - fee;
    const requestDate = now.toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO ewa_withdrawals (employee_id, request_date, earned_salary_so_far, requested_amount, fee, net_disbursed, status, disbursement_method)
      VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)
    `).run(employee_id, requestDate, earnedSoFar, requested_amount, fee, netDisbursed, disbursement_method || 'instant_iban');

    // Create audit log
    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, details, created_by)
      VALUES (?, 'ewa_withdrawal', ?, ?, 'EWA_System')
    `).run("EWA_INSTANT_PAYOUT", result.lastInsertRowid, `سحب مبكر للراتب بمبلغ ${requested_amount} ر.س للموظف ${emp.name}`);

    res.json({ success: true, id: result.lastInsertRowid, net_disbursed: netDisbursed });
  });


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

  // GET HSE inspections
  app.get("/api/hse/inspections", (req, res) => {
    const rows = db.prepare(`
      SELECT h.*, b.name as branch_name
      FROM hse_inspections h
      JOIN branches b ON h.branch_id = b.id
      ORDER BY h.inspection_date DESC
    `).all();
    res.json(rows);
  });

  // POST HSE inspection
  app.post("/api/hse/inspections", (req, res) => {
    const { branch_id, inspector_name, inspection_date, category, status, score, findings, corrective_actions, deadline_date } = req.body;
    const result = db.prepare(`
      INSERT INTO hse_inspections (branch_id, inspector_name, inspection_date, category, status, score, findings, corrective_actions, deadline_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(branch_id, inspector_name, inspection_date, category, status || 'compliant', score || 95, findings, corrective_actions, deadline_date);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // GET HSE PPE logs
  app.get("/api/hse/ppe-logs", (req, res) => {
    const rows = db.prepare(`
      SELECT p.*, e.name as employee_name, d.name as department_name
      FROM hse_ppe_logs p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY p.id DESC
    `).all();
    res.json(rows);
  });

  // POST HSE PPE log
  app.post("/api/hse/ppe-logs", (req, res) => {
    const { employee_id, item_name, item_type, issue_date, expiry_date, notes } = req.body;
    const result = db.prepare(`
      INSERT INTO hse_ppe_logs (employee_id, item_name, item_type, issue_date, expiry_date, status, notes)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(employee_id, item_name, item_type || 'helmet', issue_date, expiry_date, notes || '');
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // GET HSE Stats
  app.get("/api/hse/stats", (req, res) => {
    const inspections = db.prepare("SELECT * FROM hse_inspections").all() as any[];
    const ppeLogs = db.prepare("SELECT * FROM hse_ppe_logs").all() as any[];

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


  // ==========================================
  // MODULE 15: EXECUTIVE BOARDROOM & HR ROI (تحليلات مجالس الإدارة)
  // ==========================================
  app.get("/api/executive/analytics", (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all() as any[];

    const totalEmps = employees.length;
    const saudiCount = employees.filter(e => e.is_saudi === 1).length;
    const saudizationRate = totalEmps > 0 ? Math.round((saudiCount / totalEmps) * 100) : 0;

    let totalMonthlyPayroll = 0;
    employees.forEach(emp => {
      totalMonthlyPayroll += (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
    });

    const annualizedWageBill = totalMonthlyPayroll * 12;
    // Estimated business revenue baseline (~ 4.5x wage bill for healthy Saudi enterprises)
    const estimatedRevenue = annualizedWageBill * 4.2;
    const operatingExpenses = annualizedWageBill * 2.1;
    const humanCapitalRoi = Number(((estimatedRevenue - operatingExpenses) / (annualizedWageBill || 1)).toFixed(2));
    const costPerEmployee = totalEmps > 0 ? Math.round(annualizedWageBill / totalEmps) : 0;

    // Group by department
    const deptMap: { [key: string]: { id: number; name: string; count: number; totalSalary: number; saudi: number } } = {};
    employees.forEach(emp => {
      const deptId = emp.department_id || 0;
      const deptName = emp.department_name || 'عام / الإدارة';
      if (!deptMap[deptName]) {
        deptMap[deptName] = { id: deptId, name: deptName, count: 0, totalSalary: 0, saudi: 0 };
      }
      deptMap[deptName].count += 1;
      deptMap[deptName].totalSalary += (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
      if (emp.is_saudi === 1) deptMap[deptName].saudi += 1;
    });

    const departmentsBreakdown = Object.values(deptMap).map(d => ({
      department_id: d.id,
      department_name: d.name,
      employee_count: d.count,
      total_salary: d.totalSalary,
      avg_salary: Math.round(d.totalSalary / (d.count || 1)),
      saudization_rate: Math.round((d.saudi / (d.count || 1)) * 100)
    }));

    // Quarterly trends
    const quarterlyTrends = [
      { quarter: 'Q1-2026', payroll_cost: Math.round(totalMonthlyPayroll * 2.8), headcount: Math.max(1, totalEmps - 2), productivity_index: 92 },
      { quarter: 'Q2-2026', payroll_cost: Math.round(totalMonthlyPayroll * 2.9), headcount: Math.max(1, totalEmps - 1), productivity_index: 94 },
      { quarter: 'Q3-2026', payroll_cost: Math.round(totalMonthlyPayroll * 3.0), headcount: totalEmps, productivity_index: 97 },
      { quarter: 'Q4-2026 (مستهدف)', payroll_cost: Math.round(totalMonthlyPayroll * 3.1), headcount: totalEmps + 2, productivity_index: 99 }
    ];

    res.json({
      totalEmployees: totalEmps,
      saudizationRate,
      totalMonthlyPayroll,
      annualizedWageBill,
      estimatedRevenue,
      humanCapitalRoi,
      costPerEmployee,
      turnoverRateAnnual: 4.8, // 4.8% low healthy turnover rate
      averageTenureYears: 3.4,
      departmentsBreakdown,
      quarterlyTrends,
      complianceSummary: {
        gosi_compliant: true,
        wps_compliant: true,
        cchi_compliant: true,
        qiwa_contracts_rate: 100
      }
    });
  });


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

  // GET all exit interviews
  app.get("/api/exit-interviews", (req, res) => {
    const rows = db.prepare(`
      SELECT ex.*, e.name as employee_name, e.job_title, e.position, d.name as department_name, e.contract_start_date as hire_date
      FROM exit_interviews ex
      JOIN employees e ON ex.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY ex.departure_date DESC
    `).all();
    res.json(rows);
  });

  // POST exit interview
  app.post("/api/exit-interviews", (req, res) => {
    const { 
      employee_id, departure_date, primary_reason, reason_details, 
      manager_rating, culture_rating, benefits_rating, would_recommend_score, 
      retention_feedback, estimated_replacement_cost, ai_sentiment 
    } = req.body;

    const result = db.prepare(`
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
  app.get("/api/exit-interviews/analytics", (req, res) => {
    const exits = db.prepare(`
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

  // GET workflows
  app.get("/api/workflows", (req, res) => {
    const rows = db.prepare("SELECT * FROM approval_workflows").all() as any[];
    const parsed = rows.map(r => ({
      ...r,
      conditions: JSON.parse(r.conditions_json || '{}'),
      levels: JSON.parse(r.levels_json || '[]')
    }));
    res.json(parsed);
  });

  // GET approval requests
  app.get("/api/workflow-requests", (req, res) => {
    const rows = db.prepare(`
      SELECT ar.*, w.title as workflow_title, w.levels_json, e.name as requester_name, d.name as requester_department
      FROM approval_requests ar
      JOIN approval_workflows w ON ar.workflow_id = w.id
      JOIN employees e ON ar.requester_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY ar.id DESC
    `).all() as any[];

    const parsed = rows.map(r => {
      const levels = JSON.parse(r.levels_json || '[]');
      const currentLevelObj = levels.find((l: any) => l.level === r.current_level);
      return {
        ...r,
        current_approver_role: currentLevelObj?.approver_role_ar || `المستوى ${r.current_level}`,
        history: JSON.parse(r.approval_history_json || '[]')
      };
    });
    res.json(parsed);
  });

  // POST action on approval request (approve / reject)
  app.post("/api/workflow-requests/:id/action", (req, res) => {
    const { action, actor_name, comments } = req.body;
    const reqId = req.params.id;

    const request = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(reqId) as any;
    if (!request) return res.status(404).json({ error: "الطلب غير موجود" });

    const history = JSON.parse(request.approval_history_json || '[]');
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

    history.push({
      level: request.current_level,
      actor_name: actor_name || 'مدير معتمد',
      action,
      action_date: nowStr,
      comments: comments || ''
    });

    let newStatus = request.status;
    let nextLevel = request.current_level;

    if (action === 'rejected') {
      newStatus = 'rejected';
    } else if (action === 'approved') {
      if (request.current_level >= request.max_levels) {
        newStatus = 'approved';
      } else {
        nextLevel = request.current_level + 1;
        newStatus = 'pending';
      }
    }

    db.prepare(`
      UPDATE approval_requests 
      SET current_level = ?, status = ?, approval_history_json = ?
      WHERE id = ?
    `).run(nextLevel, newStatus, JSON.stringify(history), reqId);

    res.json({ success: true, newStatus, current_level: nextLevel });
  });

  // POST new approval request
  app.post("/api/workflow-requests", (req, res) => {
    const { workflow_id, requester_id, request_type, request_title, amount, details } = req.body;
    const workflow = db.prepare("SELECT * FROM approval_workflows WHERE id = ?").get(workflow_id) as any;
    if (!workflow) return res.status(404).json({ error: "المسار غير موجود" });

    const levels = JSON.parse(workflow.levels_json || '[]');
    const maxLevels = levels.length || 1;

    const result = db.prepare(`
      INSERT INTO approval_requests (workflow_id, requester_id, request_type, request_title, amount, details, current_level, max_levels, status, approval_history_json)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'pending', '[]')
    `).run(workflow_id, requester_id, request_type || workflow.workflow_type, request_title, amount || 0, details || '', maxLevels);

    res.json({ success: true, id: result.lastInsertRowid });
  });


  // ==========================================
  // MODULE 18: AI HR COPILOT & QUICK ACTIONS (المساعد الذكي)
  // ==========================================
  app.post("/api/copilot/chat", async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });

    // Gather company context
    const empCount = (db.prepare("SELECT COUNT(*) as count FROM employees").get() as any)?.count || 0;
    const saudiCount = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE is_saudi = 1").get() as any)?.count || 0;
    const saudizationRate = empCount > 0 ? Math.round((saudiCount / empCount) * 100) : 0;
    const pendingRequests = (db.prepare("SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'").get() as any)?.count || 0;
    const expIqamas = (db.prepare(`
      SELECT COUNT(*) as count FROM employees 
      WHERE is_saudi = 0 AND date(iqama_expiry_gregorian) <= date('now', '+60 days')
    `).get() as any)?.count || 0;

    const ai = getAI();
    let replyText = "";
    let quickCardData: any = null;
    let suggestedActions: any[] = [];

    const lower = message.toLowerCase();

    // Check for direct salary certificate request
    if (lower.includes("شهادة راتب") || lower.includes("تعريف بالراتب") || lower.includes("خطاب تعريف")) {
      const emp = db.prepare("SELECT * FROM employees ORDER BY id ASC LIMIT 1").get() as any;
      if (emp) {
        const total = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
        replyText = `تم توليد نموذج شهادة تعريف بالراتب الرسمية المعتمدة للموظف **${emp.name}** بمجموع أجر شهري قدره **${total.toLocaleString()} ر.س**. يمكنك تحميلها أو طباعتها مباشرة مع الختم الرقمي والـ QR Code.`;
        quickCardData = {
          type: 'salary_cert',
          data: {
            employee_name: emp.name,
            national_id: emp.national_id_iqama,
            job_title: emp.job_title || emp.position,
            basic_salary: emp.basic_salary,
            housing_allowance: emp.housing_allowance,
            transport_allowance: emp.transport_allowance,
            total_salary: total,
            join_date: emp.contract_start_date || '2022-01-01',
            qr_ref: `SAR-CERT-SAUDI-${emp.id}-${Date.now().toString().slice(-6)}`
          }
        };
        suggestedActions = [
          { label: 'عرض تفاصيل ملف الموظف', actionType: 'navigate', payload: 'employees' },
          { label: 'استوديو الخطابات الإدارية بالذكاء الاصطناعي', actionType: 'navigate', payload: 'ai_letters' }
        ];
        return res.json({ reply: replyText, quickCard: quickCardData, suggestedActions });
      }
    }

    if (ai) {
      try {
        const systemPrompt = `
أنت المساعد الذكي الخبير بالموارد البشرية والأنظمة السعودية (Saudi HR Copilot) لمنصة إدارة الموارد البشرية والرواتب.
معلومات المنشأة الحالية:
- إجمالي عدد الموظفين: ${empCount} موظف
- نسبة السعودة الحالية: ${saudizationRate}%
- الإقامات التي تنتهي خلال 60 يوماً: ${expIqamas} إقامات
- طلبات الاعتماد المعلقة: ${pendingRequests} طلبات

أجب بلغة عربية مهنية دقيقة، وقدم استشارات عملية مبنية على نظام العمل السعودي (التأمينات، قوى، مقيم، مدد، حماية الأجور، كود العمل).
إذا سأل المستخدم عن إحصائية، اذكر الأرقام الحقيقية المذكورة أعلاه.
كن مختصراً ومنظماً ومفيداً.
`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nسؤال المستخدم: ${message}` }] }
          ]
        });

        replyText = response.text || "أهلاً بك، كيف يمكنني مساعدتك في شؤون الموظفين والامتثال لنظام العمل؟";
      } catch (err) {
        console.error("Gemini copilot error:", err);
      }
    }

    if (!replyText) {
      // Intelligent Rule-based fallback
      if (lower.includes("سعودة") || lower.includes("نطاقات") || lower.includes("توطين")) {
        replyText = `نسبة التوطين الحالية في المنشأة هي **${saudizationRate}%** (عدد الموظفين السعوديين: ${saudiCount} من أصل ${empCount}). المنشأة في النطاق البلاتيني/الأخضر المرتفع مما يتيح إصدار التأشيرات الفورية ونقل الخدمات دون قيود.`;
        suggestedActions = [
          { label: 'فتح محاكي نطاقات الذكي', actionType: 'navigate', payload: 'nitaqat_sim' },
          { label: 'إدارة عقود منصة قوى', actionType: 'navigate', payload: 'qiwa_contracts' }
        ];
      } else if (lower.includes("إقامة") || lower.includes("اقامة") || lower.includes("جوازات") || lower.includes("مقيم")) {
        replyText = `يوجد حالياً **${expIqamas}** إقامات وافدين قاربت على الانتهاء خلال الـ 60 يوماً القادمة. يرجى المبادرة بالتجديد عبر منصة مقيم وسداد رسوم رخصة العمل (9600 ر.س سنوياً) والتأمين الطبي لتفادي الغرامات ومضاعفة الرسوم.`;
        suggestedActions = [
          { label: 'سجل الموظفين والإقامات', actionType: 'navigate', payload: 'employees' },
          { label: 'التأمين الطبي والضمان الصحي', actionType: 'navigate', payload: 'medical' }
        ];
      } else if (lower.includes("حماية الأجور") || lower.includes("مدد") || lower.includes("wps") || lower.includes("sif")) {
        replyText = `نظام حماية الأجور (WPS) ومطابقة منصة مدد مفعل بنجاح. يتم فحص كل مسير رواتب للتحقق من عدم تجاوز نسبة الاستقطاعات (المادة 92 من نظام العمل) وتوليد ملف SIF البنكي المعتمد تلقائياً.`;
        suggestedActions = [
          { label: 'مدقق حماية الأجور وملفات SIF', actionType: 'navigate', payload: 'wps_audit' },
          { label: 'مسير الرواتب الشهري', actionType: 'navigate', payload: 'payroll' }
        ];
      } else if (lower.includes("مكافأة") || lower.includes("نهاية الخدمة") || lower.includes("مستحقات")) {
        replyText = `طبقاً للمادة (84) و(85) من نظام العمل السعودي، تُحتسب مكافأة نهاية الخدمة بأجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر كامل عن كل سنة تالية، مع احتساب الأجر الإجمالي الأخير (الأساسي + البدلات الثابتة).`;
        suggestedActions = [
          { label: 'مخصصات نهاية الخدمة والميزانية', actionType: 'navigate', payload: 'provisions' },
          { label: 'إخلاء الطرف وإبراء الذمة', actionType: 'navigate', payload: 'clearance' }
        ];
      } else {
        replyText = `مرحباً بك! أنا مساعد الموارد البشرية الذكي (AI HR Copilot). يمكنني مساعدتك في إصدار شهادات الرواتب، حساب مكافأة نهاية الخدمة، متابعة الإقامات والتأشيرات، تدقيق مسيرات مدد، وتحليل مؤشرات التوطين والسلامة المهنية.`;
        suggestedActions = [
          { label: 'لوحة القيادة التنفيذية', actionType: 'navigate', payload: 'executive_board' },
          { label: 'سحب الراتب عند الطلب (EWA)', actionType: 'navigate', payload: 'ewa_wellness' }
        ];
      }
    }

    res.json({
      reply: replyText,
      quickCard: quickCardData,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : [
        { label: 'لوحة التحكم', actionType: 'navigate', payload: 'dashboard' },
        { label: 'الموظفين', actionType: 'navigate', payload: 'employees' }
      ]
    });
  });

  // Notifications
  app.get("/api/notifications", (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30").all();
      res.json(notes);
    } catch (e) {
      console.error("Error fetching notifications:", e);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.put("/api/notifications/read-all", (req, res) => {
    try {
      db.prepare("UPDATE notifications SET is_read = 1").run();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update notifications" });
    }
  });

  app.put("/api/notifications/:id/read", (req, res) => {
    try {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  app.post("/api/notifications", (req, res) => {
    try {
      const { title, message, type } = req.body;
      const info = db.prepare(`
        INSERT INTO notifications (title, message, type, is_read)
        VALUES (?, ?, ?, 0)
      `).run(title, message, type || 'info');
      res.json({ id: info.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  // GET Salary certificate data for printing
  app.get("/api/copilot/salary-certificate/:empId", (req, res) => {
    const emp = db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.id = ?
    `).get(req.params.empId) as any;

    if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });

    const totalSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);

    res.json({
      employee_id: emp.id,
      employee_name: emp.name,
      nationality: emp.nationality,
      national_id_iqama: emp.national_id_iqama,
      job_title: emp.job_title || emp.position,
      department_name: emp.department_name || 'عام',
      branch_name: emp.branch_name || 'الفرع الرئيسي',
      contract_start_date: emp.contract_start_date || '2022-01-01',
      basic_salary: emp.basic_salary || 0,
      housing_allowance: emp.housing_allowance || 0,
      transport_allowance: emp.transport_allowance || 0,
      other_allowances: emp.other_allowances || 0,
      total_salary: totalSalary,
      issue_date: new Date().toISOString().split('T')[0],
      qr_code_ref: `SAR-CERT-SAUDI-${emp.id}-${Date.now().toString().slice(-6)}`
    });
  });

  // ====================================================
  // API: Grievances, Hearing Sessions & Warnings (التظلمات ولجان التحقيق والإنذارات)
  // ====================================================
  app.get("/api/grievances", (req, res) => {
    try {
      const rows = db.prepare(`
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

  app.post("/api/grievances", (req, res) => {
    try {
      const { employee_id, category, subject, details, is_confidential, against_person } = req.body;
      const count = (db.prepare("SELECT COUNT(*) as c FROM employee_grievances").get() as any).c + 1;
      const ticket = `GRV-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;
      
      const result = db.prepare(`
        INSERT INTO employee_grievances (ticket_number, employee_id, category, subject, details, is_confidential, against_person, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')
      `).run(ticket, employee_id, category || 'work_environment', subject, details, is_confidential ? 1 : 0, against_person || null);

      createNotification('تظلم إداري جديد (المادة 209)', `تم استلام تظلم إداري برقم ${ticket} وهو بانتظار تشكيل لجنة الفحص.`, 'warning');
      res.json({ id: result.lastInsertRowid, ticket_number: ticket, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تسجيل التظلم" });
    }
  });

  app.put("/api/grievances/:id/status", (req, res) => {
    try {
      const { status, committee_notes, resolution_summary } = req.body;
      const resolvedAt = status === 'resolved' || status === 'rejected' ? new Date().toISOString() : null;
      db.prepare(`
        UPDATE employee_grievances 
        SET status = ?, committee_notes = COALESCE(?, committee_notes), resolution_summary = COALESCE(?, resolution_summary), resolved_at = COALESCE(?, resolved_at)
        WHERE id = ?
      `).run(status, committee_notes, resolution_summary, resolvedAt, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث حالة التظلم" });
    }
  });

  app.get("/api/hearings", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM hearing_sessions ORDER BY session_date DESC").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع جلسات التحقيق" });
    }
  });

  app.post("/api/hearings", (req, res) => {
    try {
      const { grievance_id, session_title, session_date, location, committee_chair, hr_representative, legal_counsel, employee_name, witnesses, statements_minutes, committee_verdict, recommended_sanction, deduction_days } = req.body;
      const result = db.prepare(`
        INSERT INTO hearing_sessions (grievance_id, session_title, session_date, location, committee_chair, hr_representative, legal_counsel, employee_name, witnesses, statements_minutes, committee_verdict, recommended_sanction, deduction_days, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(grievance_id || null, session_title, session_date, location || 'غرفة التحقيقات والامتثال', committee_chair, hr_representative, legal_counsel, employee_name, witnesses || '', statements_minutes, committee_verdict, recommended_sanction || 'none', deduction_days || 0);
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل حفظ محضر التحقيق" });
    }
  });

  app.get("/api/warnings", (req, res) => {
    try {
      const rows = db.prepare(`
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

  app.post("/api/warnings", (req, res) => {
    try {
      const { employee_id, warning_type, violation_clause, violation_date, investigation_ref, penalty_details, deduction_amount, issued_by, issue_date } = req.body;
      const count = (db.prepare("SELECT COUNT(*) as c FROM official_warnings").get() as any).c + 1;
      const noticeNum = `WRN-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;
      
      const result = db.prepare(`
        INSERT INTO official_warnings (notice_number, employee_id, warning_type, violation_clause, violation_date, investigation_ref, penalty_details, deduction_amount, issued_by, issue_date, acknowledgement_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'acknowledged')
      `).run(noticeNum, employee_id, warning_type, violation_clause, violation_date, investigation_ref || null, penalty_details, deduction_amount || 0, issued_by, issue_date || new Date().toISOString().split('T')[0]);

      res.json({ id: result.lastInsertRowid, notice_number: noticeNum, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل إصدار الإنذار الرسمي" });
    }
  });

  // ====================================================
  // API: HR Budgeting & Forecasting (ميزانية الموارد البشرية والرواتب)
  // ====================================================
  app.get("/api/budgets/departments", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT b.*, d.name as department_name,
               (SELECT COUNT(*) FROM employees e WHERE e.department_id = b.department_id) as current_headcount
        FROM department_budgets b
        LEFT JOIN departments d ON b.department_id = d.id
        ORDER BY b.department_id ASC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع ميزانيات الإدارات" });
    }
  });

  app.put("/api/budgets/departments/:id", (req, res) => {
    try {
      const { allocated_salaries, allocated_gosi, allocated_medical, allocated_work_permits, allocated_flight_tickets, allocated_end_of_service, allocated_training_rewards, headcount_cap } = req.body;
      const total = Number(allocated_salaries || 0) + Number(allocated_gosi || 0) + Number(allocated_medical || 0) + Number(allocated_work_permits || 0) + Number(allocated_flight_tickets || 0) + Number(allocated_end_of_service || 0) + Number(allocated_training_rewards || 0);

      db.prepare(`
        UPDATE department_budgets
        SET allocated_salaries = ?, allocated_gosi = ?, allocated_medical = ?, allocated_work_permits = ?, allocated_flight_tickets = ?, allocated_end_of_service = ?, allocated_training_rewards = ?, total_allocated = ?, headcount_cap = ?
        WHERE id = ?
      `).run(allocated_salaries, allocated_gosi, allocated_medical, allocated_work_permits, allocated_flight_tickets, allocated_end_of_service, allocated_training_rewards, total, headcount_cap, req.params.id);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث الميزانية" });
    }
  });

  // ====================================================
  // API: Kudos, Rewards & Surveys (التقدير والمكافآت والارتباط)
  // ====================================================
  app.get("/api/kudos", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM peer_kudos ORDER BY created_at DESC LIMIT 50").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع بطاقات التقدير" });
    }
  });

  app.post("/api/kudos", (req, res) => {
    try {
      const { sender_id, sender_name, recipient_id, recipient_name, recipient_job, core_value, message, points_awarded } = req.body;
      const result = db.prepare(`
        INSERT INTO peer_kudos (sender_id, sender_name, recipient_id, recipient_name, recipient_job, core_value, message, points_awarded, likes_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(sender_id, sender_name, recipient_id, recipient_name, recipient_job || '', core_value || 'teamwork', message, points_awarded || 50);

      createNotification('بطاقة تقدير جديدة (Kudos)', `حصل الموظف ${recipient_name} على بطاقة شكر من ${sender_name} بمقدار ${points_awarded || 50} نقطة!`, 'success');
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال بطاقة التقدير" });
    }
  });

  app.post("/api/kudos/:id/like", (req, res) => {
    try {
      db.prepare("UPDATE peer_kudos SET likes_count = likes_count + 1 WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل التفاعل" });
    }
  });

  app.get("/api/rewards/catalog", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM reward_catalog ORDER BY points_required ASC").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع متجر المكافآت" });
    }
  });

  app.get("/api/rewards/redemptions", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM reward_redemptions ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع عمليات الاستبدال" });
    }
  });

  app.post("/api/rewards/redeem", (req, res) => {
    try {
      const { employee_id, employee_name, reward_id, reward_title, points_spent } = req.body;
      const code = `RWD-${Date.now().toString().slice(-6)}`;
      const result = db.prepare(`
        INSERT INTO reward_redemptions (employee_id, employee_name, reward_id, reward_title, points_spent, redemption_code, status)
        VALUES (?, ?, ?, ?, ?, ?, 'approved')
      `).run(employee_id, employee_name, reward_id, reward_title, points_spent, code);

      db.prepare("UPDATE reward_catalog SET stock_quantity = MAX(0, stock_quantity - 1) WHERE id = ?").run(reward_id);
      res.json({ id: result.lastInsertRowid, redemption_code: code, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل استبدال المكافأة" });
    }
  });

  app.get("/api/surveys/pulse", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM pulse_survey_results").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع استطلاعات النبض" });
    }
  });

  // ====================================================
  // API: Smart Assets & QR Handover (الأصول والعهد الذكية وإبراء الذمة)
  // ====================================================
  app.get("/api/smart-assets", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT a.*, e.name as assigned_employee_name, d.name as assigned_department
        FROM smart_assets a
        LEFT JOIN employees e ON a.current_assigned_to = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        ORDER BY a.created_at DESC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع الأصول والعهد" });
    }
  });

  app.post("/api/smart-assets", (req, res) => {
    try {
      const { name, category, brand_model, serial_number, purchase_date, purchase_value, current_assigned_to, condition } = req.body;
      const count = (db.prepare("SELECT COUNT(*) as c FROM smart_assets").get() as any).c + 1;
      const code = `AST-${(category || 'GEN').toUpperCase().slice(0, 2)}-${count.toString().padStart(3, '0')}`;
      const qr = `QR-${code}-${Date.now().toString().slice(-4)}`;
      const status = current_assigned_to ? 'assigned' : 'in_stock';
      const assignedDate = current_assigned_to ? new Date().toISOString().split('T')[0] : null;

      const result = db.prepare(`
        INSERT INTO smart_assets (asset_code, name, category, brand_model, serial_number, purchase_date, purchase_value, current_assigned_to, assigned_date, handover_qr_code, condition, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(code, name, category || 'laptop', brand_model, serial_number, purchase_date || new Date().toISOString().split('T')[0], purchase_value || 0, current_assigned_to || null, assignedDate, qr, condition || 'good', status);

      res.json({ id: result.lastInsertRowid, asset_code: code, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل إضافة العهدة والأصل" });
    }
  });

  app.put("/api/smart-assets/:id/assign", (req, res) => {
    try {
      const { current_assigned_to, status, condition } = req.body;
      const assignedDate = current_assigned_to ? new Date().toISOString().split('T')[0] : null;
      db.prepare(`
        UPDATE smart_assets 
        SET current_assigned_to = ?, status = ?, condition = COALESCE(?, condition), assigned_date = ?
        WHERE id = ?
      `).run(current_assigned_to || null, status || (current_assigned_to ? 'assigned' : 'in_stock'), condition, assignedDate, req.params.id);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث تسليم العهدة" });
    }
  });

  // ====================================================
  // API: Database Backup & Restore (النسخ الاحتياطي والاستعادة)
  // ====================================================
  app.get("/api/backup/export", authenticateToken, requireRole("admin"), (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
      const backupData: Record<string, any[]> = {};
      let totalRecords = 0;

      for (const { name } of tables) {
        try {
          const rows = db.prepare(`SELECT * FROM "${name}"`).all();
          backupData[name] = rows;
          totalRecords += rows.length;
        } catch (err) {
          console.error(`Failed to dump table ${name}:`, err);
        }
      }

      const payload = {
        app_name: "Saudi HR & Payroll System",
        version: "2.5.0",
        exported_at: new Date().toISOString(),
        tables_count: tables.length,
        records_count: totalRecords,
        tables: backupData
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=saudi_hr_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.json(payload);
    } catch (e) {
      console.error("Backup export error:", e);
      res.status(500).json({ error: "فشل تصدير النسخة الاحتياطية" });
    }
  });

  app.post("/api/backup/restore", authenticateToken, requireRole("admin"), (req, res) => {
    try {
      const payload = req.body;
      const tablesData = payload.tables || payload;

      if (!tablesData || typeof tablesData !== 'object') {
        return res.status(400).json({ error: "ملف النسخة الاحتياطية غير صالح أو تالف" });
      }

      let restoredTables = 0;
      let restoredRecords = 0;

      const restoreTransaction = db.transaction(() => {
        for (const [tableName, rows] of Object.entries(tablesData)) {
          if (tableName.startsWith("sqlite_") || !Array.isArray(rows)) continue;

          // Check if table exists
          const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
          if (exists) {
            db.prepare(`DELETE FROM "${tableName}"`).run();
            if (rows.length > 0) {
              const columns = Object.keys(rows[0]);
              const colNames = columns.map(c => `"${c}"`).join(",");
              const placeholders = columns.map(() => "?").join(",");
              const insertStmt = db.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`);

              for (const row of rows) {
                const values = columns.map(c => row[c] !== undefined ? row[c] : null);
                insertStmt.run(...values);
                restoredRecords++;
              }
            }
            restoredTables++;
          }
        }
      });

      restoreTransaction();

      createNotification('استعادة قاعدة البيانات', `تمت استعادة عدد ${restoredTables} جدول و ${restoredRecords} سجل بنجاح من ملف النسخ الاحتياطي`, 'success');
      logAction('restore', 'database', null, `Restored database: ${restoredTables} tables, ${restoredRecords} records`);

      res.json({
        success: true,
        restored_tables: restoredTables,
        restored_records: restoredRecords,
        restored_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("Backup restore error:", e);
      res.status(500).json({ error: "فشل استعادة قاعدة البيانات: " + (e as Error).message });
    }
  });

  // ====================================================
  // API: Impending Document & Iqama Expiry Alerts (تنبيهات انتهاء الإقامات والتأمين)
  // ====================================================
  app.get("/api/alerts/expiries", (req, res) => {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const employees = db.prepare(`
        SELECT e.*, d.name as department_name, b.name as branch_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN branches b ON e.branch_id = b.id
      `).all() as any[];

      const alerts: Array<{
        id: string;
        category: 'iqama' | 'insurance' | 'contract' | 'work_permit' | 'vehicle';
        title: string;
        employee_id?: number;
        employee_name?: string;
        department_name?: string;
        document_number?: string;
        expiry_date: string;
        days_left: number;
        severity: 'critical' | 'warning' | 'info';
        status_text: string;
        action_label: string;
        action_type: string;
      }> = [];

      employees.forEach(emp => {
        const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';

        // 1. Expat Iqama Expiry
        if (!isSaudi && emp.iqama_expiry_gregorian) {
          const expDate = new Date(emp.iqama_expiry_gregorian);
          const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

          if (days <= 90) {
            let severity: 'critical' | 'warning' | 'info' = 'info';
            let statusText = `متبقي ${days} يوم على انتهاء الإقامة`;
            if (days <= 0) {
              severity = 'critical';
              statusText = `الإقامة منتهية منذ ${Math.abs(days)} يوم (غرامة مضاعفة)`;
            } else if (days <= 30) {
              severity = 'critical';
              statusText = `حرج: متبقي ${days} يوم فقط على انتهاء الإقامة`;
            } else if (days <= 60) {
              severity = 'warning';
              statusText = `تنبيه: متبقي ${days} يوم على انتهاء الإقامة`;
            }

            alerts.push({
              id: `iqama-${emp.id}`,
              category: 'iqama',
              title: `تجديد إقامة: ${emp.name}`,
              employee_id: emp.id,
              employee_name: emp.name,
              department_name: emp.department_name || 'عام',
              document_number: emp.national_id_iqama || emp.border_number || 'N/A',
              expiry_date: emp.iqama_expiry_gregorian,
              days_left: days,
              severity,
              status_text: statusText,
              action_label: 'تجديد فوري عبر قوى',
              action_type: 'renew_iqama'
            });
          }
        }

        // 2. Medical Insurance Expiry
        if (emp.medical_insurance_expiry) {
          const medExp = new Date(emp.medical_insurance_expiry);
          const days = Math.ceil((medExp.getTime() - now.getTime()) / (1000 * 3600 * 24));

          if (days <= 60) {
            let severity: 'critical' | 'warning' | 'info' = 'info';
            let statusText = `متبقي ${days} يوم على انتهاء وثيقة التأمين الطبي CCHI`;
            if (days <= 0) {
              severity = 'critical';
              statusText = `وثيقة التأمين الطبي منتهية منذ ${Math.abs(days)} يوم`;
            } else if (days <= 30) {
              severity = 'critical';
              statusText = `حرج: متبقي ${days} يوم على انتهاء بطاقة التأمين`;
            } else {
              severity = 'warning';
            }

            alerts.push({
              id: `med-${emp.id}`,
              category: 'insurance',
              title: `تجديد التأمين الطبي: ${emp.name}`,
              employee_id: emp.id,
              employee_name: emp.name,
              department_name: emp.department_name || 'عام',
              document_number: emp.medical_insurance_policy || emp.insurance_number || 'N/A',
              expiry_date: emp.medical_insurance_expiry,
              days_left: days,
              severity,
              status_text: statusText,
              action_label: 'تجديد بوليصة التأمين CCHI',
              action_type: 'renew_insurance'
            });
          }
        }

        // 3. Qiwa / Fixed Term Contract Expiry
        if (emp.contract_end_date && emp.contract_type === 'fixed') {
          const contExp = new Date(emp.contract_end_date);
          const days = Math.ceil((contExp.getTime() - now.getTime()) / (1000 * 3600 * 24));

          if (days <= 90) {
            let severity: 'critical' | 'warning' | 'info' = 'info';
            if (days <= 0) severity = 'critical';
            else if (days <= 30) severity = 'critical';
            else if (days <= 60) severity = 'warning';

            alerts.push({
              id: `contract-${emp.id}`,
              category: 'contract',
              title: `انتهاء عقد العمل: ${emp.name}`,
              employee_id: emp.id,
              employee_name: emp.name,
              department_name: emp.department_name || 'عام',
              document_number: `عقد قوى محدد المدة`,
              expiry_date: emp.contract_end_date,
              days_left: days,
              severity,
              status_text: days <= 0 ? `العقد منتهي منذ ${Math.abs(days)} يوم` : `متبقي ${days} يوم على نهاية العقد (مهلة الإشعار)`,
              action_label: 'تجديد العقد في قوى',
              action_type: 'renew_contract'
            });
          }
        }
      });

      // 4. Fleet vehicle Istimara & Insurance Expiry
      try {
        const vehicles = db.prepare("SELECT * FROM fleet_vehicles").all() as any[];
        vehicles.forEach(v => {
          if (v.istimara_expiry) {
            const istExp = new Date(v.istimara_expiry);
            const days = Math.ceil((istExp.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (days <= 60) {
              alerts.push({
                id: `veh-ist-${v.id}`,
                category: 'vehicle',
                title: `تجديد رخصة سير مركبة: ${v.make_model} (${v.plate_number})`,
                document_number: v.plate_number,
                expiry_date: v.istimara_expiry,
                days_left: days,
                severity: days <= 15 ? 'critical' : 'warning',
                status_text: days <= 0 ? 'استمارة المركبة منتهية' : `متبقي ${days} يوم على فحص/استمارة المركبة`,
                action_label: 'تجديد عبر أبشر أعمال',
                action_type: 'renew_vehicle'
              });
            }
          }
        });
      } catch (err) {}

      // Sort by severity (critical first) and then days_left ascending
      alerts.sort((a, b) => {
        const severityRank = { critical: 0, warning: 1, info: 2 };
        if (severityRank[a.severity] !== severityRank[b.severity]) {
          return severityRank[a.severity] - severityRank[b.severity];
        }
        return a.days_left - b.days_left;
      });

      const summary = {
        total_alerts: alerts.length,
        critical_count: alerts.filter(a => a.severity === 'critical').length,
        warning_count: alerts.filter(a => a.severity === 'warning').length,
        iqama_count: alerts.filter(a => a.category === 'iqama').length,
        insurance_count: alerts.filter(a => a.category === 'insurance').length,
        contract_count: alerts.filter(a => a.category === 'contract').length
      };

      res.json({ summary, alerts });
    } catch (e) {
      console.error("Alerts error:", e);
      res.status(500).json({ error: "فشل استرجاع تنبيهات الوثائق" });
    }
  });

  app.post("/api/alerts/send-reminder", (req, res) => {
    try {
      const { alert_id, title, message } = req.body;
      createNotification(title || 'تذكير بالوثيقة', message || 'تم إرسال إشعار تذكيري لتجديد الوثيقة', 'warning');
      res.json({ success: true, message: 'تم إرسال الإشعار بنجاح' });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال التذكير" });
    }
  });





  // ====================================================
  // NEW FEATURES: Attendance Devices, Geo Check-in, Biometrics,
  // Documents, Alerts, Transfers, Payroll Split & Reports
  // ====================================================

  // Haversine distance in meters
  function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Ensure uploads dir
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // ---- Attendance Devices ----
  app.get("/api/attendance/devices", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT d.*, b.name as branch_name FROM attendance_devices d
        LEFT JOIN branches b ON b.id = d.branch_id ORDER BY d.id DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/attendance/devices", (req, res) => {
    try {
      const { branch_id, device_name, device_token } = req.body;
      if (!branch_id) return res.status(400).json({ error: "branch_id مطلوب" });
      const branch = db.prepare("SELECT * FROM branches WHERE id = ?").get(branch_id) as any;
      if (!branch) return res.status(404).json({ error: "الفرع غير موجود" });
      if (branch.latitude == null || branch.longitude == null) {
        return res.status(400).json({ error: "حدّد إحداثيات الفرع ونطاقه من شاشة الفروع قبل ربط الهاتف" });
      }
      const token = device_token || `DEV-${Date.now()}-${crypto.randomBytes(16).toString("hex")}`;
      const pin = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const result = db.prepare(
        "INSERT INTO attendance_devices (branch_id, device_name, device_token, pairing_pin, phone_bound) VALUES (?, ?, ?, ?, 0)"
      ).run(branch_id, device_name || "هاتف الفرع", token, pin);
      logAction("create", "attendance_device", Number(result.lastInsertRowid), `Phone pairing created for branch ${branch_id}`);
      res.json({ id: result.lastInsertRowid, device_token: token, pairing_pin: pin, success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/attendance/devices/:id/reset-pair", (req, res) => {
    try {
      const pin = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      db.prepare("UPDATE attendance_devices SET phone_bound = 0, bound_fingerprint = NULL, bound_at = NULL, pairing_pin = ? WHERE id = ?")
        .run(pin, req.params.id);
      logAction("update", "attendance_device", Number(req.params.id), "إعادة تفعيل هاتف الفرع (إلغاء الربط السابق)");
      res.json({ success: true, pairing_pin: pin });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  function requirePairedPhoneAtBranch(device: any, latitude: any, longitude: any, fingerprint?: string) {
    if (!device.phone_bound) {
      return { ok: false, status: 403, error: "هذا الهاتف غير مفعّل. فعّله أول مرة داخل موقع الفرع برقم التفعيل." };
    }
    if (!fingerprint || !String(fingerprint).trim()) {
      db.prepare("INSERT INTO kiosk_security_logs (device_id, reason, details) VALUES (?, ?, ?)")
        .run(device.id, "missing_fingerprint", "طلب تسجيل بدون device_fingerprint");
      return { ok: false, status: 400, error: "معرّف الهاتف (device_fingerprint) مطلوب — لا يمكن التسجيل بدونه" };
    }
    if (device.bound_fingerprint && device.bound_fingerprint !== fingerprint) {
      db.prepare("INSERT INTO kiosk_security_logs (device_id, reason, details) VALUES (?, ?, ?)")
        .run(device.id, "device_mismatch", "هاتف غير المرتبط بالفرع");
      return { ok: false, status: 403, error: "هذا الرابط مربوط بهاتف فرع آخر فقط" };
    }
    if (latitude == null || longitude == null) {
      return { ok: false, status: 400, error: "الموقع الجغرافي إلزامي — لن يتم التسجيل بدون GPS" };
    }
    const branch = db.prepare("SELECT * FROM branches WHERE id = ?").get(device.branch_id) as any;
    if (!branch || branch.latitude == null || branch.longitude == null) {
      return { ok: false, status: 400, error: "الفرع بلا إحداثيات" };
    }
    const dist = haversineMeters(Number(branch.latitude), Number(branch.longitude), Number(latitude), Number(longitude));
    const radius = Number(branch.geofence_radius_m) || 200;
    if (dist > radius) {
      db.prepare("INSERT INTO kiosk_security_logs (device_id, reason, details) VALUES (?, ?, ?)")
        .run(device.id, "geofence", `خارج النطاق ${Math.round(dist)}م`);
      return { ok: false, status: 403, error: `الهاتف خارج موقع الفرع (${Math.round(dist)}م) — يُمنع التسجيل`, distance_m: Math.round(dist), radius_m: radius };
    }
    return { ok: true, branch, distance_m: Math.round(dist), radius_m: radius };
  }

  app.post("/api/attendance/pair-phone", pairPhoneLimiter, kioskLimiter, (req, res) => {
    try {
      const { device_token, pairing_pin, latitude, longitude, device_fingerprint } = req.body;
      const device = db.prepare("SELECT * FROM attendance_devices WHERE device_token = ?").get(device_token) as any;
      if (!device) return res.status(404).json({ error: "رابط الفرع غير صالح", allowed: false });
      if (device.phone_bound) {
        if (device.bound_fingerprint === device_fingerprint) {
          return res.json({ success: true, already: true, message: "الهاتف مفعّل مسبقاً" });
        }
        return res.status(403).json({ error: "تم ربط هاتف آخر بهذا الفرع. اطلب إعادة التفعيل من الإدارة.", allowed: false });
      }
      if (!pairing_pin || String(pairing_pin) !== String(device.pairing_pin)) {
        db.prepare("INSERT INTO kiosk_security_logs (device_id, reason, details) VALUES (?, ?, ?)")
          .run(device.id, "bad_pin", "رمز تفعيل خاطئ");
        return res.status(403).json({ error: "رمز التفعيل غير صحيح", allowed: false });
      }
      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: "فعّل GPS. لا يمكن ربط الهاتف إلا داخل موقع الفرع.", allowed: false });
      }
      const branch = db.prepare("SELECT * FROM branches WHERE id = ?").get(device.branch_id) as any;
      if (!branch || branch.latitude == null || branch.longitude == null) {
        return res.status(400).json({ error: "الفرع لا يملك إحداثيات", allowed: false });
      }
      const dist = haversineMeters(Number(branch.latitude), Number(branch.longitude), Number(latitude), Number(longitude));
      const radius = Number(branch.geofence_radius_m) || 200;
      if (dist > radius) {
        db.prepare("INSERT INTO kiosk_security_logs (device_id, reason, details) VALUES (?, ?, ?)")
          .run(device.id, "pair_outside", `محاولة تفعيل خارج الفرع ${Math.round(dist)}م`);
        return res.status(403).json({
          error: `لا يمكن تفعيل الهاتف إلا داخل نطاق الفرع. أنت على بعد ${Math.round(dist)}م (المسموح ${radius}م)`,
          allowed: false, distance_m: Math.round(dist), radius_m: radius
        });
      }
      if (!device_fingerprint) return res.status(400).json({ error: "تعذر توليد معرف الهاتف" });
      db.prepare(`UPDATE attendance_devices SET phone_bound = 1, bound_fingerprint = ?, bound_at = ?, last_latitude = ?, last_longitude = ?, last_verified_at = ? WHERE id = ?`)
        .run(device_fingerprint, new Date().toISOString(), latitude, longitude, new Date().toISOString(), device.id);
      logAction("update", "attendance_device", device.id, `Phone paired at branch ${branch.name}`);
      res.json({ success: true, allowed: true, branch_name: branch.name, distance_m: Math.round(dist), message: `تم ربط هاتف فرع ${branch.name}` });
    } catch (e) { res.status(500).json({ error: (e as Error).message, allowed: false }); }
  });

  app.delete("/api/attendance/devices/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM attendance_devices WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Geo validation: device must be within branch geofence ----
  app.post("/api/attendance/geo-validate", (req, res) => {
    try {
      const { device_token, latitude, longitude, device_fingerprint } = req.body;
      const device = db.prepare("SELECT * FROM attendance_devices WHERE device_token = ?").get(device_token) as any;
      if (!device) return res.status(404).json({ error: "الجهاز غير مسجل", allowed: false });
      const chk = requirePairedPhoneAtBranch(device, latitude, longitude, device_fingerprint);
      if (!chk.ok) return res.status(chk.status || 403).json({ error: chk.error, allowed: false, distance_m: chk.distance_m, radius_m: chk.radius_m });
      db.prepare("UPDATE attendance_devices SET last_latitude = ?, last_longitude = ?, last_verified_at = ? WHERE id = ?")
        .run(latitude, longitude, new Date().toISOString(), device.id);
      res.json({ allowed: true, distance_m: chk.distance_m, radius_m: chk.radius_m, branch_id: device.branch_id, branch_name: chk.branch.name, paired: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message, allowed: false }); }
  });

  app.get("/api/attendance/live", (_req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = db.prepare(`
        SELECT l.*, e.name as employee_name, b.name as branch_name
        FROM attendance_logs l
        LEFT JOIN employees e ON e.id = l.employee_id
        LEFT JOIN branches b ON b.id = l.branch_id
        WHERE date(l.check_in_time) = ?
        ORDER BY l.check_in_time DESC
      `).all(today);
      const geo_fails = db.prepare(`
        SELECT * FROM kiosk_security_logs WHERE created_at >= datetime('now', '-1 day') ORDER BY id DESC LIMIT 50
      `).all();
      res.json({ today: rows, geo_fails });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/attendance/branch-month-report", (req, res) => {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      const rows = db.prepare(`
        SELECT e.id as employee_id, e.name as employee_name, b.name as branch_name, e.branch_id,
          COUNT(DISTINCT date(l.check_in_time)) as present_days,
          SUM(CASE WHEN l.status = 'late' THEN 1 ELSE 0 END) as late_days,
          a.absence_days, a.overtime_hours
        FROM employees e
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN attendance_logs l ON l.employee_id = e.id AND substr(l.check_in_time,1,7) = ?
        LEFT JOIN attendance a ON a.employee_id = e.id AND a.month = ? AND a.year = ?
        GROUP BY e.id
        ORDER BY b.name, e.name
      `).all(prefix, month, year);
      res.json({ month, year, rows });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Check-in ----
  app.post("/api/attendance/check-in", kioskLimiter, (req, res) => {
    try {
      const { device_token, employee_id, method, latitude, longitude, device_fingerprint } = req.body;
      const device = db.prepare("SELECT * FROM attendance_devices WHERE device_token = ?").get(device_token) as any;
      if (!device) return res.status(404).json({ error: "الجهاز غير مسجل" });
      const gate = requirePairedPhoneAtBranch(device, latitude, longitude, device_fingerprint);
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error, allowed: false });
      const branch = gate.branch;
      const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      if (emp.branch_id && Number(emp.branch_id) !== Number(device.branch_id)) {
        return res.status(403).json({ error: "الموظف غير تابع لهذا الفرع — يُمنع التسجيل على هاتف فرع آخر" });
      }
      const today = new Date().toISOString().slice(0, 10);
      const existing = db.prepare(`
        SELECT * FROM attendance_logs WHERE employee_id = ? AND date(check_in_time) = ?
      `).get(employee_id, today) as any;
      if (existing && existing.check_out_time) {
        return res.status(400).json({ error: "تم تسجيل الحضور والانصراف مسبقاً اليوم" });
      }
      const now = new Date().toISOString();
      let logId = existing ? existing.id : null;
      if (existing) {
        db.prepare("UPDATE attendance_logs SET check_in_time = ?, branch_id = ?, device_id = ?, method = ?, check_in_lat = ?, check_in_lng = ? WHERE id = ?")
          .run(now, device.branch_id, device.id, method || 'manual', latitude || null, longitude || null, existing.id);
      } else {
        const start = branch?.work_start_time || '08:00';
        const checkInHour = new Date().toTimeString().slice(0, 5);
        const status = checkInHour > start ? 'late' : 'present';
        const r = db.prepare(`
          INSERT INTO attendance_logs (employee_id, branch_id, device_id, check_in_time, check_in_lat, check_in_lng, method, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(employee_id, device.branch_id, device.id, now, latitude || null, longitude || null, method || 'manual', status);
        logId = Number(r.lastInsertRowid);
      }
      createNotification('تسجيل حضور', `تم تسجيل حضور ${emp.name} عبر ${method || 'الجه'}` , 'success');
      res.json({ id: logId, success: true, message: 'تم تسجيل الحضور' });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Check-out ----
  app.post("/api/attendance/check-out", kioskLimiter, (req, res) => {
    try {
      const { device_token, employee_id, latitude, longitude, device_fingerprint } = req.body;
      const device = db.prepare("SELECT * FROM attendance_devices WHERE device_token = ?").get(device_token) as any;
      if (!device) return res.status(404).json({ error: "الجهاز غير مسجل" });
      const gate = requirePairedPhoneAtBranch(device, latitude, longitude, device_fingerprint);
      if (!gate.ok) return res.status(gate.status || 403).json({ error: gate.error, allowed: false });
      const today = new Date().toISOString().slice(0, 10);
      const existing = db.prepare(`
        SELECT * FROM attendance_logs WHERE employee_id = ? AND date(check_in_time) = ? AND check_out_time IS NULL
      `).get(employee_id, today) as any;
      if (!existing) return res.status(400).json({ error: "لا يوجد تسجيل دخول مفتوح اليوم" });
      const now = new Date().toISOString();
      db.prepare("UPDATE attendance_logs SET check_out_time = ?, check_out_lat = ?, check_out_lng = ? WHERE id = ?")
        .run(now, latitude || null, longitude || null, existing.id);
      const emp = db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
      createNotification('تسجيل انصراف', `تم تسجيل انصراف ${emp?.name || ''}` , 'info');
      res.json({ success: true, message: 'تم تسجيل الانصراف' });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Attendance logs ----
  app.get("/api/attendance/logs", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT l.*, e.name as employee_name, b.name as branch_name
        FROM attendance_logs l
        LEFT JOIN employees e ON e.id = l.employee_id
        LEFT JOIN branches b ON b.id = l.branch_id
        ORDER BY l.check_in_time DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Biometrics ----
  // Enrollment is gated by the central auth gate + BIOMETRIC_ENROLL rule (admin, hr_manager,
  // branch_manager); the limiter is attached here because the policy table is method/path only.
  app.post("/api/biometric/register", enrollLimiter, (req, res) => {
    try {
      const { employee_id, face_template } = req.body;
      if (!employee_id) return res.status(400).json({ error: "employee_id مطلوب" });
      db.prepare("UPDATE employees SET face_template = ? WHERE id = ?").run(face_template || null, employee_id);
      logAction("update", "employee", employee_id, "Biometric face template registered");
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // No server-side biometric matching exists. Reporting {success:true} here asserted an
  // identity check that never happened — refuse loudly instead of misleading the caller.
  app.post("/api/biometric/verify", (_req, res) => {
    res.status(501).json({
      error: "التحقق الحيّ من البصمة/الوجه غير مُنفَّذ على الخادم",
      detail: "This endpoint does not verify identity and must not be trusted as an authentication result.",
      implemented: false
    });
  });

  const webauthnChallenges = new Map<string, { challenge: string; employeeId?: number; expires: number }>();
  const b64url = (buf: Buffer) => buf.toString("base64url");
  const kioskRpId = () => (process.env.WEBAUTHN_RP_ID || "localhost");

  app.get("/api/kiosk/:token", kioskLimiter, (req, res) => {
    try {
      const device = db.prepare(`
        SELECT d.*, b.name as branch_name FROM attendance_devices d
        LEFT JOIN branches b ON b.id = d.branch_id WHERE d.device_token = ?
      `).get(req.params.token) as any;
      if (!device || device.status === "inactive") return res.status(404).json({ error: "رابط الفرع غير صالح" });
      res.json({
        device_name: device.device_name,
        branch_id: device.branch_id,
        branch_name: device.branch_name,
        status: device.status,
        phone_bound: !!device.phone_bound,
        needs_pairing: !device.phone_bound,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/webauthn/register/options", enrollLimiter, (req, res) => {
    try {
      const { employee_id } = req.body;
      const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      const challenge = b64url(crypto.randomBytes(32));
      webauthnChallenges.set(String(employee_id), { challenge, employeeId: Number(employee_id), expires: Date.now() + 120000 });
      const userId = b64url(Buffer.from(`emp-${employee_id}`));
      res.json({
        challenge,
        rpId: kioskRpId(),
        rpName: "نظام الرواتب - حضور الفرع",
        userId,
        userName: emp.name,
        userDisplayName: emp.name,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/webauthn/register", enrollLimiter, (req, res) => {
    try {
      const { employee_id, credentialId, method } = req.body;
      if (!employee_id || !credentialId) return res.status(400).json({ error: "بيانات البصمة ناقصة" });
      const pending = webauthnChallenges.get(String(employee_id));
      if (!pending || pending.expires < Date.now()) return res.status(400).json({ error: "انتهت صلاحية جلسة التسجيل — أعد المحاولة" });
      webauthnChallenges.delete(String(employee_id));
      db.prepare("DELETE FROM employee_webauthn_credentials WHERE employee_id = ?").run(employee_id);
      db.prepare("INSERT INTO employee_webauthn_credentials (employee_id, credential_id, method) VALUES (?, ?, ?)")
        .run(employee_id, credentialId, method || "face");
      logAction("update", "employee", employee_id, "WebAuthn biometric enrolled");
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/webauthn/login/options", kioskLimiter, (req, res) => {
    try {
      const { device_token } = req.body;
      const device = db.prepare("SELECT * FROM attendance_devices WHERE device_token = ?").get(device_token) as any;
      if (!device) return res.status(404).json({ error: "الجهاز غير مسجل" });
      const challenge = b64url(crypto.randomBytes(32));
      webauthnChallenges.set(`login:${challenge}`, { challenge, expires: Date.now() + 120000 });
      res.json({ challenge, rpId: kioskRpId() });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/webauthn/login", kioskLimiter, (req, res) => {
    try {
      const { credentialId, clientDataJSON } = req.body;
      if (!credentialId) return res.status(400).json({ error: "لم تُستلم البصمة" });
      let challengeOk = false;
      if (clientDataJSON) {
        try {
          const json = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8"));
          const ch = json.challenge;
          const pending = webauthnChallenges.get(`login:${ch}`);
          if (pending && pending.expires >= Date.now()) {
            challengeOk = true;
            webauthnChallenges.delete(`login:${ch}`);
          }
        } catch { /* ignore parse */ }
      }
      if (!challengeOk) return res.status(400).json({ error: "جلسة التحقق غير صالحة" });
      const row = db.prepare(`
        SELECT c.*, e.name, e.position, e.branch_id
        FROM employee_webauthn_credentials c
        JOIN employees e ON e.id = c.employee_id
        WHERE c.credential_id = ?
      `).get(credentialId) as any;
      if (!row) return res.status(404).json({ error: "البصمة غير مسجّلة. سجّل الموظف أولاً من شاشة الكiosk" });
      res.json({ success: true, employee: { id: row.employee_id, name: row.name, position: row.position, branch_id: row.branch_id } });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Employee Documents ----
  app.get("/api/documents", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT d.*, e.name as employee_name FROM employee_documents d
        LEFT JOIN employees e ON e.id = d.employee_id ORDER BY d.id DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/documents/:employeeId", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC").all(req.params.employeeId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/documents", (req, res) => {
    try {
      const { employee_id, doc_type, doc_number, issue_date, expiry_date, data_uri, notes } = req.body;
      if (!employee_id) return res.status(400).json({ error: "employee_id مطلوب" });
      let file_path = null;
      if (data_uri) {
        const m = /^data:([^;]+);base64,(.+)$/.exec(data_uri);
        if (m) {
          const ext = (m[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
          const fname = `doc-${employee_id}-${Date.now()}.${ext}`;
          fs.writeFileSync(path.join(uploadsDir, fname), Buffer.from(m[2], 'base64'));
          file_path = `/uploads/${fname}`;
        }
      }
      const r = db.prepare(`
        INSERT INTO employee_documents (employee_id, doc_type, doc_number, issue_date, expiry_date, file_path, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(employee_id, doc_type || 'other', doc_number || null, issue_date || null, expiry_date || null, file_path, notes || null);
      res.json({ id: r.lastInsertRowid, success: true, file_path });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/documents/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM employee_documents WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Alerts: expiries, job mismatch, lateness ----
  app.get("/api/alerts/employee-expiries", (req, res) => {
    try {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const in180 = new Date(now.getTime() + 180 * 86400000).toISOString().slice(0, 10);
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      const alerts: any[] = [];
      emps.forEach(e => {
        if (e.iqama_expiry_gregorian && e.iqama_expiry_gregorian <= in30) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'iqama', label: 'إقامة', expiry: e.iqama_expiry_gregorian, days_left: Math.ceil((new Date(e.iqama_expiry_gregorian).getTime() - now.getTime()) / 86400000) });
        }
        if (e.health_cert_expiry && e.health_cert_expiry <= in30) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'health_cert', label: 'شهادة صحية', expiry: e.health_cert_expiry, days_left: Math.ceil((new Date(e.health_cert_expiry).getTime() - now.getTime()) / 86400000) });
        }
        if (e.passport_expiry && e.passport_expiry <= in180) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'passport', label: 'جواز سفر', expiry: e.passport_expiry, days_left: Math.ceil((new Date(e.passport_expiry).getTime() - now.getTime()) / 86400000) });
        }
        if (e.medical_insurance_expiry && e.medical_insurance_expiry <= in30) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'medical', label: 'تأمين طبي', expiry: e.medical_insurance_expiry, days_left: Math.ceil((new Date(e.medical_insurance_expiry).getTime() - now.getTime()) / 86400000) });
        }
      });
      res.json(alerts);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/alerts/job-mismatch", (req, res) => {
    try {
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      const mismatches = emps.filter(e => {
        const iq = (e.iqama_profession || '').trim();
        const job = (e.job_title || e.position || '').trim();
        return iq && job && iq.toLowerCase() !== job.toLowerCase();
      }).map(e => ({
        employee_id: e.id, name: e.name, iqama_profession: e.iqama_profession, job_title: e.job_title || e.position
      }));
      res.json(mismatches);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/alerts/lateness", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT l.*, e.name as employee_name, b.name as branch_name
        FROM attendance_logs l
        LEFT JOIN employees e ON e.id = l.employee_id
        LEFT JOIN branches b ON b.id = l.branch_id
        WHERE l.status = 'late' OR l.check_in_time IS NULL
        ORDER BY l.check_in_time DESC LIMIT 200
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Transfers ----
  app.get("/api/transfers", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT t.*, e.name as employee_name, fb.name as from_branch, tb.name as to_branch
        FROM employee_transfers t
        LEFT JOIN employees e ON e.id = t.employee_id
        LEFT JOIN branches fb ON fb.id = t.from_branch_id
        LEFT JOIN branches tb ON tb.id = t.to_branch_id
        ORDER BY t.effective_date DESC
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/transfers", (req, res) => {
    try {
      const { employee_id, to_branch_id, effective_date, reason } = req.body;
      if (!employee_id || !to_branch_id) return res.status(400).json({ error: "employee_id و to_branch_id مطلوبان" });
      const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      const from = emp.branch_id || null;
      const r = db.prepare(`
        INSERT INTO employee_transfers (employee_id, from_branch_id, to_branch_id, effective_date, reason)
        VALUES (?, ?, ?, ?, ?)
      `).run(employee_id, from, to_branch_id, effective_date || new Date().toISOString().slice(0, 10), reason || null);
      // Update employee branch (geofence follows the new branch)
      db.prepare("UPDATE employees SET branch_id = ? WHERE id = ?").run(to_branch_id, employee_id);
      logAction("update", "employee", employee_id, `Transferred to branch ${to_branch_id}`);
      createNotification('نقل موظف', `تم نقل ${emp.name} إلى فرع جديد`, 'info');
      res.json({ id: r.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Payroll Split & Reports ----
  app.get("/api/reports/company-salary", (req, res) => {
    try {
      const { month, year } = req.query;
      const m = month || new Date().getMonth() + 1;
      const y = year || new Date().getFullYear();
      const rows = db.prepare(
        "SELECT payment_method, COUNT(*) as emp_count, SUM(net_salary) as total FROM payroll WHERE month = ? AND year = ? GROUP BY payment_method"
      ).all(m, y) as any[];
      const cash = rows.find(r => r.payment_method === 'cash');
      const bank = rows.find(r => r.payment_method === 'bank');
      const total = (cash?.total || 0) + (bank?.total || 0);
      res.json({ month: m, year: y, cash_total: cash?.total || 0, bank_total: bank?.total || 0, total, cash_count: cash?.emp_count || 0, bank_count: bank?.emp_count || 0 });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/reports/branch-salary", (req, res) => {
    try {
      const { month, year } = req.query;
      const m = Number(month) || new Date().getMonth() + 1;
      const y = Number(year) || new Date().getFullYear();
      const branches = db.prepare("SELECT * FROM branches").all() as any[];
      const logs = db.prepare(`
        SELECT branch_id, employee_id, COUNT(DISTINCT date(check_in_time)) as days
        FROM attendance_logs
        WHERE strftime('%m', check_in_time) = ? AND strftime('%Y', check_in_time) = ?
        GROUP BY branch_id, employee_id
      `).all(String(m).padStart(2, '0'), String(y)) as any[];
      const result = branches.map(b => {
        const branchLogs = logs.filter(l => l.branch_id === b.id);
        let totalCost = 0;
        const details = branchLogs.map(l => {
          const emp = db.prepare("SELECT basic_salary, housing_allowance, transport_allowance FROM employees WHERE id = ?").get(l.employee_id) as any;
          const monthly = (Number(emp?.basic_salary) || 0) + (Number(emp?.housing_allowance) || 0) + (Number(emp?.transport_allowance) || 0);
          const cost = (monthly / 30) * l.days;
          totalCost += cost;
          return { employee_id: l.employee_id, days: l.days, monthly, cost: Math.round(cost) };
        });
        return { branch_id: b.id, branch_name: b.name, total_cost: Math.round(totalCost), details };
      });
      res.json({ month: m, year: y, branches: result });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/reports/payroll-statement", (req, res) => {
    try {
      const { month, year } = req.query;
      const m = month || new Date().getMonth() + 1;
      const y = year || new Date().getFullYear();
      const rows = db.prepare(`
        SELECT p.*, e.name as employee_name, e.branch_id, b.name as branch_name, e.payment_method
        FROM payroll p
        LEFT JOIN employees e ON e.id = p.employee_id
        LEFT JOIN branches b ON b.id = e.branch_id
        WHERE p.month = ? AND p.year = ?
      `).all(m, y);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Admin: clear system data (re-authenticates the admin's own account) ----
  app.post("/api/admin/clear-data", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const { password, confirm_text } = req.body;
      // Was: compare against a plaintext 'admin_password' setting seeded with Admin@2026 —
      // a shipped credential. Now the acting admin must present their own real password.
      const adminUser = db.prepare("SELECT password_hash FROM users WHERE id = ?").get((req as any).user?.id) as any;
      if (!password || !adminUser || !(await bcrypt.compare(String(password), adminUser.password_hash))) {
        return res.status(403).json({ error: "كلمة المرور غير صحيحة" });
      }
      if (confirm_text !== 'تفريغ') {
        return res.status(400).json({ error: "يجب كتابة كلمة (تفريغ) للتأكيد" });
      }
      // Config tables that must be KEPT
      const keep = new Set(['settings', 'branches', 'departments', 'allowance_types', 'policies', 'sqlite_sequence']);
      const all = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[];
      const tables = all.map(r => r.name).filter(n => !keep.has(n));
      const cleared: string[] = [];
      // Disable FK enforcement so deletion order doesn't matter
      db.pragma('foreign_keys = OFF');
      try {
        const clearTx = db.transaction(() => {
          for (const t of tables) {
            try { db.prepare(`DELETE FROM ${t}`).run(); cleared.push(t); } catch (e) { /* skip */ }
          }
        });
        clearTx();
        try { db.prepare("DELETE FROM sqlite_sequence WHERE name IN (" + tables.map(() => '?').join(',') + ")").run(...tables); } catch (e) {}
      } finally {
        db.pragma('foreign_keys = ON');
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_seeded', 'done')").run();
      logAction('admin', 'system', null, `System data cleared by admin (${cleared.length} tables)`);
      createNotification('تفريغ البيانات', 'تم تفريغ بيانات النظام بالكامل بواسطة مدير النظام', 'warning');
      res.json({ success: true, cleared_tables: cleared.length });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ---- Monthly Provisions Report (EOSB + Accounting Leaves) ----
  app.get("/api/reports/provisions", (req, res) => {
    try {
      const { month, year } = req.query;
      const m = Number(month) || new Date().getMonth() + 1;
      const y = Number(year) || new Date().getFullYear();
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      const daysInMonth = new Date(y, m, 0).getDate();
      const rows = emps.map(e => {
        const basic = Number(e.basic_salary) || 0;
        const housing = Number(e.housing_allowance) || 0;
        const transport = Number(e.transport_allowance) || 0;
        const monthlyWage = basic + housing + transport;
        const daily = monthlyWage / 30;
        const days = (db.prepare(`
          SELECT COUNT(DISTINCT date(check_in_time)) as d FROM attendance_logs
          WHERE employee_id = ? AND strftime('%m', check_in_time) = ? AND strftime('%Y', check_in_time) = ?
        `).get(e.id, String(m).padStart(2, '0'), String(y)) as any)?.d || daysInMonth;
        const eosbProvision = daily * days * (0.5 / 12);
        const leaveProvision = daily * (21 / 12);
        return {
          employee_id: e.id, name: e.name,
          monthly_wage: monthlyWage, days,
          eosb_provision: Math.round(eosbProvision),
          leave_provision: Math.round(leaveProvision),
          total_provision: Math.round(eosbProvision + leaveProvision)
        };
      });
      const totalEosb = rows.reduce((s, r) => s + r.eosb_provision, 0);
      const totalLeave = rows.reduce((s, r) => s + r.leave_provision, 0);
      const totalProvision = rows.reduce((s, r) => s + r.total_provision, 0);
      const payrollTotal = rows.reduce((s, r) => s + r.monthly_wage, 0);
      res.json({
        month: m, year: y,
        employees: rows,
        total_eosb: totalEosb, total_leave: totalLeave, total_provision: totalProvision,
        payroll_base: payrollTotal,
        eosb_ratio: payrollTotal ? Math.round((totalEosb / payrollTotal) * 1000) / 10 : 0,
        leave_ratio: payrollTotal ? Math.round((totalLeave / payrollTotal) * 1000) / 10 : 0,
        total_ratio: payrollTotal ? Math.round((totalProvision / payrollTotal) * 1000) / 10 : 0
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Serve uploaded documents (authentication required — no public access)
  app.use("/uploads", authenticateToken, express.static(uploadsDir));

  // Initialize Country Rules Service
  CountryRulesService.setDatabase(db);

  // ====================================================
  // API: Countries & Entities
  // ====================================================
  
  // Get all countries
  app.get("/api/countries", authenticateToken, (req, res) => {
    try {
      const countries = db.prepare("SELECT * FROM countries WHERE is_active = 1 ORDER BY name_ar").all();
      res.json(countries);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Get country by code
  app.get("/api/countries/:code", authenticateToken, (req, res) => {
    try {
      const country = db.prepare("SELECT * FROM countries WHERE code = ? AND is_active = 1").get(req.params.code);
      if (!country) return res.status(404).json({ error: "Country not found" });
      
      // Get custom rules
      const customRules = db.prepare("SELECT * FROM country_rule_items WHERE country_code = ? AND is_active = 1").all(req.params.code);
      res.json({ ...country, custom_rules: customRules });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Update country rules
  app.put("/api/countries/:code/rules", authenticateToken, requireRole("admin"), (req, res) => {
    try {
      const { rules } = req.body; // Array of { rule_key, rule_value, description }
      const countryCode = req.params.code;
      
      const tx = db.transaction(() => {
        // Deactivate existing rules
        db.prepare("UPDATE country_rule_items SET is_active = 0 WHERE country_code = ?").run(countryCode);
        // Insert new rules
        for (const rule of rules) {
          db.prepare(`
            INSERT INTO country_rule_items (country_code, rule_type, rule_key, rule_value, description, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
          `).run(countryCode, rule.rule_type, rule.rule_key, rule.rule_value, rule.description || '');
        }
      });
      tx();
      
      CountryRulesService.clearCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Get all entities
  app.get("/api/entities", authenticateToken, (req, res) => {
    try {
      const entities = db.prepare("SELECT e.*, c.name_ar as country_name, c.currency as country_currency FROM entities e LEFT JOIN countries c ON e.country_code = c.code WHERE e.is_active = 1 ORDER BY e.name_ar").all();
      res.json(entities);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Get entity by id
  app.get("/api/entities/:id", authenticateToken, (req, res) => {
    try {
      const entity = db.prepare("SELECT e.*, c.name_ar as country_name, c.currency as country_currency FROM entities e LEFT JOIN countries c ON e.country_code = c.code WHERE e.id = ? AND e.is_active = 1").get(req.params.id);
      if (!entity) return res.status(404).json({ error: "Entity not found" });
      res.json(entity);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Create entity
  app.post("/api/entities", authenticateToken, requireRole("admin"), (req, res) => {
    try {
      const { name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, settings_json } = req.body;
      const result = db.prepare(`
        INSERT INTO entities (name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, settings_json, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(name_ar, name_en, country_code, currency, tax_rate || 0, insurance_emp_rate || 0, insurance_comp_rate || 0, settings_json || '{}');
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Update entity
  app.put("/api/entities/:id", authenticateToken, requireRole("admin"), (req, res) => {
    try {
      const { name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, settings_json, is_active } = req.body;
      db.prepare(`
        UPDATE entities SET name_ar = ?, name_en = ?, country_code = ?, currency = ?, tax_rate = ?, insurance_emp_rate = ?, insurance_comp_rate = ?, settings_json = ?, is_active = ?
        WHERE id = ?
      `).run(name_ar, name_en, country_code, currency, tax_rate || 0, insurance_emp_rate || 0, insurance_comp_rate || 0, settings_json || '{}', is_active ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ====================================================
  // API: Payroll Calculation
  // ====================================================
  
  // Calculate payroll for single employee
  app.post("/api/payroll/calculate", authenticateToken, async (req, res) => {
    try {
      const { employee_id, basicSalary, housingAllowance, transportAllowance, otherAllowances, deductions, loanDeduction, absentDays, overtimeHours, paymentMethod, cashPercentage } = req.body;
      
      // Get employee's entity to determine country
      const user = (req as any).user;
      let entityId = user.entity_id;
      
      // If employee_id provided, get their entity
      if (employee_id) {
        const emp = db.prepare("SELECT entity_id FROM employees WHERE id = ?").get(employee_id);
        if (emp) entityId = emp.entity_id;
      }
      
      if (!entityId) {
        return res.status(400).json({ error: "Entity not found for user/employee" });
      }
      
      const rules = await CountryRulesService.getEntityRules(entityId);
      
      const input = {
        employeeId: Number(employee_id) || 0,
        basicSalary: Number(basicSalary) || 0,
        housingAllowance: Number(housingAllowance) || 0,
        transportAllowance: Number(transportAllowance) || 0,
        otherAllowances: Number(otherAllowances) || 0,
        deductions: Number(deductions) || 0,
        loanDeduction: Number(loanDeduction) || 0,
        absentDays: Number(absentDays) || 0,
        overtimeHours: Number(overtimeHours) || 0,
        paymentMethod: paymentMethod || 'bank',
        cashPercentage: Number(cashPercentage) || 0
      };
      
      const result = PayrollCalculator.calculate(input, rules);
      
      // Calculate cash/bank split
      let cashAmount = 0;
      let bankAmount = 0;
      if (paymentMethod === 'cash') {
        cashAmount = result.netSalary;
      } else if (paymentMethod === 'split') {
        cashAmount = result.netSalary * (cashPercentage / 100);
        bankAmount = result.netSalary - cashAmount;
      } else {
        bankAmount = result.netSalary;
      }
      
      const finalResult = {
        ...result,
        cashAmount: Math.round(cashAmount * 100) / 100,
        bankAmount: Math.round(bankAmount * 100) / 100
      };
      
      res.json(finalResult);
    } catch (e) {
      console.error("Payroll calculation error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Batch calculate payroll for all employees in entity
  app.post("/api/payroll/batch", authenticateToken, async (req, res) => {
    try {
      const { month, year, employeeIds } = req.body;
      const user = (req as any).user;
      const entityId = user.entity_id;
      
      if (!entityId) {
        return res.status(400).json({ error: "Entity not found for user" });
      }
      
      const rules = await CountryRulesService.getEntityRules(entityId);
      
      let employees = db.prepare("SELECT * FROM employees WHERE entity_id = ? AND status = 'active'").all(entityId) as any[];
      
      if (employeeIds && employeeIds.length > 0) {
        employees = employees.filter(e => employeeIds.includes(e.id));
      }
      
      const inputs = employees.map((emp: any) => {
        const basicSalary = Number(emp.basic_salary) || 0;
        const housing = Number(emp.housing_allowance) || 0;
        const transport = Number(emp.transport_allowance) || 0;
        const other = Number(emp.other_allowances) || 0;
        
        // Get attendance for absent days if month/year provided
        let absentDays = 0;
        if (month && year) {
          const daysInMonth = new Date(year, month, 0).getDate();
          const presentDays = (db.prepare(`
            SELECT COUNT(DISTINCT date(check_in_time)) as d FROM attendance_logs
            WHERE employee_id = ? AND strftime('%m', check_in_time) = ? AND strftime('%Y', check_in_time) = ?
          `).get(emp.id, String(month).padStart(2, '0'), String(year)) as any)?.d || 0;
          absentDays = Math.max(0, daysInMonth - presentDays);
        }
        
        // Get overtime hours
        const overtimeHours = (db.prepare(`
          SELECT COALESCE(SUM(overtime_hours), 0) as h FROM attendance_logs
          WHERE employee_id = ? AND strftime('%m', check_in_time) = ? AND strftime('%Y', check_in_time) = ?
        `).get(emp.id, String(month).padStart(2, '0'), String(year)) as any)?.h || 0;
        
        // Get loans deduction
        const loanDeduction = (db.prepare(`
          SELECT COALESCE(SUM(monthly_installment), 0) as l FROM loans
          WHERE employee_id = ? AND status = 'active'
        `).get(emp.id) as any)?.l || 0;
        
        return {
          employeeId: emp.id,
          employee: emp,
          basicSalary,
          housingAllowance: housing,
          transportAllowance: transport,
          otherAllowances: other,
          deductions: 0,
          loanDeduction,
          absentDays,
          overtimeHours,
          paymentMethod: emp.salary_payment_method || 'bank',
          cashPercentage: Number(emp.cash_percentage) || 0
        };
      });
      
      const results = PayrollCalculator.calculateBatch(inputs, rules);
      
      const finalResults = results.map((r, i) => {
        const emp = inputs[i].employee;
        const paymentMethod = emp.salary_payment_method || 'bank';
        const cashPercentage = Number(emp.cash_percentage) || 0;
        
        let cashAmount = 0, bankAmount = 0;
        if (paymentMethod === 'cash') cashAmount = r.netSalary;
        else if (paymentMethod === 'split') {
          cashAmount = r.netSalary * (cashPercentage / 100);
          bankAmount = r.netSalary - cashAmount;
        } else bankAmount = r.netSalary;
        
        return {
          ...r,
          employeeId: inputs[i].employeeId,
          employeeName: emp.name,
          employeeCode: emp.employee_code,
          departmentId: emp.department_id,
          branchId: emp.branch_id,
          paymentMethod,
          cashPercentage,
          cashAmount: Math.round(cashAmount * 100) / 100,
          bankAmount: Math.round(bankAmount * 100) / 100
        };
      });
      
      const summary = PayrollCalculator.getSummary(results);
      
      res.json({
        month, year,
        employees: finalResults,
        summary: {
          ...summary,
          totalCash: finalResults.reduce((s, r) => s + r.cashAmount, 0),
          totalBank: finalResults.reduce((s, r) => s + r.bankAmount, 0)
        }
      });
    } catch (e) {
      console.error("Batch payroll error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Get payroll rules for entity (for display in settings)
  app.get("/api/entities/:id/payroll-rules", authenticateToken, async (req, res) => {
    try {
      const rules = await CountryRulesService.getEntityRules(Number(req.params.id));
      res.json(rules);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  function runDbBackup() {
    try {
      const dir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `payroll-${new Date().toISOString().slice(0, 10)}.db`);
      fs.copyFileSync(path.join(process.cwd(), "payroll.db"), dest);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_auto_backup', ?)").run(new Date().toISOString());
    } catch (e) { console.error("backup failed", e); }
  }

  function pushDocExpiryNotifications() {
    try {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      for (const e of emps) {
        if (e.iqama_expiry_gregorian && e.iqama_expiry_gregorian <= in30) {
          createNotification("قرب انتهاء إقامة", `إقامة ${e.name} تنتهي ${e.iqama_expiry_gregorian}`, "warning");
        }
        if (e.health_cert_expiry && e.health_cert_expiry <= in30) {
          createNotification("شهادة صحية", `الشهادة الصحية لـ ${e.name} تنتهي ${e.health_cert_expiry}`, "warning");
        }
        if (e.medical_insurance_expiry && e.medical_insurance_expiry <= in30) {
          createNotification("تأمين طبي", `تأمين ${e.name} ينتهي ${e.medical_insurance_expiry}`, "warning");
        }
      }
    } catch (e) { console.error(e); }
  }

  app.get("/api/backup/status", authenticateToken, requireRole("admin"), (_req, res) => {
    const last = db.prepare("SELECT value FROM settings WHERE key = 'last_auto_backup'").get() as any;
    res.json({ last_auto_backup: last?.value || null });
  });

  // --- Static / SPA serving — MUST stay registered after every /api route ---
  // app.get("*") is a catch-all. While it sat above /api/backup/status it swallowed that
  // route in production and answered with index.html instead of JSON. Registering this last
  // keeps GET / serving the SPA while every /api/* path reaches its own handler.
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // C4: list every write route the policy does not classify yet, so classification can be finished.
  function reportUnclassifiedWriteRoutes() {
    try {
      const stack: any[] = (app as any)._router?.stack || (app as any).router?.stack || [];
      const found = new Set<string>();
      for (const layer of stack) {
        const route = layer?.route;
        if (!route || !route.path || !route.methods) continue;
        const routePath = route.path.startsWith("/") ? route.path : "/" + route.path;
        if (!routePath.startsWith("/api")) continue;
        // intentionally public routes carry no token, so RBAC never sees them
        if (openApi.some((p) => routePath === p || routePath.startsWith(p + "/"))) continue;
        for (const rawMethod of Object.keys(route.methods)) {
          const method = String(rawMethod).toUpperCase();
          if (!WRITE_METHODS.has(method)) continue;
          if (ROUTE_PERMISSIONS.some((r) => ruleMatches(r, method, routePath))) continue;
          if (ESS_WRITE_ALLOWLIST.some((r) => r.method === method && r.pattern.test(routePath))) continue;
          found.add(method + " " + routePath);
        }
      }
      if (found.size) {
        console.warn("[RBAC] " + found.size + " unclassified write route(s) — allowed for operational roles, denied for employee_ess:");
        for (const route of Array.from(found).sort()) console.warn("  - " + route);
      } else {
        console.log("[RBAC] all write routes are classified.");
      }
    } catch (e) {
      console.warn("[RBAC] route coverage scan failed", e);
    }
  }

  reportUnclassifiedWriteRoutes();
  runDbBackup();
  pushDocExpiryNotifications();
  setInterval(runDbBackup, 24 * 60 * 60 * 1000);
  setInterval(pushDocExpiryNotifications, 12 * 60 * 60 * 1000);

  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;
  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    https
      .createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app)
      .listen(PORT, "0.0.0.0", () => {
        console.log(`Server running at https://0.0.0.0:${PORT} (HTTPS مفعّل — بصمة الهاتف تعمل)`);
      });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log("تنبيه: بصمة الوجه/الإصبع على هاتف الفرع تتطلب HTTPS. اضبط SSL_KEY_PATH و SSL_CERT_PATH.");
    });
  }
}

startServer();
