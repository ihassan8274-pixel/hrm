-- Migration 009: country rules
--
-- The per-country overrides of the payroll rules: the insurance rates, the tax
-- brackets, the working week. The countries table holds the scheme of each
-- country; this table holds the values that can be overridden for one country
-- without touching the others.
--
-- The PostgreSQL schema already has this table (server/db/postgres/
-- 001_initial_schema.sql); it is created here as well so the two engines
-- agree on the shape of the data.

CREATE TABLE IF NOT EXISTS country_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code, rule_type, rule_key)
);
