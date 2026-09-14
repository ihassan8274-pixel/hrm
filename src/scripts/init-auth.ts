import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('payroll.db');

console.log('Initializing authentication system...');

// Create default entity (main company)
const entityResult = db.prepare(`
  INSERT OR IGNORE INTO entities (id, name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, is_active)
  VALUES (1, 'الشركة الرئيسية', 'Main Company', 'SA', 'SAR', 0, 9.75, 11.75, 1)
`).run();

console.log('Entity created:', entityResult);

// Create default admin user
const adminPassword = await bcrypt.hash('admin123', 10);
const adminResult = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, entity_id, status)
  VALUES ('admin', ?, 'admin', 1, 'active')
`).run(adminPassword);

console.log('Admin user created:', adminResult);

// Create HR user
const hrPassword = await bcrypt.hash('hr123', 10);
const hrResult = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, entity_id, status)
  VALUES ('hr', ?, 'hr_manager', 1, 'active')
`).run(hrPassword);

console.log('HR user created:', hrResult);

// Create Finance user
const financePassword = await bcrypt.hash('finance123', 10);
const financeResult = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, entity_id, status)
  VALUES ('finance', ?, 'finance', 1, 'active')
`).run(financePassword);

console.log('Finance user created:', financeResult);

// Create Branch Manager user
const branchManagerPassword = await bcrypt.hash('branch123', 10);
const branchManagerResult = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, entity_id, status)
  VALUES ('branch_manager', ?, 'branch_manager', 1, 'active')
`).run(branchManagerPassword);

console.log('Branch Manager user created:', branchManagerResult);

// Create Employee user
const employeePassword = await bcrypt.hash('employee123', 10);
const employeeResult = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, entity_id, status)
  VALUES ('employee', ?, 'employee_ess', 1, 'active')
`).run(employeePassword);

console.log('Employee user created:', employeeResult);

// Seed default countries
const countries = [
  {
    code: 'SA',
    name_ar: 'السعودية',
    name_en: 'Saudi Arabia',
    currency: 'SAR',
    currency_symbol_ar: 'ر.س',
    currency_symbol_en: 'SAR',
    insurance_type: 'gosI',
    insurance_emp_rate: 9.75,
    insurance_comp_rate: 11.75,
    insurance_ceiling: 45000,
    insurance_floor: 0,
    tax_type: 'none',
    eos_type: 'saudi_half_month',
    eos_months_per_year: 0.5,
    eos_max_years: null,
    annual_leave_days: 21,
    sick_leave_days: 0,
    maternity_leave_days: 0,
    paternity_leave_days: 0,
    working_hours_per_day: 8,
    working_days_per_week: 6,
    weekend_days_json: JSON.stringify([5, 6]), // Friday, Saturday
    wps_format: 'sama',
    is_active: 1
  },
  {
    code: 'EG',
    name_ar: 'مصر',
    name_en: 'Egypt',
    currency: 'EGP',
    currency_symbol_ar: 'ج.م',
    currency_symbol_en: 'EGP',
    insurance_type: 'egypt_social',
    insurance_emp_rate: 11,
    insurance_comp_rate: 18.75,
    insurance_ceiling: 12600,
    insurance_floor: 1700,
    tax_type: 'progressive',
    eos_type: 'egypt_half_month',
    eos_months_per_year: 0.5,
    eos_max_years: 15,
    annual_leave_days: 21,
    sick_leave_days: 180,
    maternity_leave_days: 90,
    paternity_leave_days: 0,
    working_hours_per_day: 8,
    working_days_per_week: 6,
    weekend_days_json: JSON.stringify([5]), // Friday
    wps_format: 'egypt_sif',
    is_active: 1
  },
  {
    code: 'AE',
    name_ar: 'الإمارات',
    name_en: 'United Arab Emirates',
    currency: 'AED',
    currency_symbol_ar: 'د.إ',
    currency_symbol_en: 'AED',
    insurance_type: 'uae_gpfa',
    insurance_emp_rate: 5,
    insurance_comp_rate: 12.5,
    insurance_ceiling: 50000,
    insurance_floor: 1000,
    tax_type: 'none',
    eos_type: 'uae_21_days',
    eos_months_per_year: 0.575, // 21/365
    eos_max_years: null,
    annual_leave_days: 30,
    sick_leave_days: 90,
    maternity_leave_days: 45,
    paternity_leave_days: 5,
    working_hours_per_day: 8,
    working_days_per_week: 5,
    weekend_days_json: JSON.stringify([5, 6]), // Friday, Saturday
    wps_format: 'uae_wps',
    is_active: 1
  },
  {
    code: 'JO',
    name_ar: 'الأردن',
    name_en: 'Jordan',
    currency: 'JOD',
    currency_symbol_ar: 'د.أ',
    currency_symbol_en: 'JOD',
    insurance_type: 'jordan_ssc',
    insurance_emp_rate: 6.5,
    insurance_comp_rate: 14.25,
    insurance_ceiling: 3000,
    insurance_floor: 190,
    tax_type: 'progressive',
    eos_type: 'jordan_21_days',
    eos_months_per_year: 0.575,
    eos_max_years: null,
    annual_leave_days: 14,
    sick_leave_days: 30,
    maternity_leave_days: 70,
    paternity_leave_days: 3,
    working_hours_per_day: 8,
    working_days_per_week: 6,
    weekend_days_json: JSON.stringify([5]), // Friday
    wps_format: 'jordan_ips',
    is_active: 1
  },
  {
    code: 'BH',
    name_ar: 'البحرين',
    name_en: 'Bahrain',
    currency: 'BHD',
    currency_symbol_ar: 'د.ب',
    currency_symbol_en: 'BHD',
    insurance_type: 'bahrain_sio',
    insurance_emp_rate: 7,
    insurance_comp_rate: 12,
    insurance_ceiling: 4000,
    insurance_floor: 200,
    tax_type: 'none',
    eos_type: 'bahrain_half_month',
    eos_months_per_year: 0.5,
    eos_max_years: null,
    annual_leave_days: 30,
    sick_leave_days: 55,
    maternity_leave_days: 60,
    paternity_leave_days: 1,
    working_hours_per_day: 8,
    working_days_per_week: 5,
    weekend_days_json: JSON.stringify([5, 6]), // Friday, Saturday
    wps_format: 'bahrain_eps',
    is_active: 1
  },
  {
    code: 'KW',
    name_ar: 'الكويت',
    name_en: 'Kuwait',
    currency: 'KWD',
    currency_symbol_ar: 'د.ك',
    currency_symbol_en: 'KWD',
    insurance_type: 'kuwait_pifss',
    insurance_emp_rate: 10,
    insurance_comp_rate: 11.5,
    insurance_ceiling: 3000,
    insurance_floor: 0,
    tax_type: 'none',
    eos_type: 'kuwait_30_days',
    eos_months_per_year: 1,
    eos_max_years: null,
    annual_leave_days: 30,
    sick_leave_days: 30,
    maternity_leave_days: 70,
    paternity_leave_days: 0,
    working_hours_per_day: 8,
    working_days_per_week: 6,
    weekend_days_json: JSON.stringify([5]), // Friday
    wps_format: 'kuwait_wps',
    is_active: 1
  }
];

for (const country of countries) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO countries (code, name_ar, name_en, currency, currency_symbol_ar, currency_symbol_en,
      insurance_type, insurance_emp_rate, insurance_comp_rate, insurance_ceiling, insurance_floor,
      tax_type, eos_type, eos_months_per_year, eos_max_years, annual_leave_days, sick_leave_days,
      maternity_leave_days, paternity_leave_days, working_hours_per_day, working_days_per_week,
      weekend_days_json, wps_format, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    country.code, country.name_ar, country.name_en, country.currency,
    country.currency_symbol_ar, country.currency_symbol_en,
    country.insurance_type, country.insurance_emp_rate, country.insurance_comp_rate,
    country.insurance_ceiling, country.insurance_floor,
    country.tax_type, country.eos_type, country.eos_months_per_year, country.eos_max_years,
    country.annual_leave_days, country.sick_leave_days,
    country.maternity_leave_days, country.paternity_leave_days,
    country.working_hours_per_day, country.working_days_per_week,
    country.weekend_days_json, country.wps_format, country.is_active
  );
  console.log(`Country ${country.code} created:`, result);
}

console.log('Authentication initialization complete!');