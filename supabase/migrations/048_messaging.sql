-- =============================================================================
-- Migration 048: Parent-teacher messaging (Phase 3G)
--
-- Child-scoped 1:1 conversations between a parent and a teacher. Either side may
-- start a thread; the other replies. School admins can read threads in their
-- school for moderation. Text only — no attachments, no email/SMS/WhatsApp.
-- Every send is audited at the application layer.
--
-- Tenant-isolated (school_id everywhere). Participant checks use SECURITY DEFINER
-- helpers keyed on the IDs already stored in the thread row, so policies never
-- re-enter parents/teachers/threads policies (no 42P17 recursion).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- ── Tables ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id)   ON DELETE CASCADE,
  parent_id       UUID NOT NULL REFERENCES public.parents(id)   ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES public.teachers(id)  ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  subject         TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT message_threads_unique UNIQUE (parent_id, teacher_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  thread_id          UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_role        TEXT NOT NULL CHECK (sender_role IN ('parent', 'teacher', 'school_admin')),
  sender_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body               TEXT NOT NULL,
  read_by_parent_at  TIMESTAMP WITH TIME ZONE,
  read_by_teacher_at TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_msg_threads_school  ON public.message_threads(school_id);
CREATE INDEX IF NOT EXISTS idx_msg_threads_parent  ON public.message_threads(parent_id);
CREATE INDEX IF NOT EXISTS idx_msg_threads_teacher ON public.message_threads(teacher_id);
CREATE INDEX IF NOT EXISTS idx_msg_threads_last    ON public.message_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread     ON public.messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_school     ON public.messages(school_id);

DROP TRIGGER IF EXISTS trg_msg_threads_updated_at ON public.message_threads;
CREATE TRIGGER trg_msg_threads_updated_at
  BEFORE UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Definer participant helpers (keyed on IDs already in the thread row) ──────
CREATE OR REPLACE FUNCTION public.is_parent_record(p_parent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.parents p WHERE p.id = p_parent_id AND p.profile_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.is_teacher_record(p_teacher_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = p_teacher_id AND t.profile_id = auth.uid()); $$;

-- Is the caller a participant (or moderating admin) of the given thread?
CREATE OR REPLACE FUNCTION public.is_thread_participant(p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = p_thread_id AND (
      public.is_parent_record(t.parent_id)
      OR public.is_teacher_record(t.teacher_id)
      OR public.has_school_role(t.school_id, ARRAY['school_admin'])
      OR public.is_super_admin()
    )
  );
$$;

-- ── RLS: message_threads ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants can view threads" ON public.message_threads;
CREATE POLICY "Participants can view threads" ON public.message_threads
  FOR SELECT USING (
    public.is_parent_record(parent_id) OR public.is_teacher_record(teacher_id)
    OR public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Participants can start threads" ON public.message_threads;
CREATE POLICY "Participants can start threads" ON public.message_threads
  FOR INSERT WITH CHECK (
    public.is_parent_record(parent_id) OR public.is_teacher_record(teacher_id)
    OR public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Participants can update threads" ON public.message_threads;
CREATE POLICY "Participants can update threads" ON public.message_threads
  FOR UPDATE USING (
    public.is_parent_record(parent_id) OR public.is_teacher_record(teacher_id)
    OR public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin()
  ) WITH CHECK (
    public.is_parent_record(parent_id) OR public.is_teacher_record(teacher_id)
    OR public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin()
  );

-- ── RLS: messages ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
CREATE POLICY "Participants can view messages" ON public.messages
  FOR SELECT USING (public.is_thread_participant(thread_id));

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages" ON public.messages
  FOR INSERT WITH CHECK (public.is_thread_participant(thread_id) AND sender_user_id = auth.uid());

DROP POLICY IF EXISTS "Participants can update message read state" ON public.messages;
CREATE POLICY "Participants can update message read state" ON public.messages
  FOR UPDATE USING (public.is_thread_participant(thread_id)) WITH CHECK (public.is_thread_participant(thread_id));

-- ── RESTRICTIVE active-school write gate (consistent with migration 025) ──────
DROP POLICY IF EXISTS active_school_required_insert ON public.message_threads;
CREATE POLICY active_school_required_insert ON public.message_threads
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_update ON public.message_threads;
CREATE POLICY active_school_required_update ON public.message_threads
  AS RESTRICTIVE FOR UPDATE USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_insert ON public.messages;
CREATE POLICY active_school_required_insert ON public.messages
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_update ON public.messages;
CREATE POLICY active_school_required_update ON public.messages
  AS RESTRICTIVE FOR UPDATE USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
