-- ============================================================================
-- Migration 020: Teacher portal RLS (Phase 1)
--
-- Two changes:
--
-- 1. Add idx_teachers_profile_id — teacher portal resolves the teacher record
--    via teachers.profile_id = auth.uid(); without an index every portal page
--    scans the teachers table.
--
-- 2. Tighten teacher_subject_assignments SELECT — the broad "School members
--    can view teacher_subject_assignments" policy (migration 016) lets parents
--    and students see every teacher's class assignments.
--    Replace it with a policy that lets each teacher see only their OWN
--    assignments. school_admin is already covered by the existing
--    "School admins can manage teacher_subject_assignments" FOR ALL policy.
--    super_admin is covered by the existing FOR ALL policy.
--
-- Idempotent: every DROP POLICY uses IF EXISTS; every index uses IF NOT EXISTS.
-- Safe to rerun if a previous partial run left some policies already created.
-- ============================================================================

-- ── Performance index: teachers.profile_id ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_teachers_profile_id
  ON public.teachers (profile_id)
  WHERE profile_id IS NOT NULL;

-- ── Tighten teacher_subject_assignments SELECT ────────────────────────────────

DROP POLICY IF EXISTS "School members can view teacher_subject_assignments"
  ON public.teacher_subject_assignments;

-- Teachers see only their own assignments.
-- The sub-query resolves profile_id without exposing teacher_id in any URL/form.
DROP POLICY IF EXISTS "Teachers can view their own subject assignments"
  ON public.teacher_subject_assignments;
CREATE POLICY "Teachers can view their own subject assignments"
  ON public.teacher_subject_assignments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id              = teacher_subject_assignments.teacher_id
        AND t.profile_id      = auth.uid()
    )
  );

-- ============================================================================
-- Intentionally unchanged:
--   "School admins can manage teacher_subject_assignments" FOR ALL — covers
--     school_admin SELECT (includes assignments page at /school/academics/assignments)
--   "Super admin can manage all teacher_subject_assignments" FOR ALL — bypass
--   teachers table policies — left broad; teacher names are low-sensitivity
--   grades / attendance / assessments — already tightened in migration 019
-- ============================================================================
