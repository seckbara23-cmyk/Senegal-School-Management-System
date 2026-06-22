-- =============================================================================
-- Migration 053: Online admissions — extend admission_applications (Phase 6.1)
--
-- Additive. Widens the status workflow and adds the fields needed for public
-- (no-account) applications: a human reference code + a secret tracking token,
-- a source flag, submission timestamp, previous school, desired level, richer
-- guardian fields, and the converted-parent link. RLS stays admin-only — public
-- access goes exclusively through service-role API routes (Phase 6.2).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- Widen the status set (draft/submitted/accepted/rejected/waitlisted → + 3).
ALTER TABLE public.admission_applications DROP CONSTRAINT IF EXISTS admission_applications_status_check;
ALTER TABLE public.admission_applications ADD CONSTRAINT admission_applications_status_check
  CHECK (status IN ('draft', 'submitted', 'under_review', 'documents_requested', 'accepted', 'rejected', 'waitlisted', 'withdrawn'));

ALTER TABLE public.admission_applications
  ADD COLUMN IF NOT EXISTS reference_code        TEXT,
  ADD COLUMN IF NOT EXISTS source                TEXT NOT NULL DEFAULT 'internal' CHECK (source IN ('internal', 'public')),
  ADD COLUMN IF NOT EXISTS public_token          TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS previous_school       TEXT,
  ADD COLUMN IF NOT EXISTS desired_level         TEXT,
  ADD COLUMN IF NOT EXISTS guardian_relationship TEXT CHECK (guardian_relationship IN ('father', 'mother', 'guardian', 'other')),
  ADD COLUMN IF NOT EXISTS guardian_address      TEXT,
  ADD COLUMN IF NOT EXISTS converted_parent_id   UUID REFERENCES public.parents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_at           TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS decision_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Future-ready (nullable, unused now): online payments, scholarships, waitlist ordering.
  ADD COLUMN IF NOT EXISTS application_fee_invoice_id UUID REFERENCES public.student_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scholarship_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS waitlist_rank         INTEGER;

-- Reference code unique per school; token looked up globally (it is a secret).
CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_reference ON public.admission_applications(school_id, reference_code) WHERE reference_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admissions_token ON public.admission_applications(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admissions_source ON public.admission_applications(school_id, source);
