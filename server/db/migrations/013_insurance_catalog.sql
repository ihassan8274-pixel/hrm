-- SQLite twin of server/db/postgres/013_insurance_catalog.sql.
-- The throwaway DB used by the drift gates is built from this folder; production
-- loads the PostgreSQL folder. Keep the two column lists in sync.
CREATE TABLE IF NOT EXISTS insurance_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insurance_coverage_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label_ar TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO insurance_companies (name, is_active) VALUES
  ('التعاونية للتأمين', 1),
  ('بوبا العربية', 1),
  ('ميدغلف', 1),
  ('تكافل الراجحي', 1),
  ('سلامة للتأمين', 1),
  ('الدرع العربي', 1)
ON CONFLICT (name) DO NOTHING;

INSERT INTO insurance_coverage_categories (code, label_ar, is_active) VALUES
  ('VIP', 'كبار الشخصيات', 1),
  ('Class A', 'فئة A', 1),
  ('Class B', 'فئة B', 1),
  ('Class C', 'فئة C', 1),
  ('Class D', 'فئة D - عمالة', 1)
ON CONFLICT (code) DO NOTHING;
