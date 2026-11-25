-- Server-side idle timeout. The browser reports genuine user input through
-- POST /api/auth/activity; the auth middleware refuses any other request once
-- the session has been idle for IDLE_TIMEOUT_MS and revokes the session row.
-- Legacy rows with NULL fall back to created_at, so an old session cannot stay
-- alive forever after this migration is applied.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_last_activity TIMESTAMPTZ;
