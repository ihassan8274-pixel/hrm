-- Migration 004: Compliance, Saudi-specific, and advanced HR modules

-- Compliance: Visas
CREATE TABLE IF NOT EXISTS visas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  visa_type TEXT, -- 'exit_reentry_single', 'exit_reentry_multiple', 'final_exit', 'work_visa'
  visa_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  destination TEXT,
  sponsor TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Compliance: Flight tickets
CREATE TABLE IF NOT EXISTS flight_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  airline TEXT,
  flight_number TEXT,
  departure TEXT,
  arrival TEXT,
  departure_time DATETIME,
  arrival_time DATETIME,
  ticket_number TEXT,
  cost REAL,
  status TEXT DEFAULT 'booked',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Disciplinary violations
CREATE TABLE IF NOT EXISTS disciplinary_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  violation_type TEXT, -- 'attendance_absence', 'delay_departure', 'insubordination', 'negligence', 'safety_breach', 'art80_gross_misconduct'
  severity TEXT DEFAULT 'minor', -- 'minor', 'moderate', 'severe', 'critical'
  description TEXT,
  incident_date DATE,
  status TEXT DEFAULT 'open', -- 'open', 'under_investigation', 'hearing_scheduled', 'resolved', 'appealed'
  penalty_type TEXT, -- 'verbal_notice', 'written_warning_1', 'written_warning_2', 'salary_deduction_1day', 'salary_deduction_3days', 'termination_art80'
  penalty_days INTEGER DEFAULT 0,
  applied_to_payroll INTEGER DEFAULT 0,
  reported_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Clearances
CREATE TABLE IF NOT EXISTS clearances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  department_id INTEGER,
  type TEXT, -- 'resignation', 'contract_end', 'art77_termination', 'art80_termination', 'retirement'
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected'
  initiated_by INTEGER,
  initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  notes TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments (id)
);

-- Work injuries
CREATE TABLE IF NOT EXISTS work_injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  injury_date DATE,
  injury_time TIME,
  location TEXT,
  description TEXT,
  severity TEXT DEFAULT 'minor', -- 'minor', 'moderate', 'severe', 'critical'
  body_part TEXT,
  cause TEXT,
  status TEXT DEFAULT 'reported', -- 'reported', 'investigating', 'compensation_pending', 'closed'
  compensation_amount REAL DEFAULT 0,
  reported_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Grievances
CREATE TABLE IF NOT EXISTS grievances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  subject TEXT,
  description TEXT,
  type TEXT, -- 'harassment', 'discrimination', 'pay_dispute', 'working_conditions', 'other'
  status TEXT DEFAULT 'open', -- 'open', 'under_review', 'committee_assigned', 'hearing_scheduled', 'resolved', 'closed'
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  assigned_to INTEGER,
  resolution TEXT,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Hearings
CREATE TABLE IF NOT EXISTS hearings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grievance_id INTEGER,
  scheduled_at DATETIME,
  location TEXT,
  attendees TEXT, -- JSON array
  outcome TEXT,
  minutes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grievance_id) REFERENCES grievances (id) ON DELETE CASCADE
);

-- Warnings
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT, -- 'attention_notice', 'first_warning', 'second_warning', 'final_warning'
  reason TEXT,
  issued_by INTEGER,
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  acknowledged INTEGER DEFAULT 0,
  acknowledged_at DATETIME,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- HSE Inspections
CREATE TABLE IF NOT EXISTS hse_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER,
  inspector_id INTEGER,
  inspector_name TEXT,
  inspection_date DATE,
  type TEXT, -- 'routine', 'incident_followup', 'compliance', 'risk_assessment'
  category TEXT, -- 'fire_safety', 'emergency_exits', 'electrical', 'ventilation', 'first_aid', 'ppe_compliance'
  score INTEGER, -- 0-100
  findings TEXT, -- JSON
  corrective_actions TEXT,
  deadline_date DATE,
  recommendations TEXT,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'followup_required'
  next_inspection_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches (id)
);

-- HSE PPE Logs
CREATE TABLE IF NOT EXISTS hse_ppe_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  item_name TEXT,
  item_type TEXT, -- 'helmet', 'vest', 'boots', 'gloves', 'glasses', 'mask', 'harness'
  issue_date DATE,
  expiry_date DATE,
  condition TEXT DEFAULT 'good', -- 'good', 'worn', 'damaged', 'lost'
  status TEXT DEFAULT 'active', -- 'active', 'renewed', 'expired', 'damaged'
  issued_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Exit interviews
CREATE TABLE IF NOT EXISTS exit_interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  interview_date DATE,
  departure_date DATE,
  interviewer_id INTEGER,
  primary_reason TEXT, -- 'salary', 'management', 'career_growth', 'work_life_balance', 'relocation', 'toxic_culture', 'health_personal'
  reason_details TEXT,
  manager_rating INTEGER DEFAULT 3,
  culture_rating INTEGER DEFAULT 4,
  benefits_rating INTEGER DEFAULT 3,
  would_recommend_score INTEGER DEFAULT 7,
  retention_feedback TEXT,
  estimated_replacement_cost REAL DEFAULT 25000,
  ai_sentiment TEXT DEFAULT 'neutral', -- negative, neutral, positive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Medical insurance
CREATE TABLE IF NOT EXISTS medical_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  insurance_company TEXT,
  policy_number TEXT,
  category TEXT, -- 'VIP', 'Class A', 'Class B', 'Class C', 'Class D'
  coverage_start DATE,
  coverage_end DATE,
  premium REAL,
  dependents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS medical_dependents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER,
  name TEXT,
  relation TEXT, -- 'spouse', 'son', 'daughter', 'parent'
  date_of_birth DATE,
  gender TEXT,
  id_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (policy_id) REFERENCES medical_policies (id) ON DELETE CASCADE
);

-- Fleet management
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number TEXT UNIQUE NOT NULL,
  brand TEXT,
  model TEXT,
  year INTEGER,
  color TEXT,
  vin TEXT,
  fuel_type TEXT DEFAULT 'petrol',
  assigned_employee_id INTEGER,
  assigned_branch_id INTEGER,
  purchase_date DATE,
  purchase_value REAL,
  insurance_expiry DATE,
  registration_expiry DATE,
  inspection_expiry DATE,
  status TEXT DEFAULT 'active', -- 'active', 'maintenance', 'sold', 'written_off'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_employee_id) REFERENCES employees (id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_branch_id) REFERENCES branches (id)
);

CREATE TABLE IF NOT EXISTS fleet_traffic_fines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER,
  violation_date DATE,
  violation_type TEXT,
  location TEXT,
  amount REAL,
  points INTEGER DEFAULT 0,
  paid INTEGER DEFAULT 0,
  paid_at DATETIME,
  deducted_from_payroll INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES fleet_vehicles (id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visas_emp ON visas(employee_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_emp ON disciplinary_violations(employee_id);
CREATE INDEX IF NOT EXISTS idx_clearances_emp ON clearances(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_injuries_emp ON work_injuries(employee_id);
CREATE INDEX IF NOT EXISTS idx_grievances_emp ON grievances(employee_id);
CREATE INDEX IF NOT EXISTS idx_medical_policies_emp ON medical_policies(employee_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_branch ON fleet_vehicles(assigned_branch_id);