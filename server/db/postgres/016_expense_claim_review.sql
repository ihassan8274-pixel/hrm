-- Expense claims have a workflow status but no reviewer trail and no payment
-- state. Approved claims are reimbursed outside payroll (they are not taxable
-- salary), so the ledger needs to record who decided, when, and whether the
-- reimbursement was actually paid.
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_status_check
  CHECK (status IS NULL OR status IN ('pending', 'approved', 'rejected'));
ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid'));
