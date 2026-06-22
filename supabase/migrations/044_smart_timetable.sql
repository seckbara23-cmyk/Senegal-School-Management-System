-- =============================================================================
-- Migration 044: Smart timetable foundations (Phase 1A–1B)
--
--   • class_subjects.hours_per_week — how many periods/week the generator should
--     schedule for each class-subject (default 1).
--   • teacher_availability — weekly time windows during which a teacher can
--     teach. A teacher with NO rows is treated by the generator as available
--     everywhere; rows RESTRICT availability to those windows.
--
-- No automatic timetable writes happen here — this only adds the inputs the
-- generator reads. Tenant-isolated via RLS + the active-school write gate.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- ─── class_subjects.hours_per_week ─────────────────────────────────────────────
ALTER TABLE public.class_subjects
  ADD COLUMN IF NOT EXISTS hours_per_week INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.class_subjects DROP CONSTRAINT IF EXISTS class_subjects_hours_check;
ALTER TABLE public.class_subjects
  ADD CONSTRAINT class_subjects_hours_check CHECK (hours_per_week >= 0 AND hours_per_week <= 40);

-- ─── teacher_availability ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT teacher_availability_time_order CHECK (end_time > start_time)
);

ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_teacher_availability_school_id  ON public.teacher_availability(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher_id ON public.teacher_availability(teacher_id);

DROP TRIGGER IF EXISTS trg_teacher_availability_updated_at ON public.teacher_availability;
CREATE TRIGGER trg_teacher_availability_updated_at
  BEFORE UPDATE ON public.teacher_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Cross-school integrity: the teacher must live in the same school (mirrors the
-- transport ref triggers). SECURITY DEFINER so the lookup bypasses RLS.
CREATE OR REPLACE FUNCTION public.check_teacher_availability_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teachers t WHERE t.id = NEW.teacher_id AND t.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Teacher % is not in school %', NEW.teacher_id, NEW.school_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_availability_school ON public.teacher_availability;
CREATE TRIGGER trg_teacher_availability_school
  BEFORE INSERT OR UPDATE ON public.teacher_availability
  FOR EACH ROW EXECUTE FUNCTION public.check_teacher_availability_school();

-- ─── RLS: members read, school_admin manage, super_admin manage ────────────────
DROP POLICY IF EXISTS "School members can view teacher availability" ON public.teacher_availability;
CREATE POLICY "School members can view teacher availability" ON public.teacher_availability
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can manage teacher availability" ON public.teacher_availability;
CREATE POLICY "School admins can manage teacher availability" ON public.teacher_availability
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all teacher availability" ON public.teacher_availability;
CREATE POLICY "Super admin can manage all teacher availability" ON public.teacher_availability
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
DROP POLICY IF EXISTS active_school_required_insert ON public.teacher_availability;
CREATE POLICY active_school_required_insert ON public.teacher_availability
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.teacher_availability;
CREATE POLICY active_school_required_update ON public.teacher_availability
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.teacher_availability;
CREATE POLICY active_school_required_delete ON public.teacher_availability
  AS RESTRICTIVE FOR DELETE USING (public.is_school_active(school_id) OR public.is_super_admin());
