-- =============================================================================
-- Migration 045: Timetable lifecycle status (Phase 1J)
--
-- One status row per (school, academic year): draft → published → locked.
--   • draft     — work in progress (editable, regenerable, savable)
--   • published — visible/official; still editable
--   • locked    — frozen; the editor save action refuses to write
-- The timetable_slots themselves are unchanged; this only tracks the lifecycle.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.timetable_status (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'locked')),
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT timetable_status_year_unique UNIQUE (school_id, academic_year_id)
);

ALTER TABLE public.timetable_status ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_timetable_status_school_id ON public.timetable_status(school_id);

DROP TRIGGER IF EXISTS trg_timetable_status_updated_at ON public.timetable_status;
CREATE TRIGGER trg_timetable_status_updated_at
  BEFORE UPDATE ON public.timetable_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS: members read, school_admin manage, super_admin manage ────────────────
DROP POLICY IF EXISTS "School members can view timetable status" ON public.timetable_status;
CREATE POLICY "School members can view timetable status" ON public.timetable_status
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can manage timetable status" ON public.timetable_status;
CREATE POLICY "School admins can manage timetable status" ON public.timetable_status
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all timetable status" ON public.timetable_status;
CREATE POLICY "Super admin can manage all timetable status" ON public.timetable_status
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
DROP POLICY IF EXISTS active_school_required_insert ON public.timetable_status;
CREATE POLICY active_school_required_insert ON public.timetable_status
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.timetable_status;
CREATE POLICY active_school_required_update ON public.timetable_status
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.timetable_status;
CREATE POLICY active_school_required_delete ON public.timetable_status
  AS RESTRICTIVE FOR DELETE USING (public.is_school_active(school_id) OR public.is_super_admin());
