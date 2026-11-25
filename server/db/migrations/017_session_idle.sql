-- SQLite twin of server/db/postgres/017_session_idle.sql.
ALTER TABLE sessions ADD COLUMN auth_last_activity DATETIME;
