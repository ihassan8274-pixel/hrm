-- Saudi identity defaults, applied once.
-- Salary income tax does not exist in KSA; VAT is tracked separately.
-- The marker protects later admin edits to these settings from being clobbered.
INSERT INTO settings (key, value) VALUES
  ('country', 'المملكة العربية السعودية'),
  ('currency', 'SAR'),
  ('tax_rate', '0')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'sa_defaults_v1');

INSERT INTO settings (key, value) VALUES ('sa_defaults_v1', '1')
ON CONFLICT (key) DO NOTHING;
