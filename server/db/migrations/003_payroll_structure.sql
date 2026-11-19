-- Migration 003: Payroll, salary structures, and related tables

-- Tax brackets (referenced by countries)
CREATE TABLE IF NOT EXISTS tax_brackets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  lower_bound REAL NOT NULL,
  upper_bound REAL,  -- NULL means no upper bound
  rate REAL NOT NULL,
  FOREIGN KEY (country_code) REFERENCES countries (code)
);

-- Payroll runs
CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  basic_salary REAL DEFAULT 0,
  allowances REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  net_salary REAL DEFAULT 0,
  insurance_emp_share REAL DEFAULT 0,
  insurance_comp_share REAL DEFAULT 0,
  bonuses REAL DEFAULT 0,
  penalties REAL DEFAULT 0,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  national_id_iqama TEXT,
  is_saudi INTEGER DEFAULT 1,
  housing_allowance REAL DEFAULT 0,
  transport_allowance REAL DEFAULT 0,
  gosi_number TEXT,
  gosi_salary REAL DEFAULT 0,
  saudi_iban TEXT,
  bank_name TEXT,
  payment_method TEXT DEFAULT 'bank',
  country_code TEXT DEFAULT 'SA',
  cash_amount REAL DEFAULT 0,
  bank_amount REAL DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Additional salaries (off-cycle)
CREATE TABLE IF NOT EXISTS additional_salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  type TEXT, -- 'earning' or 'deduction'
  amount REAL,
  reason TEXT,
  month INTEGER,
  year INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Payroll corrections (locked period corrections)
CREATE TABLE IF NOT EXISTS payroll_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  month INTEGER,
  year INTEGER,
  field_name TEXT,
  old_value REAL,
  new_value REAL,
  reason TEXT,
  approved_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Tax exemptions
CREATE TABLE IF NOT EXISTS tax_exemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  amount REAL,
  reason TEXT,
  start_month INTEGER,
  start_year INTEGER,
  end_month INTEGER,
  end_year INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Salary components (earning/deduction/employer contribution definitions)
CREATE TABLE IF NOT EXISTS salary_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  type TEXT NOT NULL, -- 'earning', 'deduction', 'employer_contribution'
  category TEXT, -- 'basic', 'allowance', 'statutory', 'loan', 'tax', 'other'
  calculation_type TEXT DEFAULT 'fixed', -- 'fixed', 'percentage', 'formula', 'bracket'
  calculation_value TEXT, -- percentage: "0.15", formula: "base_salary * 0.15"
  condition_formula TEXT, -- condition: "employee.is_saudi == 1"
  depends_on_components TEXT, -- JSON array of component codes
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_taxable INTEGER DEFAULT 1,
  is_gosi_applicable INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Salary structures (configurable per entity/department/position)
CREATE TABLE IF NOT EXISTS salary_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  entity_id INTEGER DEFAULT 1,
  department_id INTEGER,
  position_id INTEGER,
  payroll_frequency TEXT DEFAULT 'monthly',
  currency TEXT DEFAULT 'SAR',
  country_code TEXT DEFAULT 'SA',
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities (id),
  FOREIGN KEY (department_id) REFERENCES departments (id),
  FOREIGN KEY (position_id) REFERENCES positions (id)
);

-- Salary structure components (links structure to components)
CREATE TABLE IF NOT EXISTS salary_structure_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  structure_id INTEGER NOT NULL,
  component_id INTEGER NOT NULL,
  sequence INTEGER DEFAULT 0,
  is_mandatory INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (structure_id) REFERENCES salary_structures (id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES salary_components (id) ON DELETE CASCADE
);

-- Salary slips (generated payroll records per employee per period)
CREATE TABLE IF NOT EXISTS salary_slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  structure_id INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  working_days INTEGER,
  payment_days INTEGER,
  absent_days INTEGER DEFAULT 0,
  leave_without_pay_days INTEGER DEFAULT 0,
  overtime_hours INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  gross_earnings REAL,
  total_deductions REAL,
  total_employer_contributions REAL,
  net_pay REAL,
  status TEXT DEFAULT 'draft', -- 'draft', 'approved', 'cancelled'
  approved_by INTEGER,
  approved_at DATETIME,
  calculation_details TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  FOREIGN KEY (structure_id) REFERENCES salary_structures (id)
);

-- Salary slip items (line items for a slip)
CREATE TABLE IF NOT EXISTS salary_slip_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id INTEGER NOT NULL,
  component_id INTEGER NOT NULL,
  component_code TEXT,
  component_name_ar TEXT,
  component_type TEXT, -- 'earning', 'deduction', 'employer_contribution'
  amount REAL,
  base_amount REAL,
  formula_used TEXT,
  sequence INTEGER DEFAULT 0,
  FOREIGN KEY (slip_id) REFERENCES salary_slips (id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES salary_components (id)
);

-- EWA (Earned Wage Access)
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
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(month, year);
CREATE INDEX IF NOT EXISTS idx_payroll_emp ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_additional_salaries_emp ON additional_salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_emp ON salary_slips(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_period ON salary_slips(period_month, period_year);
CREATE INDEX IF NOT EXISTS idx_salary_structure_comp_structure ON salary_structure_components(structure_id);
CREATE INDEX IF NOT EXISTS idx_salary_components_type ON salary_components(type);
CREATE INDEX IF NOT EXISTS idx_salary_components_active ON salary_components(is_active);