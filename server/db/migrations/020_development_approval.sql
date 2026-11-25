-- SQLite twin of server/db/postgres/020_development_approval.sql.
--
-- The HR core tables (appraisals, promotions, payroll, eos_calculations) are
-- created by boot-time reconciliation, not by the numbered migrations, so an
-- ALTER here would run before they exist. Their new columns are declared in
-- column-reconciliation.ts instead. Only the brand-new training tables live
-- here; the appraisal link is a plain id for the same reason.

CREATE TABLE IF NOT EXISTS training_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_hours REAL DEFAULT 0,
  target_position TEXT,
  status TEXT DEFAULT 'active',
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  course_id INTEGER,
  appraisal_id INTEGER,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'recommended',
  score REAL,
  completed_at DATETIME,
  certificate_number TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_training_enrollments_employee ON training_enrollments (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_appraisal ON training_enrollments (appraisal_id);
