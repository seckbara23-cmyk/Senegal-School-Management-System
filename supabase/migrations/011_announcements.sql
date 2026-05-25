-- ─── Migration 011: announcements table ──────────────────────────────────────
--
-- School-admin-authored announcements that fan out into per-user notifications.
-- The notifications table (migration 006) is used as the delivery inbox;
-- this table is the source of record for the school noticeboard.

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.announcements (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id     UUID REFERENCES public.schools(id)  ON DELETE CASCADE NOT NULL,
  title         TEXT                                                   NOT NULL,
  body          TEXT,
  audience_type TEXT NOT NULL
                  CHECK (audience_type IN ('all_school', 'parents', 'students', 'staff', 'class')),
  class_id      UUID REFERENCES public.classes(id)  ON DELETE SET NULL,
  created_by    UUID REFERENCES auth.users(id)       ON DELETE SET NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_announcements_school_id
  ON public.announcements(school_id);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at
  ON public.announcements(created_at DESC);

-- ─── Trigger ──────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

-- All school members can read their school's announcements
CREATE POLICY "School members can view announcements"
  ON public.announcements FOR SELECT USING (
    public.is_school_member(school_id) OR public.is_super_admin()
  );

-- Active school admins can publish announcements
CREATE POLICY "School admins can create announcements"
  ON public.announcements FOR INSERT WITH CHECK (
    public.has_school_role(school_id, ARRAY['school_admin'])
  );

-- Super admin full access
CREATE POLICY "Super admin can manage all announcements"
  ON public.announcements FOR ALL USING (
    public.is_super_admin()
  );
