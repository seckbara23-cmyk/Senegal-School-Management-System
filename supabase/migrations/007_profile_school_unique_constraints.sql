-- =============================================================================
-- Migration 007: UNIQUE(profile_id, school_id) on parents and teachers
--
-- Problem: Migration 003 added this constraint to `students` but `parents` and
-- `teachers` were missed. Without it, a double-insert can create two rows for
-- the same user in the same school, causing maybeSingle() in the portals to
-- throw a "multiple rows returned" error.
--
-- Fix: Add the UNIQUE constraint to both tables. NULLs are always treated as
-- distinct by PostgreSQL UNIQUE constraints, so rows with profile_id = NULL
-- are unaffected.
--
-- Pre-flight: verify no duplicates exist before adding the constraints.
-- Expected: 0 rows for both queries.
-- =============================================================================

-- ─── Pre-flight duplicate check for parents ──────────────────────────────────
-- SELECT profile_id, school_id, COUNT(*)
-- FROM public.parents
-- WHERE profile_id IS NOT NULL
-- GROUP BY profile_id, school_id
-- HAVING COUNT(*) > 1;

-- ─── Pre-flight duplicate check for teachers ─────────────────────────────────
-- SELECT profile_id, school_id, COUNT(*)
-- FROM public.teachers
-- WHERE profile_id IS NOT NULL
-- GROUP BY profile_id, school_id
-- HAVING COUNT(*) > 1;

-- ─── PART 1: parents ─────────────────────────────────────────────────────────

ALTER TABLE public.parents
  ADD CONSTRAINT parents_profile_school_unique
  UNIQUE (profile_id, school_id);

-- ─── PART 2: teachers ────────────────────────────────────────────────────────

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_profile_school_unique
  UNIQUE (profile_id, school_id);
