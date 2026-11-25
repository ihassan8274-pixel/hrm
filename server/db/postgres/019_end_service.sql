-- End-of-service state. Payroll generation only pays employees whose status
-- is 'active' (NULL counts as active for legacy rows created before this column
-- existed). The end date and reason keep the decision auditable.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_service_date TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_service_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees (status);
