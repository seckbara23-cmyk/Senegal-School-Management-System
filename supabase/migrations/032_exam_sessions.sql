-- =============================================================================
-- Migration 032: Exam sessions (Phase 38.1)
--
-- Formal examination periods (Test 1, Midterm, Final, Semester Exam, …) scoped
-- to a school + academic year, with a lifecycle: draft → active → completed,
-- and archived as a terminal/hidden state.
--
-- The "no overlapping ACTIVE sessions" rule is enforced in the server action
-- (it depends on the target status), not as a DB constraint.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  starts_on        DATE NOT NULL,
  ends_on          DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT exam_sessions_date_order CHECK (ends_on >= starts_on)
);

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_sessions_school_id        ON public.exam_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_academic_year_id ON public.exam_sessions(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status           ON public.exam_sessions(school_id, status);

-- ─── updated_at trigger (reuses the shared helper from migration 002) ──────────
DROP TRIGGER IF EXISTS trg_exam_sessions_updated_at ON public.exam_sessions;
CREATE TRIGGER trg_exam_sessions_updated_at
  BEFORE UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS: read for school members, manage for school_admin / super_admin ───────
DROP POLICY IF EXISTS "School members can view exam sessions" ON public.exam_sessions;
CREATE POLICY "School members can view exam sessions" ON public.exam_sessions
  FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "School admins can manage exam sessions" ON public.exam_sessions;
CREATE POLICY "School admins can manage exam sessions" ON public.exam_sessions
  FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

DROP POLICY IF EXISTS "Super admin can manage all exam sessions" ON public.exam_sessions;
CREATE POLICY "Super admin can manage all exam sessions" ON public.exam_sessions
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
DROP POLICY IF EXISTS active_school_required_insert ON public.exam_sessions;
CREATE POLICY active_school_required_insert ON public.exam_sessions
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.exam_sessions;
CREATE POLICY active_school_required_update ON public.exam_sessions
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.exam_sessions;
CREATE POLICY active_school_required_delete ON public.exam_sessions
  AS RESTRICTIVE FOR DELETE
  USING (public.is_school_active(school_id) OR public.is_super_admin());
