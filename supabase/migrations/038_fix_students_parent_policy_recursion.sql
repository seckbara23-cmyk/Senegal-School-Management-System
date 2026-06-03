-- =============================================================================
-- Migration 038: Fix infinite RLS recursion between students and
--                parent_student_links (Postgres 42P17)
--
-- SYMPTOM (production):
--   action=createStudent → "infinite recursion detected in policy" (42P17).
--   /school/parents also failed. Both paths force evaluation of the SELECT
--   policies on public.students and/or public.parent_student_links.
--
-- ROOT CAUSE — a two-table policy cycle:
--   • public.students  SELECT policy "Parents can view their linked students"
--     (introduced in 019_tighten_rls.sql) ran a RAW subquery over
--     parent_student_links (+ parents). That subquery is itself RLS-protected.
--   • public.parent_student_links SELECT policy "Students can view their own
--     parent links" (003_student_profile_link.sql) runs a RAW subquery over
--     students, which is ALSO RLS-protected.
--
--   So planning any SELECT that touches either table expands:
--     students → (psl policies) → "Students can view their own parent links"
--             → (students policies) → "Parents can view their linked students"
--             → (psl policies) → …  ∞  → 42P17
--
--   createStudent triggers it because INSERT ... RETURNING evaluates the
--   students SELECT policies; /school/parents triggers it via embedded
--   parent_student_links + students reads.
--
-- FIX (mirrors the pattern established in 002_security_fixes.sql):
--   Replace the RAW cross-table subquery in the students policy with a
--   SECURITY DEFINER helper. A definer function runs as its owner and BYPASSES
--   RLS, so the lookup into parent_student_links/parents no longer re-enters
--   their policies — the cycle is broken. We break ONLY this one edge; the
--   parent_student_links "Students can view their own parent links" policy is
--   left untouched (breaking a single edge is sufficient and minimal).
--
--   Access semantics are IDENTICAL: a parent still sees exactly the student
--   rows for children linked to them via parent_student_links → parents where
--   parents.profile_id = auth.uid().
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- ── Definer helper: is the caller a parent of the given student? ─────────────
-- SECURITY DEFINER + a pinned search_path: runs as the function owner, bypasses
-- RLS on parent_student_links and parents (preventing recursive policy
-- evaluation), and avoids search_path injection.
CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_student_links psl
    JOIN public.parents p ON p.id = psl.parent_id
    WHERE psl.student_id = p_student_id
      AND p.profile_id   = auth.uid()
  );
$$;

-- ── Rewrite the recursive students policy to use the helper ──────────────────
-- DROP first for idempotency (PostgreSQL has no CREATE POLICY IF NOT EXISTS).
DROP POLICY IF EXISTS "Parents can view their linked students" ON public.students;

CREATE POLICY "Parents can view their linked students"
  ON public.students FOR SELECT USING (
    public.is_parent_of_student(students.id)
  );
