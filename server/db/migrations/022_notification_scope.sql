-- SQLite twin of server/db/postgres/022_notification_scope.sql.
ALTER TABLE notifications ADD COLUMN user_id INTEGER;
ALTER TABLE notifications ADD COLUMN employee_id INTEGER;
ALTER TABLE notifications ADD COLUMN branch_id INTEGER;
ALTER TABLE notifications ADD COLUMN entity_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications (employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications (branch_id);
