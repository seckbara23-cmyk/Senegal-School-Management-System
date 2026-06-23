-- =============================================================================
-- Migration 059: Platform operations (Phase 9B)
--
-- Derived-first phase: the ONLY new state is the support-ticket CRM (genuinely
-- stateful) plus a single additive schools.is_pilot flag for curated pilot
-- cohorts. Health scores / adoption / monitoring / pilot funnel are all derived
-- on read from existing tables + audit_logs — no tables for those.
--
-- Both support tables are SUPER-ADMIN ONLY (internal ops; never school-facing).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_pilot BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Support tickets (internal ops CRM) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  body        TEXT,
  category    TEXT,
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status      TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_support_tickets_school ON public.support_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "Super admin manage support tickets" ON public.support_tickets;
CREATE POLICY "Super admin manage support tickets" ON public.support_tickets
  FOR ALL USING (public.is_super_admin());

-- ── Support ticket timeline (notes + status/assignment history) ──────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  school_id   UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('created', 'note', 'status_change', 'assignment')),
  message     TEXT,
  status_from TEXT,
  status_to   TEXT,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_support_ticket_events_ticket ON public.support_ticket_events(ticket_id, created_at);

DROP POLICY IF EXISTS "Super admin manage support ticket events" ON public.support_ticket_events;
CREATE POLICY "Super admin manage support ticket events" ON public.support_ticket_events
  FOR ALL USING (public.is_super_admin());
