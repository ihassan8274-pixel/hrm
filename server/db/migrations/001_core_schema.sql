-- Migration 001: Core schema (settings, audit, notifications, users, sessions, countries, entities)
-- Run this first on fresh databases

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('org_name', 'مؤسسة الرواتب العالمية');
INSERT OR IGNORE INTO settings (key, value) VALUES ('country', 'Egypt');
INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'EGP');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '10');

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_by TEXT DEFAULT 'User',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Countries (must be before entities)
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

-- Entities (references countries)
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

-- Users (references entities)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  entity_id INTEGER,
  employee_id INTEGER,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities (id),
  FOREIGN KEY (employee_id) REFERENCES employees (id)
);

-- Sessions (references users)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  route_pattern TEXT NOT NULL,
  method TEXT NOT NULL,
  allowed INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Country rule items (EAV)
CREATE TABLE IF NOT EXISTS country_rule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (country_code) REFERENCES countries (code)
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('org_name', 'مؤسسة الرواتب العالمية');
INSERT OR IGNORE INTO settings (key, value) VALUES ('country', 'Egypt');
INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'EGP');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '10');

-- Seed countries (required for entities FK)
INSERT OR IGNORE INTO countries (code, name_ar, name_en, currency, currency_symbol_ar, currency_symbol_en,
  insurance_type, insurance_emp_rate, insurance_comp_rate, insurance_ceiling, insurance_floor,
  tax_type, eos_type, eos_months_per_year, eos_max_years, annual_leave_days, sick_leave_days,
  maternity_leave_days, paternity_leave_days, working_hours_per_day, working_days_per_week,
  weekend_days_json, wps_format, is_active)
VALUES 
('SA', 'السعودية', 'Saudi Arabia', 'SAR', 'ر.س', 'SAR', 'gosi', 9.75, 11.75, 45000, 0, 'none', 'saudi_half_month', 0.5, null, 21, 0, 0, 0, 8, 6, '[5,6]', 'sama', 1),
('EG', 'مصر', 'Egypt', 'EGP', 'ج.م', 'EGP', 'egypt_social', 11, 18.75, 12600, 1700, 'progressive', 'egypt_half_month', 0.5, 15, 21, 180, 90, 0, 8, 6, '[5]', 'egypt_sif', 1),
('AE', 'الإمارات', 'United Arab Emirates', 'AED', 'د.إ', 'AED', 'uae_gpfa', 5, 12.5, 50000, 1000, 'none', 'uae_21_days', 0.575, null, 30, 90, 45, 5, 8, 5, '[5,6]', 'uae_wps', 1),
('JO', 'الأردن', 'Jordan', 'JOD', 'د.أ', 'JOD', 'jordan_ssc', 6.5, 14.25, 3000, 190, 'progressive', 'jordan_21_days', 0.575, null, 14, 30, 70, 3, 8, 6, '[5]', 'jordan_ips', 1),
('BH', 'البحرين', 'Bahrain', 'BHD', 'د.ب', 'BHD', 'bahrain_sio', 7, 12, 4000, 200, 'none', 'bahrain_half_month', 0.5, null, 30, 55, 60, 1, 8, 5, '[5,6]', 'bahrain_eps', 1),
('KW', 'الكويت', 'Kuwait', 'KWD', 'د.ك', 'KWD', 'kuwait_pifss', 10, 11.5, 3000, 0, 'none', 'kuwait_30_days', 1, null, 30, 30, 70, 0, 8, 6, '[5]', 'kuwait_wps', 1);

-- Default entity (required for FK references)
INSERT OR IGNORE INTO entities (id, name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, is_active)
VALUES (1, 'الشركة الرئيسية', 'Main Company', 'SA', 'SAR', 0, 9.75, 11.75, 1);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_employee ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);