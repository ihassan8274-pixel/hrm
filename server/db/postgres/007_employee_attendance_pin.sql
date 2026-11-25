-- Per-employee kiosk PIN: fallback identity proof for phones without WebAuthn.
-- Stored as text so leading zeroes are preserved. Never returned by read routes.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_pin TEXT;
