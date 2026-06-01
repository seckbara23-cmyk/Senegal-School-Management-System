-- =============================================================================
-- Migration 030: Timetable slots (Phase 37.1)
--
-- Foundation for school timetables. One row = one scheduled lesson for a class
-- (a class_subject) on a given weekday and time window, optionally with a
-- teacher and room.
--
-- Cross-row integrity that cannot be a simple CHECK (class_subject belongs to
-- the class, academic_year matches the class's year, teacher belongs to the
-- school / is assigned to the class_subject) is enforced in the server action
-- (Phase 37.1 Part 3) — the same place conflict detection runs. The DB keeps
-- the cheap invariants (time order, weekday range) as CHECKs.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id)  ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES public.classes(id)         ON DELETE CASCADE,
  class_subject_id UUID NOT NULL REFERENCES public.class_subjects(id)  ON DELETE CASCADE,
  teacher_id       UUID REFERENCES public.teachers(id)                 ON DELETE SET NULL,
  day_of_week      INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  room             TEXT,
  notes            TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT timetable_slots_time_order CHECK (end_time > start_time)
);

ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_timetable_slots_school_id        ON public.timetable_slots(school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class_id         ON public.timetable_slots(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher_id       ON public.timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_academic_year_id ON public.timetable_slots(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_day_of_week      ON public.timetable_slots(day_of_week);

-- ─── updated_at trigger (reuses the shared helper from migration 002) ──────────
DROP TRIGGER IF EXISTS trg_timetable_slots_updated_at ON public.timetable_slots;
CREATE TRIGGER trg_timetable_slots_updated_at
  BEFORE UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS: read for school members, manage for school_admin / super_admin ───────
DROP POLICY IF EXISTS "School members can view timetable slots" ON public.timetable_slots;
CREATE POLICY "School members can view timetable slots" ON public.timetable_slots
  FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "School admins can manage timetable slots" ON public.timetable_slots;
CREATE POLICY "School admins can manage timetable slots" ON public.timetable_slots
  FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

DROP POLICY IF EXISTS "Super admin can manage all timetable slots" ON public.timetable_slots;
CREATE POLICY "Super admin can manage all timetable slots" ON public.timetable_slots
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
-- Writes are blocked for suspended/archived schools; SELECT is never gated.
DROP POLICY IF EXISTS active_school_required_insert ON public.timetable_slots;
CREATE POLICY active_school_required_insert ON public.timetable_slots
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.timetable_slots;
CREATE POLICY active_school_required_update ON public.timetable_slots
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.timetable_slots;
CREATE POLICY active_school_required_delete ON public.timetable_slots
  AS RESTRICTIVE FOR DELETE
  USING (public.is_school_active(school_id) OR public.is_super_admin());
