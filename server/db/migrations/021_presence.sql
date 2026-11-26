-- SQLite twin of server/db/postgres/021_presence.sql.
-- Branch presence: policy, scoped branches, intervals, daily minutes,
-- per-employee schedules, exit windows and the violation approval chain.
-- All timestamps stay TEXT/DATETIME so the same queries run on both engines.

CREATE TABLE IF NOT EXISTS user_access_policy (
  user_id INTEGER PRIMARY KEY,
  policy TEXT NOT NULL DEFAULT 'open',
  ttl_minutes INTEGER NOT NULL DEFAULT 10,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_branch_scope (
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  is_primary INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_user_branch_scope_branch ON user_branch_scope (branch_id);

CREATE TABLE IF NOT EXISTS policy_drift_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  branch_id INTEGER,
  reason TEXT NOT NULL,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by TEXT,
  acknowledged_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_policy_drift_detected ON policy_drift_alerts (detected_at);

CREATE TABLE IF NOT EXISTS presence_intervals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  branch_id INTEGER,
  in_at DATETIME NOT NULL,
  out_at DATETIME,
  source TEXT DEFAULT 'gate',
  closed_reason TEXT,
  permit_nonce TEXT
);
CREATE INDEX IF NOT EXISTS idx_presence_intervals_user_day ON presence_intervals (user_id, in_at);
CREATE INDEX IF NOT EXISTS idx_presence_intervals_open ON presence_intervals (user_id, out_at);

CREATE TABLE IF NOT EXISTS presence_daily (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  inside_minutes INTEGER DEFAULT 0,
  approved_out_minutes INTEGER DEFAULT 0,
  unapproved_out_minutes INTEGER DEFAULT 0,
  deducted_minutes INTEGER DEFAULT 0,
  violations_count INTEGER DEFAULT 0,
  branches_count INTEGER DEFAULT 0,
  first_in DATETIME,
  last_out DATETIME,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_presence_daily_day ON presence_daily (day);

CREATE TABLE IF NOT EXISTS presence_request_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_request_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  interval_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_presence_request_windows_user ON presence_request_windows (user_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS employee_work_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  work_start_time TEXT DEFAULT '08:00',
  work_end_time TEXT DEFAULT '17:00',
  working_days_json TEXT DEFAULT '[1,2,3,4,5]',
  break_minutes INTEGER DEFAULT 0,
  effective_from TEXT,
  effective_to TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employee_work_schedule_employee ON employee_work_schedule (employee_id, effective_from);

CREATE TABLE IF NOT EXISTS attendance_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  branch_id INTEGER,
  interval_id INTEGER,
  request_id INTEGER,
  minutes INTEGER DEFAULT 0,
  value_sar NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'draft',
  decision TEXT,
  decision_percent NUMERIC(5,2),
  supervisor_confirmed_by TEXT,
  supervisor_confirmed_at DATETIME,
  decided_by TEXT,
  decided_at DATETIME,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attendance_violations_day ON attendance_violations (day, status);
CREATE INDEX IF NOT EXISTS idx_attendance_violations_user ON attendance_violations (user_id, day);
