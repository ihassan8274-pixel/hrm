-- Migration 005: readiness timeline on the 9-box talent matrix.
--
-- The assessment screen collects a readiness value (ready_now / ready_1_year /
-- ready_2_years / future_talent), but the table had no column for it. The write
-- path therefore dropped the value and the screen always fell back to the
-- default, so HR decisions about promotion readiness were never persisted.
--
-- ADD COLUMN IF NOT EXISTS keeps this safe to run against databases that were
-- created from 001_initial_schema.sql after the column was added there.
ALTER TABLE talent_assessments ADD COLUMN IF NOT EXISTS readiness TEXT;
