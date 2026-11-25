-- Kiosk PIN fallback identity proof for employees without WebAuthn.
ALTER TABLE employees ADD COLUMN attendance_pin TEXT;
