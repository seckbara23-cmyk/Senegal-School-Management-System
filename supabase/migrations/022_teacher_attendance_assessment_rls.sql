-- ============================================================================
-- Migration 022: Teacher INSERT/UPDATE/DELETE RLS for attendance and assessments
--
-- Phase 2 enables teachers to perform their own daily academic workflows:
--   1. Create attendance sessions for their assigned classes
--   2. Create assessments for their assigned class_subjects
--   3. Insert/update/delete grades (previously blocked — saveTeacherGrades
--      from Phase 1 would have failed at runtime without these policies)
--
-- Scope rules for every policy:
--   teacher → only rows whose class / class_subject / assessment is linked
--             to that teacher via teacher_subject_assignments → teachers.profile_id
--   school_admin → covered by existing FOR ALL manage policies (unchanged)
--   super_admin  → covered by existing FOR ALL bypass (unchanged)
--
-- Idempotent: every DROP POLICY IF EXISTS precedes its CREATE POLICY.
-- ============================================================================

-- ============================================================================
-- 1. attendance_sessions
-- ============================================================================
-- Teachers may INSERT sessions only for classes they are assigned to.
-- They may DELETE sessions they personally created (for cleanup on error).
-- They may NOT UPDATE sessions (date/class cannot be changed after creation).
-- ============================================================================

DROP POLICY IF EXISTS "Teachers can insert attendance sessions for assigned classes"
  ON public.attendance_sessions;
CREATE POLICY "Teachers can insert attendance sessions for assigned classes"
  ON public.attendance_sessions FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.class_subjects              cs
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = cs.id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE cs.class_id    = attendance_sessions.class_id
        AND cs.school_id   = attendance_sessions.school_id
        AND tsa.school_id  = attendance_sessions.school_id
        AND t.profile_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can delete attendance sessions they created"
  ON public.attendance_sessions;
CREATE POLICY "Teachers can delete attendance sessions they created"
  ON public.attendance_sessions FOR DELETE USING (
    attendance_sessions.created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.class_subjects              cs
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = cs.id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE cs.class_id    = attendance_sessions.class_id
        AND cs.school_id   = attendance_sessions.school_id
        AND tsa.school_id  = attendance_sessions.school_id
        AND t.profile_id   = auth.uid()
    )
  );

-- ============================================================================
-- 2. attendance_records
-- ============================================================================
-- Teachers may INSERT records for sessions belonging to their assigned classes.
-- They may NOT UPDATE records after creation (keeps a clean audit trail for
-- Phase 2; correction workflows belong in Phase 3).
-- ============================================================================

DROP POLICY IF EXISTS "Teachers can insert attendance records for assigned classes"
  ON public.attendance_records;
CREATE POLICY "Teachers can insert attendance records for assigned classes"
  ON public.attendance_records FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.attendance_sessions         s
      JOIN public.class_subjects              cs  ON cs.class_id          = s.class_id
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = cs.id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE s.id          = attendance_records.session_id
        AND s.school_id   = attendance_records.school_id
        AND cs.school_id  = attendance_records.school_id
        AND tsa.school_id = attendance_records.school_id
        AND t.profile_id  = auth.uid()
    )
  );

-- ============================================================================
-- 3. assessments
-- ============================================================================
-- Teachers may INSERT assessments only for class_subjects they are assigned to.
-- They may NOT UPDATE or DELETE assessments (admin retains that authority;
-- teacher assessment editing belongs in Phase 3 once deletion policy is clear).
-- ============================================================================

DROP POLICY IF EXISTS "Teachers can insert assessments for their assigned class subjects"
  ON public.assessments;
CREATE POLICY "Teachers can insert assessments for their assigned class subjects"
  ON public.assessments FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.teacher_subject_assignments tsa
      JOIN public.teachers                    t   ON t.id = tsa.teacher_id
      WHERE tsa.class_subject_id = assessments.class_subject_id
        AND tsa.school_id        = assessments.school_id
        AND t.profile_id         = auth.uid()
    )
  );

-- ============================================================================
-- 4. grades
-- ============================================================================
-- Teachers may INSERT / UPDATE / DELETE grades only for assessments linked to
-- their assigned class_subjects.  All three operations are required because
-- saveTeacherGrades uses upsert (INSERT + UPDATE on conflict) and DELETE
-- (to clear grades when the score field is left blank).
-- ============================================================================

DROP POLICY IF EXISTS "Teachers can insert grades for their assigned assessments"
  ON public.grades;
CREATE POLICY "Teachers can insert grades for their assigned assessments"
  ON public.grades FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.assessments                 a
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = a.class_subject_id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE a.id          = grades.assessment_id
        AND a.school_id   = grades.school_id
        AND tsa.school_id = grades.school_id
        AND t.profile_id  = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can update grades for their assigned assessments"
  ON public.grades;
CREATE POLICY "Teachers can update grades for their assigned assessments"
  ON public.grades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.assessments                 a
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = a.class_subject_id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE a.id          = grades.assessment_id
        AND a.school_id   = grades.school_id
        AND tsa.school_id = grades.school_id
        AND t.profile_id  = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.assessments                 a
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = a.class_subject_id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE a.id          = grades.assessment_id
        AND a.school_id   = grades.school_id
        AND tsa.school_id = grades.school_id
        AND t.profile_id  = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can delete grades for their assigned assessments"
  ON public.grades;
CREATE POLICY "Teachers can delete grades for their assigned assessments"
  ON public.grades FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.assessments                 a
      JOIN public.teacher_subject_assignments tsa ON tsa.class_subject_id = a.class_subject_id
      JOIN public.teachers                    t   ON t.id                  = tsa.teacher_id
      WHERE a.id          = grades.assessment_id
        AND a.school_id   = grades.school_id
        AND tsa.school_id = grades.school_id
        AND t.profile_id  = auth.uid()
    )
  );

-- ============================================================================
-- Intentionally unchanged:
--   attendance_sessions  "School admins can manage …" FOR ALL
--   attendance_records   "School admins can manage …" FOR ALL
--   assessments          "School admins can manage …" FOR ALL
--   grades               "School admins can manage …" FOR ALL
--   All super_admin FOR ALL bypass policies
--   All parent / student portal SELECT policies (018 / 019 / 021)
-- ============================================================================
