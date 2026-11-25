-- SQLite twin of server/db/postgres/015_loan_deduction_schedule.sql.
-- Used by the throwaway drift-test database; production loads the PostgreSQL folder.
ALTER TABLE loans ADD COLUMN deduction_start_month INTEGER;
ALTER TABLE loans ADD COLUMN deduction_start_year INTEGER;
ALTER TABLE loans ADD COLUMN deduction_months INTEGER;
ALTER TABLE loans ADD COLUMN deduction_applied_months INTEGER NOT NULL DEFAULT 0;
