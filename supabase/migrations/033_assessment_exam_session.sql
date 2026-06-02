-- =============================================================================
-- Migration 033: Link assessments to exam sessions (Phase 38.2)
--
-- Adds a nullable exam_session_id to assessments so an exam session can group
-- many assessments across classes/subjects. ON DELETE SET NULL: deleting a
-- session detaches its assessments rather than cascading their grades away.
--
-- Compatibility (session.academic_year_id must match the assessment's
-- class_subject → class academic year, and the session must be draft/active)
-- is enforced in the server action, not at the DB level.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS exam_session_id UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_exam_session_id
  ON public.assessments(exam_session_id)
  WHERE exam_session_id IS NOT NULL;
