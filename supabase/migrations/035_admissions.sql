-- =============================================================================
-- Migration 035: Admissions / applications (Phase 46)
--
-- Tracks prospective students through an admission pipeline before they become
-- enrolled students. One row = one applicant. Status lifecycle:
--   draft → submitted → accepted | rejected | waitlisted
-- An accepted applicant can be CONVERTED into a real students row; the link is
-- recorded in converted_student_id (conversion is a one-way, app-enforced step).
--
-- Applicant PII is admin-only: RLS grants read+write to school_admin and
-- super_admin (no broad member SELECT). Active-school write gate mirrors 025/032.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admission_applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  academic_year_id     UUID REFERENCES public.academic_years(id)          ON DELETE SET NULL,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  gender               TEXT CHECK (gender IN ('male', 'female', 'other')),
  date_of_birth        DATE,
  guardian_name        TEXT,
  guardian_phone       TEXT,
  guardian_email       TEXT,
  desired_class_id     UUID REFERENCES public.classes(id)                 ON DELETE SET NULL,
  documents            TEXT,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'submitted'
                         CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'waitlisted')),
  decision_reason      TEXT,
  converted_student_id UUID REFERENCES public.students(id)                ON DELETE SET NULL,
  created_by           UUID REFERENCES auth.users(id)                     ON DELETE SET NULL,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.admission_applications ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admissions_school_id        ON public.admission_applications(school_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status           ON public.admission_applications(school_id, status);
CREATE INDEX IF NOT EXISTS idx_admissions_academic_year_id ON public.admission_applications(academic_year_id);

-- ─── updated_at trigger (reuses the shared helper from migration 002) ──────────
DROP TRIGGER IF EXISTS trg_admissions_updated_at ON public.admission_applications;
CREATE TRIGGER trg_admissions_updated_at
  BEFORE UPDATE ON public.admission_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS: admin-only (applicant PII). Manage policies also grant read. ─────────
DROP POLICY IF EXISTS "School admins can manage admissions" ON public.admission_applications;
CREATE POLICY "School admins can manage admissions" ON public.admission_applications
  FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

DROP POLICY IF EXISTS "Super admin can manage all admissions" ON public.admission_applications;
CREATE POLICY "Super admin can manage all admissions" ON public.admission_applications
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025/032) ──
DROP POLICY IF EXISTS active_school_required_insert ON public.admission_applications;
CREATE POLICY active_school_required_insert ON public.admission_applications
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.admission_applications;
CREATE POLICY active_school_required_update ON public.admission_applications
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.admission_applications;
CREATE POLICY active_school_required_delete ON public.admission_applications
  AS RESTRICTIVE FOR DELETE
  USING (public.is_school_active(school_id) OR public.is_super_admin());
