-- =============================================================================
-- Migration 047: Homework module (Phase 3E)
--
-- Read-only homework visibility for parents and students. A teacher posts
-- homework for a class-subject they are assigned to (or a school admin for any);
-- parents see homework for their linked children's classes, students see their
-- own class's homework. No per-student completion tracking in this phase.
--
-- Reuses the existing tenant model (school_id everywhere), the active-school
-- write gate (migration 025) and the notification center (migration 006/027).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.homework (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES public.classes(id)          ON DELETE CASCADE,
  class_subject_id  UUID NOT NULL REFERENCES public.class_subjects(id)   ON DELETE CASCADE,
  teacher_id        UUID REFERENCES public.teachers(id)                  ON DELETE SET NULL,
  academic_year_id  UUID NOT NULL REFERENCES public.academic_years(id)   ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  due_date          DATE,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_homework_school_id        ON public.homework(school_id);
CREATE INDEX IF NOT EXISTS idx_homework_class_id         ON public.homework(class_id);
CREATE INDEX IF NOT EXISTS idx_homework_class_subject_id ON public.homework(class_subject_id);
CREATE INDEX IF NOT EXISTS idx_homework_due_date         ON public.homework(due_date);

DROP TRIGGER IF EXISTS trg_homework_updated_at ON public.homework;
CREATE TRIGGER trg_homework_updated_at
  BEFORE UPDATE ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Integrity: class_subject must belong to the same school and the named class
CREATE OR REPLACE FUNCTION public.check_homework_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.id = NEW.class_subject_id AND cs.school_id = NEW.school_id AND cs.class_id = NEW.class_id
  ) THEN
    RAISE EXCEPTION 'class_subject % does not belong to school % / class %', NEW.class_subject_id, NEW.school_id, NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_homework_integrity ON public.homework;
CREATE TRIGGER trg_homework_integrity
  BEFORE INSERT OR UPDATE ON public.homework
  FOR EACH ROW EXECUTE FUNCTION public.check_homework_integrity();

-- ── Definer helper: is the caller the teacher assigned to this class_subject? ──
-- SECURITY DEFINER bypasses RLS on teacher_subject_assignments/teachers so the
-- policy never re-enters those tables' policies (avoids recursion).
CREATE OR REPLACE FUNCTION public.is_assigned_teacher(p_class_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_subject_assignments tsa
    JOIN public.teachers t ON t.id = tsa.teacher_id
    WHERE tsa.class_subject_id = p_class_subject_id AND t.profile_id = auth.uid()
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Read: any school member (homework is class-level, low sensitivity); the parent
-- and student pages additionally scope to linked children's / own classes.
DROP POLICY IF EXISTS "School members can view homework" ON public.homework;
CREATE POLICY "School members can view homework" ON public.homework
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

-- Manage: school admins (any), assigned teacher (their class-subject), super admin.
DROP POLICY IF EXISTS "School admins can manage homework" ON public.homework;
CREATE POLICY "School admins can manage homework" ON public.homework
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Assigned teachers can manage homework" ON public.homework;
CREATE POLICY "Assigned teachers can manage homework" ON public.homework
  FOR ALL USING (public.is_assigned_teacher(class_subject_id) AND public.is_school_member(school_id))
  WITH CHECK (public.is_assigned_teacher(class_subject_id) AND public.is_school_member(school_id));

DROP POLICY IF EXISTS "Super admin can manage all homework" ON public.homework;
CREATE POLICY "Super admin can manage all homework" ON public.homework
  FOR ALL USING (public.is_super_admin());

-- ── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
DROP POLICY IF EXISTS active_school_required_insert ON public.homework;
CREATE POLICY active_school_required_insert ON public.homework
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.homework;
CREATE POLICY active_school_required_update ON public.homework
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.homework;
CREATE POLICY active_school_required_delete ON public.homework
  AS RESTRICTIVE FOR DELETE USING (public.is_school_active(school_id) OR public.is_super_admin());

-- ── Notification type: homework_assigned ─────────────────────────────────────
-- Re-state the full allowed set (idempotent) so the column accepts the new type
-- alongside every type the app already emits.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'info', 'success', 'warning', 'error', 'system',
  'announcement_published', 'invoice_created', 'invoice_overdue', 'payment_recorded',
  'attendance_recorded', 'bulletin_published', 'assessment_created',
  'timetable_created', 'timetable_updated', 'timetable_deleted', 'exam_results_published',
  'homework_assigned', 'message_received'
));
