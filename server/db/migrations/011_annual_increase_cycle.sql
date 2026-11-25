-- SQLite mirror of server/db/postgres/008_annual_increase_cycle.sql.
-- Kept in sync only so schema-drift checks can resolve the new tables/columns.

ALTER TABLE employees ADD COLUMN sponsorship_type TEXT DEFAULT 'company_sponsored';
ALTER TABLE employees ADD COLUMN hire_month INTEGER;
ALTER TABLE employees ADD COLUMN hire_date DATE;

UPDATE employees
SET sponsorship_type = CASE
  WHEN is_saudi = 1 OR nationality = 'سعودي' THEN 'saudi'
  ELSE COALESCE(sponsorship_type, 'company_sponsored')
END
WHERE sponsorship_type IS NULL OR sponsorship_type = '';

CREATE TABLE IF NOT EXISTS annual_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_year INTEGER NOT NULL,
  reviewer_name TEXT,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score_attendance INTEGER NOT NULL DEFAULT 0 CHECK (score_attendance BETWEEN 0 AND 5),
  score_quality INTEGER NOT NULL DEFAULT 0 CHECK (score_quality BETWEEN 0 AND 5),
  score_productivity INTEGER NOT NULL DEFAULT 0 CHECK (score_productivity BETWEEN 0 AND 5),
  score_teamwork INTEGER NOT NULL DEFAULT 0 CHECK (score_teamwork BETWEEN 0 AND 5),
  score_safety INTEGER NOT NULL DEFAULT 0 CHECK (score_safety BETWEEN 0 AND 5),
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 25),
  rating TEXT NOT NULL DEFAULT '',
  note_attendance TEXT,
  note_quality TEXT,
  note_productivity TEXT,
  note_teamwork TEXT,
  note_safety TEXT,
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, cycle_year)
);

CREATE TABLE IF NOT EXISTS annual_increase_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_id INTEGER REFERENCES annual_reviews(id) ON DELETE SET NULL,
  cycle_year INTEGER NOT NULL,
  previous_salary REAL NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  new_salary REAL NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'supervisor', 'manager', 'finance', 'hr', 'approved', 'rejected')),
  current_step INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, cycle_year)
);

CREATE TABLE IF NOT EXISTS annual_increase_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL REFERENCES annual_increase_decisions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  approver_name TEXT,
  approver_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  note TEXT,
  decided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (decision_id, step_index)
);

CREATE TABLE IF NOT EXISTS annual_review_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_year INTEGER NOT NULL,
  notify_date DATE NOT NULL,
  anniversary_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (employee_id, cycle_year)
);

CREATE INDEX IF NOT EXISTS idx_annual_reviews_year ON annual_reviews(cycle_year);
CREATE INDEX IF NOT EXISTS idx_annual_decisions_status ON annual_increase_decisions(status);
CREATE INDEX IF NOT EXISTS idx_annual_reminders_notify ON annual_review_reminders(notify_date);
