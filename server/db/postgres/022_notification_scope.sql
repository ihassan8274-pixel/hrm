-- Per-recipient notifications: a notification can be addressed to a user,
-- an employee, a branch or an entity. Rows with no owner stay visible only to
-- administrators; ordinary roles never receive another user's notification.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS employee_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications (employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications (branch_id);
