-- ============================================================================
-- Migration 021: Tighten teacher grade SELECT RLS
--
-- Problem (migration 019): "Teachers can view grades in their school"
--   has_school_role(school_id, ['teacher']) → every teacher in the school
--   can SELECT ALL grade rows, not only rows for their own assessments.
--   Application code enforces per-assessment ownership, but the RLS grant
--   is broader than necessary.
--
-- Fix: Replace the broad teacher grade SELECT with a scoped policy that only
--   allows a teacher to SELECT grades whose assessment belongs to a
--   class_subject assigned to that teacher via teacher_subject_assignments.
--
-- Role coverage after migration:
--   school_admin     → covered by existing "School admins can manage grades"
--                      FOR ALL (unchanged)
--   teacher          → new scoped SELECT below — own assignments only
--   finance_officer  → no grade access (finance does not need grades)
--   parent           → "Parents can view grades for their children" (018)
--   student          → "Students can view their own grades" (018)
--   super_admin      → covered by existing FOR ALL bypass (unchanged)
--
-- Idempotent: DROP POLICY IF EXISTS before every CREATE POLICY.
-- ============================================================================

-- Drop the broad teacher policy added in migration 019
DROP POLICY IF EXISTS "Teachers can view grades in their school" ON public.grades;

-- Drop any previous version of the scoped policy (idempotency)
DROP POLICY IF EXISTS "Teachers can view grades for their assigned assessments"
  ON public.grades;

-- Teachers may SELECT only grades whose assessment is linked to a
-- class_subject they are personally assigned to.
CREATE POLICY "Teachers can view grades for their assigned assessments"
  ON public.grades FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.assessments         a
      JOIN public.teacher_subject_assignments tsa
        ON tsa.class_subject_id = a.class_subject_id
      JOIN public.teachers             t
        ON t.id                 = tsa.teacher_id
      WHERE a.id             = grades.assessment_id
        AND a.school_id      = grades.school_id
        AND tsa.school_id    = grades.school_id
        AND t.profile_id     = auth.uid()
    )
  );

-- ============================================================================
-- Intentionally unchanged:
--   "School admins can manage grades"             FOR ALL — school_admin
--   "Super admin can manage all grades"           FOR ALL — super_admin
--   "Parents can view grades for their children"  SELECT  — migration 018
--   "Students can view their own grades"          SELECT  — migration 018
-- ============================================================================
