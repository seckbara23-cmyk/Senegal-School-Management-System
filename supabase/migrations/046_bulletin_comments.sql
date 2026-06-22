-- =============================================================================
-- Migration 046: AI-assisted bulletin comments (Phase 2A)
--
-- Stores the SUGGESTED comment separately from the APPROVED comment, with full
-- provenance. The suggestion is generated from the student's real metrics
-- (average, rank, attendance, subject performance, …); a school admin reviews,
-- edits and approves it. Nothing is auto-published — `approved_text` is only set
-- on explicit approval. One row per (student, period, locale) to support future
-- Wolof / English expansion.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bulletin_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id)           ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.students(id)          ON DELETE CASCADE,
  academic_period_id UUID NOT NULL REFERENCES public.academic_periods(id)  ON DELETE CASCADE,
  locale             TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'wo', 'en')),
  template_version   TEXT,
  generated_text     TEXT,
  generated_at       TIMESTAMP WITH TIME ZONE,
  approved_text      TEXT,
  approved_at        TIMESTAMP WITH TIME ZONE,
  approved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT bulletin_comments_unique UNIQUE (student_id, academic_period_id, locale)
);

ALTER TABLE public.bulletin_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bulletin_comments_school_id  ON public.bulletin_comments(school_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_student_id ON public.bulletin_comments(student_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_period_id  ON public.bulletin_comments(academic_period_id);

DROP TRIGGER IF EXISTS trg_bulletin_comments_updated_at ON public.bulletin_comments;
CREATE TRIGGER trg_bulletin_comments_updated_at
  BEFORE UPDATE ON public.bulletin_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Cross-school integrity: the student must live in the same school.
CREATE OR REPLACE FUNCTION public.check_bulletin_comment_school()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = NEW.student_id AND s.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Student % is not in school %', NEW.student_id, NEW.school_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bulletin_comment_school ON public.bulletin_comments;
CREATE TRIGGER trg_bulletin_comment_school
  BEFORE INSERT OR UPDATE ON public.bulletin_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_bulletin_comment_school();

-- ─── RLS: members read, school_admin manage, super_admin manage ────────────────
DROP POLICY IF EXISTS "School members can view bulletin comments" ON public.bulletin_comments;
CREATE POLICY "School members can view bulletin comments" ON public.bulletin_comments
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can manage bulletin comments" ON public.bulletin_comments;
CREATE POLICY "School admins can manage bulletin comments" ON public.bulletin_comments
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all bulletin comments" ON public.bulletin_comments;
CREATE POLICY "Super admin can manage all bulletin comments" ON public.bulletin_comments
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
DROP POLICY IF EXISTS active_school_required_insert ON public.bulletin_comments;
CREATE POLICY active_school_required_insert ON public.bulletin_comments
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.bulletin_comments;
CREATE POLICY active_school_required_update ON public.bulletin_comments
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.bulletin_comments;
CREATE POLICY active_school_required_delete ON public.bulletin_comments
  AS RESTRICTIVE FOR DELETE USING (public.is_school_active(school_id) OR public.is_super_admin());
