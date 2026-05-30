-- =============================================================================
-- Migration 024: Teacher-scoped write RLS
-- -----------------------------------------------------------------------------
-- Grants TEACHERS the ability to INSERT/UPDATE (never DELETE) attendance and
-- grading data, but ONLY for the classes / class_subjects they are actually
-- assigned to via teacher_subject_assignments. School-admin, super-admin, and
-- parent/student read policies are left completely untouched — these are
-- additive, permissive policies (RLS policies are OR-ed together).
--
-- Idempotent: helper functions use CREATE OR REPLACE; every policy is dropped
-- with DROP POLICY IF EXISTS before being (re)created; indexes use IF NOT EXISTS.
--
-- Identity chain: auth.uid() == profiles.id == teachers.profile_id.
-- A teacher is "assigned" to a class_subject when a row exists in
-- teacher_subject_assignments linking their (active) teachers row to it.
-- =============================================================================

-- ─── Supporting index ─────────────────────────────────────────────────────────
-- The helper functions filter teachers by profile_id = auth.uid().
CREATE INDEX IF NOT EXISTS idx_teachers_profile_id
  ON public.teachers (profile_id)
  WHERE profile_id IS NOT NULL;

-- =============================================================================
-- PART 1: SECURITY DEFINER helper functions
-- Run as the function owner (postgres), bypassing RLS to avoid recursive policy
-- evaluation and to keep policy expressions readable. search_path is pinned.
-- =============================================================================

-- True when the caller is an ACTIVE teacher assigned to at least one
-- class_subject of the given class.
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_subject_assignments tsa
    JOIN public.teachers      t  ON t.id  = tsa.teacher_id
    JOIN public.class_subjects cs ON cs.id = tsa.class_subject_id
    WHERE t.profile_id = auth.uid()
      AND t.status = 'active'
      AND cs.class_id = p_class_id
  );
$$;

-- True when the caller is an ACTIVE teacher assigned to the given class_subject.
CREATE OR REPLACE FUNCTION public.is_teacher_of_class_subject(p_class_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_subject_assignments tsa
    JOIN public.teachers t ON t.id = tsa.teacher_id
    WHERE t.profile_id = auth.uid()
      AND t.status = 'active'
      AND tsa.class_subject_id = p_class_subject_id
  );
$$;

-- True when the caller may write an attendance record: the record's session is
-- for a class the teacher is assigned to, AND the student is actively enrolled
-- in that same class.
CREATE OR REPLACE FUNCTION public.can_teacher_write_attendance_record(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.attendance_sessions s
    WHERE s.id = p_session_id
      AND public.is_teacher_of_class(s.class_id)
      AND EXISTS (
        SELECT 1
        FROM public.student_class_enrollments e
        WHERE e.student_id = p_student_id
          AND e.class_id   = s.class_id
          AND e.status     = 'active'
      )
  );
$$;

-- True when the caller may write a grade: the grade's assessment belongs to a
-- class_subject assigned to the teacher, AND the student is actively enrolled
-- in that class_subject's class.
CREATE OR REPLACE FUNCTION public.can_teacher_write_grade(
  p_assessment_id uuid,
  p_student_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assessments    a
    JOIN public.class_subjects cs ON cs.id = a.class_subject_id
    WHERE a.id = p_assessment_id
      AND public.is_teacher_of_class_subject(a.class_subject_id)
      AND EXISTS (
        SELECT 1
        FROM public.student_class_enrollments e
        WHERE e.student_id = p_student_id
          AND e.class_id   = cs.class_id
          AND e.status     = 'active'
      )
  );
$$;

-- =============================================================================
-- PART 2: attendance_sessions — teacher INSERT/UPDATE for assigned classes
-- =============================================================================

DROP POLICY IF EXISTS "Teachers can insert attendance sessions for assigned classes" ON public.attendance_sessions;
CREATE POLICY "Teachers can insert attendance sessions for assigned classes"
  ON public.attendance_sessions
  FOR INSERT
  WITH CHECK (public.is_teacher_of_class(class_id));

DROP POLICY IF EXISTS "Teachers can update attendance sessions for assigned classes" ON public.attendance_sessions;
CREATE POLICY "Teachers can update attendance sessions for assigned classes"
  ON public.attendance_sessions
  FOR UPDATE
  USING      (public.is_teacher_of_class(class_id))
  WITH CHECK (public.is_teacher_of_class(class_id));

-- =============================================================================
-- PART 3: attendance_records — teacher INSERT/UPDATE for assigned-class sessions
-- =============================================================================

DROP POLICY IF EXISTS "Teachers can insert attendance records for assigned classes" ON public.attendance_records;
CREATE POLICY "Teachers can insert attendance records for assigned classes"
  ON public.attendance_records
  FOR INSERT
  WITH CHECK (public.can_teacher_write_attendance_record(session_id, student_id));

DROP POLICY IF EXISTS "Teachers can update attendance records for assigned classes" ON public.attendance_records;
CREATE POLICY "Teachers can update attendance records for assigned classes"
  ON public.attendance_records
  FOR UPDATE
  USING      (public.can_teacher_write_attendance_record(session_id, student_id))
  WITH CHECK (public.can_teacher_write_attendance_record(session_id, student_id));

-- =============================================================================
-- PART 4: assessments — teacher INSERT/UPDATE for assigned class_subjects
-- =============================================================================

DROP POLICY IF EXISTS "Teachers can insert assessments for assigned class_subjects" ON public.assessments;
CREATE POLICY "Teachers can insert assessments for assigned class_subjects"
  ON public.assessments
  FOR INSERT
  WITH CHECK (public.is_teacher_of_class_subject(class_subject_id));

DROP POLICY IF EXISTS "Teachers can update assessments for assigned class_subjects" ON public.assessments;
CREATE POLICY "Teachers can update assessments for assigned class_subjects"
  ON public.assessments
  FOR UPDATE
  USING      (public.is_teacher_of_class_subject(class_subject_id))
  WITH CHECK (public.is_teacher_of_class_subject(class_subject_id));

-- =============================================================================
-- PART 5: grades — teacher INSERT/UPDATE for assigned-class_subject assessments
-- =============================================================================

DROP POLICY IF EXISTS "Teachers can insert grades for assigned class_subjects" ON public.grades;
CREATE POLICY "Teachers can insert grades for assigned class_subjects"
  ON public.grades
  FOR INSERT
  WITH CHECK (public.can_teacher_write_grade(assessment_id, student_id));

DROP POLICY IF EXISTS "Teachers can update grades for assigned class_subjects" ON public.grades;
CREATE POLICY "Teachers can update grades for assigned class_subjects"
  ON public.grades
  FOR UPDATE
  USING      (public.can_teacher_write_grade(assessment_id, student_id))
  WITH CHECK (public.can_teacher_write_grade(assessment_id, student_id));

-- =============================================================================
-- Notes
-- • No DELETE policies are granted to teachers (INSERT/UPDATE only, as required).
-- • Existing "School admins can manage ..." and "Super admin can manage all ..."
--   policies are unchanged; this migration only adds teacher policies.
-- • Existing SELECT/view policies (school members, parents, students) are
--   unchanged; teachers already read via "School members can view ..." policies.
-- =============================================================================
