-- =============================================================================
-- Migration 034: Exam result publications (Phase 38.4)
--
-- Lets a school_admin publish an exam session's results to the parent/student
-- portals, either for the WHOLE session (class_id IS NULL) or for a single
-- class (class_id set). A row's status drives portal visibility:
--   draft       — not visible to parents/students
--   published   — visible to parents/students of the scope
--   unpublished — was published, now retracted (not visible)
--
-- Publish rules (only completed sessions, 100% grade completion required,
-- archived sessions frozen) are enforced in the server action, not the DB.
--
-- Also widens the notifications type CHECK to allow the new event type
-- 'exam_results_published' (see migration 027 for the original set).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exam_result_publications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  exam_session_id UUID NOT NULL REFERENCES public.exam_sessions(id)  ON DELETE CASCADE,
  class_id        UUID          REFERENCES public.classes(id)        ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'unpublished')),
  published_at    TIMESTAMP WITH TIME ZONE,
  published_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.exam_result_publications ENABLE ROW LEVEL SECURITY;

-- ─── Uniqueness ────────────────────────────────────────────────────────────────
-- One row per (school, session, class). class_id NULL = whole-session row.
-- Postgres treats NULLs as distinct in a multi-column UNIQUE, so we split into
-- two partial unique indexes: one for per-class rows, one for the session row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_pub_class
  ON public.exam_result_publications (school_id, exam_session_id, class_id)
  WHERE class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_pub_session
  ON public.exam_result_publications (school_id, exam_session_id)
  WHERE class_id IS NULL;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_pub_school_id        ON public.exam_result_publications(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_pub_exam_session_id  ON public.exam_result_publications(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_exam_pub_status           ON public.exam_result_publications(school_id, status);

-- ─── updated_at trigger (reuses the shared helper from migration 002) ──────────
DROP TRIGGER IF EXISTS trg_exam_result_publications_updated_at ON public.exam_result_publications;
CREATE TRIGGER trg_exam_result_publications_updated_at
  BEFORE UPDATE ON public.exam_result_publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────────
-- Members (incl. parents/students/teachers) may read ONLY published rows; this
-- is the gate that keeps unpublished results off the portals. school_admin and
-- super_admin manage everything (the manage policies also grant them read).
DROP POLICY IF EXISTS "School members can view published exam result publications" ON public.exam_result_publications;
CREATE POLICY "School members can view published exam result publications" ON public.exam_result_publications
  FOR SELECT USING (
    status = 'published' AND public.is_school_member(school_id)
  );

DROP POLICY IF EXISTS "School admins can manage exam result publications" ON public.exam_result_publications;
CREATE POLICY "School admins can manage exam result publications" ON public.exam_result_publications
  FOR ALL USING (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

DROP POLICY IF EXISTS "Super admin can manage all exam result publications" ON public.exam_result_publications;
CREATE POLICY "Super admin can manage all exam result publications" ON public.exam_result_publications
  FOR ALL USING (public.is_super_admin());

-- ─── RESTRICTIVE active-school write gate (consistent with migration 025/032) ──
DROP POLICY IF EXISTS active_school_required_insert ON public.exam_result_publications;
CREATE POLICY active_school_required_insert ON public.exam_result_publications
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_update ON public.exam_result_publications;
CREATE POLICY active_school_required_update ON public.exam_result_publications
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_delete ON public.exam_result_publications;
CREATE POLICY active_school_required_delete ON public.exam_result_publications
  AS RESTRICTIVE FOR DELETE
  USING (public.is_school_active(school_id) OR public.is_super_admin());

-- ─── Widen notifications type CHECK to add the new event type ──────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- legacy severities (kept for backward compatibility)
    'info', 'success', 'warning', 'error', 'system',
    -- semantic event types
    'announcement_published',
    'invoice_created',
    'invoice_overdue',
    'payment_recorded',
    'attendance_recorded',
    'bulletin_published',
    'assessment_created',
    'timetable_created',
    'timetable_updated',
    'timetable_deleted',
    -- Phase 38.4
    'exam_results_published'
  ));
