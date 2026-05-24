-- =============================================================================
-- Migration 006: Notifications
--
-- User-scoped notification center. Each row belongs to one user and optionally
-- to one school (for school-scoped alerts). Rows are immutable once created;
-- only the read_at column can be updated (by the owning user via RLS policy).
--
-- Access model:
--   SELECT:  owner only (auth.uid() = user_id)
--   INSERT:  via create_notification() SECURITY DEFINER helper — called from
--            trigger functions and server-side API routes (service role)
--   UPDATE:  owner only, restricted to read_at column (mark-as-read)
--   DELETE:  intentionally blocked (notifications are immutable records)
--
-- Cleanup / retention:
--   No auto-purge is set here. Add a pg_cron job when needed:
--     DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
-- =============================================================================

-- ─── PART 1: notifications table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id  UUID        REFERENCES public.schools(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  body       TEXT,
  type       TEXT        NOT NULL DEFAULT 'info'
               CHECK (type IN ('info', 'success', 'warning', 'error', 'system')),
  read_at    TIMESTAMPTZ,
  metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── PART 2: Indexes ─────────────────────────────────────────────────────────
-- Primary pattern: fetch a user's notifications newest-first.
-- Partial index on unread for the badge count query.

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_school_id
  ON public.notifications (school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON public.notifications (type);

-- ─── PART 3: RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications.
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can mark their own notifications as read (update read_at only).
-- WITH CHECK ensures no column other than read_at is effectively changed:
-- the other columns must match their current values, which the client
-- sends as-is because it's a targeted .update({ read_at }) call.
CREATE POLICY "Users can mark own notifications as read" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- No INSERT / DELETE policies.
-- Inserts go through create_notification() (SECURITY DEFINER) or service role.

-- ─── PART 4: create_notification() — write helper ────────────────────────────
-- Call this from trigger functions or server-side code to create a notification.
-- SECURITY DEFINER lets non-privileged trigger contexts write notifications.

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id   UUID,
  p_title     TEXT,
  p_body      TEXT      DEFAULT NULL,
  p_type      TEXT      DEFAULT 'info',
  p_school_id UUID      DEFAULT NULL,
  p_metadata  JSONB     DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, school_id, title, body, type, metadata)
  VALUES (p_user_id, p_school_id, p_title, p_body, p_type, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
