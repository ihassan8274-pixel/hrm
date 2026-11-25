-- SQLite twin of server/db/postgres/019_end_service.sql.
ALTER TABLE employees ADD COLUMN end_service_date TEXT;
ALTER TABLE employees ADD COLUMN end_service_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees (status);
