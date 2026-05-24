-- =============================================================================
-- Migration 003: Student Profile Link
--
-- Problem: The `students` table has no `profile_id` column, unlike `teachers`
-- and `parents` which both do. Without this column there is no way to resolve
-- auth.uid() → a specific student row. The student portal cannot determine
-- which student record belongs to the authenticated user.
--
-- Fix: Add `profile_id` to `students` (nullable, same as teachers/parents).
--      Add index for the portal lookup query.
--      Add RLS policy so a student can see their own parent-guardian links.
--
-- Pre-flight check — no duplicates expected, but verify first:
--   SELECT profile_id, COUNT(*) FROM public.students
--   WHERE profile_id IS NOT NULL
--   GROUP BY profile_id HAVING COUNT(*) > 1;
-- Expected: 0 rows.
--
-- After running: admins must set students.profile_id = <user uuid>
-- for each student who has a platform account. The column is nullable so
-- existing rows are unaffected.
-- =============================================================================

-- ─── PART 1: Add profile_id column ──────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── PART 2: Index for the student portal lookup (profile_id + school_id) ───
-- The portal query filters: WHERE profile_id = auth.uid() AND school_id = ?
-- A composite index on (profile_id, school_id) covers this exactly.

CREATE INDEX IF NOT EXISTS idx_students_profile_id
  ON public.students (profile_id);

CREATE INDEX IF NOT EXISTS idx_students_profile_school
  ON public.students (profile_id, school_id)
  WHERE profile_id IS NOT NULL;

-- ─── PART 3: Unique constraint — one student record per user per school ──────
-- Prevents duplicate (profile_id, school_id) pairs that would cause
-- maybeSingle() in the student portal to throw a "multiple rows" error.
-- PostgreSQL treats multiple NULLs as distinct for UNIQUE constraints,
-- so unlinked students (profile_id = NULL) are unaffected.

ALTER TABLE public.students
  ADD CONSTRAINT students_profile_school_unique
  UNIQUE (profile_id, school_id);

-- ─── PART 4: RLS — students can view their own parent-guardian links ─────────
-- The existing parent_student_links policies (from migration 002) do not
-- allow a student to see their own guardian information. This adds a narrow
-- SELECT-only policy scoped to the authenticated student's own links.
--
-- The EXISTS sub-query resolves: student row WHERE profile_id = auth.uid().
-- It is subject to the existing students RLS ("Users can view students in
-- their schools"), so it only succeeds for active school members — correct.
--
-- DROP first for idempotency — PostgreSQL does not support
-- CREATE POLICY IF NOT EXISTS.

DROP POLICY IF EXISTS "Students can view their own parent links" ON public.parent_student_links;

CREATE POLICY "Students can view their own parent links" ON public.parent_student_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id            = parent_student_links.student_id
        AND s.profile_id    = auth.uid()
    )
  );

-- =============================================================================
-- After running this migration, link student accounts:
--
--   UPDATE public.students
--   SET profile_id = '<user-uuid-from-auth>'
--   WHERE admission_number = '2024001' AND school_id = '<school-uuid>';
--
-- Or in bulk from the admin UI once that is built.
-- =============================================================================
