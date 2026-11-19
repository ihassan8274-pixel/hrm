-- Federated identity: Cloudflare Access asserts an email, while payroll accounts
-- are keyed by username. The email column is the mapping between the two; it stays
-- nullable so existing password logins keep working untouched.
ALTER TABLE users ADD COLUMN email TEXT;

-- One account per address, compared case-insensitively. Partial so the many
-- accounts without an address do not collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(lower(email))
  WHERE email IS NOT NULL AND TRIM(email) <> '';