-- SQLite twin of server/db/postgres/012_signup_requests.sql.
-- The throwaway DB used by the drift gates is built from this folder; production
-- loads the PostgreSQL folder. Keep the two column lists in sync.
CREATE TABLE IF NOT EXISTS signup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  review_note TEXT,
  user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status_created
  ON signup_requests (status, created_at DESC);
