-- SQLite twin for the test database; search_path supplies the payroll schema in PostgreSQL.
CREATE TABLE IF NOT EXISTS client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  stack TEXT CHECK (stack IS NULL OR length(stack) <= 4000),
  url TEXT CHECK (url IS NULL OR length(url) <= 300),
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'info')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors (created_at DESC);
