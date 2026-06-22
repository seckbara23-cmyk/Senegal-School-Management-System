-- =============================================================================
-- Migration 055: School admissions config (Phase 6.1)
--
-- Enables a school to open a PUBLIC online application page at /apply/{slug}.
-- Intake is OFF by default; the public route only resolves a school when
-- admissions_enabled = true AND the slug matches.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS admissions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admissions_slug    TEXT,
  ADD COLUMN IF NOT EXISTS admissions_intro   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_admissions_slug ON public.schools(admissions_slug) WHERE admissions_slug IS NOT NULL;
