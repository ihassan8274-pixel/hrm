-- SQLite twin of server/db/postgres/016_expense_claim_review.sql.
-- In this schema family expense_claims is otherwise created by the runtime
-- reconciliation pass, which runs *after* the migration files, so recreate the
-- base table here before adding the review columns.
CREATE TABLE IF NOT EXISTS expense_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  category TEXT,
  amount REAL DEFAULT 0,
  description TEXT,
  claim_date TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
);
ALTER TABLE expense_claims ADD COLUMN reviewed_by TEXT;
ALTER TABLE expense_claims ADD COLUMN reviewed_at DATETIME;
ALTER TABLE expense_claims ADD COLUMN review_note TEXT;
ALTER TABLE expense_claims ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE expense_claims ADD COLUMN paid_at DATETIME;
