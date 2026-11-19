-- Health certificates module (الشهادات الصحية — بلدي / وزارة الصحة)
-- One row per issued certificate; the employee snapshot columns
-- (employees.health_cert_number / health_cert_expiry) stay in sync with the
-- latest active row so the existing expiry-alert code keeps working.
CREATE TABLE IF NOT EXISTS health_certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  certificate_number TEXT,
  profession_on_cert TEXT,
  issue_date TEXT,
  expiry_date TEXT NOT NULL,
  issuing_authority TEXT DEFAULT 'البلدية (بلدي)',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_certificates_employee ON health_certificates(employee_id);
CREATE INDEX IF NOT EXISTS idx_health_certificates_expiry ON health_certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_health_certificates_status ON health_certificates(status);
