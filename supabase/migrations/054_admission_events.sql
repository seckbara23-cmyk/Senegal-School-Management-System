-- =============================================================================
-- Migration 054: Admission events — notes + decision history (Phase 6.1)
--
-- A per-application timeline: submissions, status changes, internal notes,
-- document requests and decisions. `type` is the single extension point for
-- future interviews / entrance exams / scholarships / document verification —
-- no new tables needed for those. `visibility='applicant'` rows are surfaced on
-- the public status-tracking page; 'internal' rows are staff-only.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admission_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.schools(id)                 ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.admission_applications(id)  ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('submitted', 'status_change', 'note', 'documents_requested', 'decision', 'converted', 'interview', 'exam', 'scholarship', 'document_verified')),
  status_from    TEXT,
  status_to      TEXT,
  message        TEXT,
  visibility     TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'applicant')),
  actor_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.admission_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admission_events_school ON public.admission_events(school_id);
CREATE INDEX IF NOT EXISTS idx_admission_events_app    ON public.admission_events(application_id, created_at);

-- Integrity: the application must belong to the same school.
CREATE OR REPLACE FUNCTION public.check_admission_event_school()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admission_applications a WHERE a.id = NEW.application_id AND a.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'application % is not in school %', NEW.application_id, NEW.school_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admission_event_school ON public.admission_events;
CREATE TRIGGER trg_admission_event_school
  BEFORE INSERT ON public.admission_events
  FOR EACH ROW EXECUTE FUNCTION public.check_admission_event_school();

-- RLS: school admins manage, super admin manage. (Public reads go via service role.)
DROP POLICY IF EXISTS "School admins can manage admission events" ON public.admission_events;
CREATE POLICY "School admins can manage admission events" ON public.admission_events
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all admission events" ON public.admission_events;
CREATE POLICY "Super admin can manage all admission events" ON public.admission_events
  FOR ALL USING (public.is_super_admin());

-- RESTRICTIVE active-school write gate.
DROP POLICY IF EXISTS active_school_required_insert ON public.admission_events;
CREATE POLICY active_school_required_insert ON public.admission_events
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
