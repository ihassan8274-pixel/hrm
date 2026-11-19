-- Migration 002: HR Core tables (employees, branches, departments, attendance, loans, etc.)

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  latitude REAL,
  longitude REAL,
  geofence_radius_m INTEGER DEFAULT 200,
  work_start_time TEXT DEFAULT '08:00',
  work_end_time TEXT DEFAULT '17:00',
  entity_id INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  manager_id INTEGER,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Employees (referenced by users.employee_id FK)
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER,
  department_id INTEGER,
  name TEXT NOT NULL,
  position TEXT,
  job_title TEXT,
  basic_salary REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  allowances REAL DEFAULT 0,
  insurance_number TEXT,
  bank_account TEXT,
  nationality TEXT DEFAULT 'سعودي',
  is_saudi INTEGER DEFAULT 1,
  national_id_iqama TEXT,
  border_number TEXT,
  iqama_expiry_gregorian TEXT,
  iqama_expiry_hijri TEXT,
  iqama_profession TEXT,
  work_permit_number TEXT,
  work_permit_expiry TEXT,
  work_permit_fee REAL DEFAULT 9600,
  gosi_number TEXT,
  gosi_registered_salary REAL DEFAULT 0,
  housing_allowance REAL DEFAULT 0,
  transport_allowance REAL DEFAULT 0,
  other_allowances REAL DEFAULT 0,
  insurance_company TEXT DEFAULT 'التعاونية للتأمين',
  medical_insurance_category TEXT DEFAULT 'Class A',
  medical_insurance_policy TEXT,
  medical_insurance_expiry TEXT,
  medical_dependents_count INTEGER DEFAULT 0,
  saudi_iban TEXT,
  bank_name TEXT DEFAULT 'مصرف الراجحي',
  contract_type TEXT DEFAULT 'fixed',
  contract_start_date TEXT,
  contract_end_date TEXT,
  passport_number TEXT,
  passport_expiry TEXT,
  health_cert_number TEXT,
  health_cert_expiry TEXT,
  payment_method TEXT DEFAULT 'bank',
  cash_percentage REAL DEFAULT 0,
  face_template TEXT,
  country_code TEXT DEFAULT 'SA',
  entity_id INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches (id),
  FOREIGN KEY (department_id) REFERENCES departments (id),
  FOREIGN KEY (entity_id) REFERENCES entities (id)
);

-- Attendance summary
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  month INTEGER,
  year INTEGER,
  absence_days INTEGER DEFAULT 0,
  overtime_hours INTEGER DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Attendance logs (daily check-in/out)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  branch_id INTEGER,
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
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Loans
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  total_amount REAL,
  remaining_amount REAL,
  monthly_installment REAL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Allowance types
CREATE TABLE IF NOT EXISTS allowance_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  type TEXT DEFAULT 'allowance',
  is_taxable INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Employee allowances (junction)
CREATE TABLE IF NOT EXISTS employee_allowances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  allowance_type_id INTEGER,
  amount REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  FOREIGN KEY (allowance_type_id) REFERENCES allowance_types (id)
);

-- Bonuses & penalties
CREATE TABLE IF NOT EXISTS bonuses_penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  type TEXT,
  amount REAL,
  reason TEXT,
  month INTEGER,
  year INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Leaves
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  type TEXT DEFAULT 'annual',
  start_date DATE,
  end_date DATE,
  days REAL,
  status TEXT DEFAULT 'pending',
  reason TEXT,
  approver_id INTEGER,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Employee documents
CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  doc_type TEXT,
  doc_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_path TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Transfers
CREATE TABLE IF NOT EXISTS employee_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  from_branch_id INTEGER,
  to_branch_id INTEGER,
  transfer_date DATE,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  FOREIGN KEY (from_branch_id) REFERENCES branches (id),
  FOREIGN KEY (to_branch_id) REFERENCES branches (id)
);

-- Positions (for salary structures)
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  department_id INTEGER,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments (id)
);

-- Attendance devices (kiosk)
CREATE TABLE IF NOT EXISTS attendance_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  device_name TEXT,
  device_token TEXT UNIQUE,
  pairing_pin TEXT,
  phone_bound INTEGER DEFAULT 0,
  bound_fingerprint TEXT,
  bound_at TEXT,
  last_latitude REAL,
  last_longitude REAL,
  last_verified_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches (id)
);

-- Kiosk security logs
CREATE TABLE IF NOT EXISTS kiosk_security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER,
  reason TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES attendance_devices (id)
);

-- WebAuthn credentials for biometric verification
CREATE TABLE IF NOT EXISTS employee_webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT, -- comma-separated: 'internal', 'usb', 'ble', 'nfc'
  method TEXT DEFAULT 'face', -- 'face', 'fingerprint'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_entity ON employees(entity_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON attendance_logs(check_in_time);
CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_documents_emp ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_loans_emp ON loans(employee_id);