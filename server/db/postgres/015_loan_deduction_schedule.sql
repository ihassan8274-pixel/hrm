-- Salary-based loan deduction schedule.
-- A loan is deducted from payroll only from `deduction_start_month/year` and
-- only for `deduction_months` periods. Legacy rows keep their old behaviour:
-- a NULL start means "deduct whenever a payroll is generated", a NULL count
-- means "until the balance is zero".
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deduction_start_month INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deduction_start_year INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deduction_months INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deduction_applied_months INTEGER NOT NULL DEFAULT 0;

ALTER TABLE loans ADD CONSTRAINT loans_deduction_start_month_check
  CHECK (deduction_start_month IS NULL OR deduction_start_month BETWEEN 1 AND 12);
ALTER TABLE loans ADD CONSTRAINT loans_deduction_start_year_check
  CHECK (deduction_start_year IS NULL OR deduction_start_year BETWEEN 2000 AND 2100);
ALTER TABLE loans ADD CONSTRAINT loans_deduction_months_check
  CHECK (deduction_months IS NULL OR deduction_months BETWEEN 1 AND 240);
ALTER TABLE loans ADD CONSTRAINT loans_deduction_applied_months_check
  CHECK (deduction_applied_months >= 0);
