-- Migration 005: Advanced HR modules (talent, assets, EWA, workflows, etc.)

-- Talent: 9-box matrix assessments
CREATE TABLE IF NOT EXISTS talent_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  assessor_id INTEGER,
  assessment_date DATE,
  performance_score REAL, -- 1-5
  potential_score REAL, -- 1-5
  box TEXT, -- 'ready_now', 'ready_1_year', 'ready_2_years', 'high_potential', 'core_player', 'development_needed', 'underperformer'
  strengths TEXT,
  development_areas TEXT,
  readiness TEXT, -- 'ready_now', 'ready_1_year', 'ready_2_years', 'future_talent'
  next_review_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Talent: Succession planning
CREATE TABLE IF NOT EXISTS talent_succession (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER,
  candidate_id INTEGER,
  readiness TEXT, -- 'ready_now', 'ready_1_year', 'ready_2_years'
  development_plan TEXT,
  target_date DATE,
  status TEXT DEFAULT 'identified', -- 'identified', 'in_development', 'ready', 'promoted'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (position_id) REFERENCES positions (id),
  FOREIGN KEY (candidate_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Recruitment: Jobs
CREATE TABLE IF NOT EXISTS recruitment_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  department_id INTEGER,
  position_id INTEGER,
  description TEXT,
  requirements TEXT,
  salary_range_min REAL,
  salary_range_max REAL,
  employment_type TEXT DEFAULT 'full_time', -- 'full_time', 'part_time', 'contract'
  location TEXT,
  status TEXT DEFAULT 'open', -- 'open', 'on_hold', 'closed', 'filled'
  posted_by INTEGER,
  posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  FOREIGN KEY (department_id) REFERENCES departments (id),
  FOREIGN KEY (position_id) REFERENCES positions (id)
);

-- Recruitment: Candidates
CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  resume_url TEXT,
  linkedin_url TEXT,
  current_salary REAL,
  expected_salary REAL,
  experience_years REAL,
  skills TEXT, -- JSON array
  status TEXT DEFAULT 'applied', -- 'applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'
  current_stage TEXT,
  notes TEXT,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES recruitment_jobs (id) ON DELETE CASCADE
);

-- Approval workflows
CREATE TABLE IF NOT EXISTS approval_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_type TEXT NOT NULL, -- 'leave_request', 'loan_advance', 'promotion', 'expense_claim', 'ewa_withdrawal', 'hiring_requisition'
  name TEXT, -- nullable, seed uses title
  title TEXT, -- alias for name, for backward compatibility
  name_ar TEXT,
  description TEXT,
  conditions_json TEXT DEFAULT '{}',
  levels_json TEXT NOT NULL,
  entity_id INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities (id)
);

-- Approval workflow steps
CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  approver_role TEXT, -- 'hr_manager', 'finance', 'branch_manager', 'admin'
  approver_user_id INTEGER, -- specific user if role not enough
  condition_formula TEXT, -- e.g., "amount > 50000"
  is_required INTEGER DEFAULT 1,
  timeout_hours INTEGER DEFAULT 48,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES approval_workflows (id) ON DELETE CASCADE
);

-- Workflow requests (instances)
CREATE TABLE IF NOT EXISTS workflow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  requester_id INTEGER NOT NULL,
  request_type TEXT, -- 'leave', 'loan_advance', 'expense', 'transfer', 'promotion', 'purchase'
  request_title TEXT,
  amount REAL,
  details TEXT,
  current_level INTEGER DEFAULT 1,
  max_levels INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
  approval_history_json TEXT, -- JSON array of {level, actor_name, action, action_date, comments}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES approval_workflows (id),
  FOREIGN KEY (requester_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Checklists
CREATE TABLE IF NOT EXISTS checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  template_id INTEGER,
  title TEXT,
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  assigned_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Checklist items
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL,
  item_text TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  completed_by INTEGER,
  completed_at DATETIME,
  sequence INTEGER DEFAULT 0,
  FOREIGN KEY (checklist_id) REFERENCES checklists (id) ON DELETE CASCADE
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  department_id INTEGER,
  manager_id INTEGER,
  start_date DATE,
  end_date DATE,
  budget REAL,
  status TEXT DEFAULT 'planning', -- 'planning', 'active', 'on_hold', 'completed', 'cancelled'
  progress INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments (id),
  FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE SET NULL
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id INTEGER,
  reporter_id INTEGER,
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  status TEXT DEFAULT 'todo', -- 'todo', 'in_progress', 'review', 'done', 'cancelled'
  start_date DATE,
  due_date DATE,
  estimated_hours REAL,
  actual_hours REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES employees (id) ON DELETE SET NULL,
  FOREIGN KEY (reporter_id) REFERENCES employees (id) ON DELETE SET NULL
);

-- Smart assets
CREATE TABLE IF NOT EXISTS smart_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT, -- 'laptop', 'smartphone', 'tablet', 'fuel_card', 'access_key', 'vehicle'
  brand_model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  purchase_value REAL,
  current_assigned_to INTEGER,
  assigned_date DATE,
  handover_qr_code TEXT,
  condition TEXT DEFAULT 'new', -- 'new', 'good', 'worn', 'damaged', 'lost'
  status TEXT DEFAULT 'in_stock', -- 'in_stock', 'assigned', 'maintenance', 'retired', 'lost'
  warranty_expiry DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_assigned_to) REFERENCES employees (id) ON DELETE SET NULL
);

-- Asset assignments history
CREATE TABLE IF NOT EXISTS asset_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  assigned_by INTEGER,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  returned_at DATETIME,
  condition_at_assignment TEXT,
  condition_at_return TEXT,
  notes TEXT,
  FOREIGN KEY (asset_id) REFERENCES smart_assets (id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Rewards & Kudos
CREATE TABLE IF NOT EXISTS rewards_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  category TEXT, -- 'gift_card', 'extra_leave', 'fuel_card', 'wellness', 'tech'
  points_cost INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kudos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_employee_id INTEGER NOT NULL,
  to_employee_id INTEGER NOT NULL,
  type TEXT, -- 'innovation', 'teamwork', 'customer_delight', 'safety_first', 'leadership'
  message TEXT,
  points INTEGER DEFAULT 10,
  is_anonymous INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  FOREIGN KEY (to_employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rewards_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  reward_id INTEGER NOT NULL,
  points_spent INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'delivered', 'cancelled'
  approved_by INTEGER,
  approved_at DATETIME,
  delivered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  FOREIGN KEY (reward_id) REFERENCES rewards_catalog (id)
);

-- Surveys
CREATE TABLE IF NOT EXISTS pulse_surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  questions_json TEXT NOT NULL, -- JSON array of {id, question, type, options}
  target_department_id INTEGER,
  target_all INTEGER DEFAULT 1,
  anonymous INTEGER DEFAULT 1,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'draft', -- 'draft', 'active', 'closed'
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_department_id) REFERENCES departments (id)
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  employee_id INTEGER,
  answers_json TEXT NOT NULL, -- JSON {question_id: answer}
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES pulse_surveys (id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts_expiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  alert_type TEXT, -- 'iqama', 'passport', 'health_cert', 'medical_insurance', 'job_mismatch', 'lateness'
  entity_value TEXT, -- expiry date or mismatch detail
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'critical'
  days_until_expiry INTEGER,
  is_read INTEGER DEFAULT 0,
  is_dismissed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Overtime
CREATE TABLE IF NOT EXISTS overtime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date DATE NOT NULL,
  hours REAL NOT NULL,
  rate_multiplier REAL DEFAULT 1.5,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  approved_by INTEGER,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- Flexible work / Telework
CREATE TABLE IF NOT EXISTS flexible_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  shift_type TEXT, -- 'full_remote', 'hybrid', 'compressed', 'flexible_hours'
  days_per_week INTEGER,
  remote_days_per_week INTEGER,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active', -- 'active', 'ended', 'cancelled'
  approved_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telework_permits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  permit_date DATE NOT NULL,
  location TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  approved_by INTEGER,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);

-- EWA (Earned Wage Access) - already in 003 but adding indexes here
CREATE INDEX IF NOT EXISTS idx_ewa_emp ON ewa_withdrawals(employee_id);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_talent_assessments_emp ON talent_assessments(employee_id);
CREATE INDEX IF NOT EXISTS idx_succession_candidate ON talent_succession(candidate_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_dept ON recruitment_jobs(department_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_job ON recruitment_candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_requester ON workflow_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_status ON workflow_requests(status);
CREATE INDEX IF NOT EXISTS idx_checklists_emp ON checklists(employee_id);
CREATE INDEX IF NOT EXISTS idx_projects_dept ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_smart_assets_assigned ON smart_assets(current_assigned_to);
CREATE INDEX IF NOT EXISTS idx_kudos_from ON kudos(from_employee_id);
CREATE INDEX IF NOT EXISTS idx_kudos_to ON kudos(to_employee_id);
CREATE INDEX IF NOT EXISTS idx_rewards_emp ON rewards_redemptions(employee_id);
CREATE INDEX IF NOT EXISTS idx_surveys_status ON pulse_surveys(status);
CREATE INDEX IF NOT EXISTS idx_alerts_emp ON alerts_expiries(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_emp ON overtime(employee_id);
CREATE INDEX IF NOT EXISTS idx_telework_emp ON telework_permits(employee_id);