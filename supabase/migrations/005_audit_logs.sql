-- =============================================================================
-- Migration 005: Audit Logs
--
-- Creates a platform-level audit log table for recording administrative and
-- security-relevant actions across all schools.
--
-- Access model:
--   SELECT:  super_admin only (via is_super_admin() RLS policy)
--   INSERT:  via SECURITY DEFINER helper function below — called from
--            trigger functions and application code using the service role
--   UPDATE / DELETE: intentionally blocked for all roles (immutable log)
--
-- Writes:
--   This table starts empty. Populate it by:
--   1. Calling log_audit_event() from AFTER triggers on key tables, OR
--   2. Calling it from server-side API routes using the service role.
--
-- A trigger scaffold is provided at the bottom of this file. Uncomment and
-- adapt each trigger as the corresponding feature is built out.
--
-- Cleanup / retention:
--   Rows are never auto-deleted by this migration. A future pg_cron job can
--   archive or delete rows older than your retention policy:
--     DELETE FROM public.audit_logs WHERE created_at < now() - interval '90 days';
-- =============================================================================

-- ─── PART 1: audit_logs table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email   TEXT,                        -- denormalized: survives actor deletion
  action        TEXT        NOT NULL,        -- 'create' | 'update' | 'delete' | 'login' | 'logout' | ...
  resource_type TEXT,                        -- 'school' | 'profile' | 'membership' | 'student' | ...
  resource_id   TEXT,                        -- UUID or other identifier as text (flexible)
  school_id     UUID        REFERENCES public.schools(id) ON DELETE SET NULL,
  metadata      JSONB,                       -- arbitrary context: old/new values, IP, user agent, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── PART 2: Indexes ─────────────────────────────────────────────────────────
-- Covering the primary query patterns used by the audit logs UI:
--   ORDER BY created_at DESC + optional filters on action / resource_type / actor

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id
  ON public.audit_logs (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type
  ON public.audit_logs (resource_type)
  WHERE resource_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id
  ON public.audit_logs (school_id)
  WHERE school_id IS NOT NULL;

-- ─── PART 3: RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can read all logs.
CREATE POLICY "Super admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_super_admin());

-- No INSERT / UPDATE / DELETE policies.
-- Writes go through log_audit_event() (SECURITY DEFINER) or service role.
-- This ensures no user can write or tamper with audit records directly.

-- ─── PART 4: log_audit_event() — write helper ────────────────────────────────
-- Call this from trigger functions or server-side code to append a log entry.
-- SECURITY DEFINER allows trigger functions (which run as postgres) to write
-- to audit_logs even though the table has no INSERT policy for normal roles.

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id      UUID,
  p_actor_email   TEXT,
  p_action        TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id   TEXT DEFAULT NULL,
  p_school_id     UUID DEFAULT NULL,
  p_metadata      JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id, actor_email, action, resource_type, resource_id, school_id, metadata
  ) VALUES (
    p_actor_id, p_actor_email, p_action, p_resource_type, p_resource_id, p_school_id, p_metadata
  );
END;
$$;

-- =============================================================================
-- PART 5 (Optional): Trigger scaffold — uncomment to auto-log table changes.
--
-- Example: log all INSERT / UPDATE / DELETE on `schools`.
-- Duplicate this pattern for students, school_memberships, teachers, parents.
--
-- CREATE OR REPLACE FUNCTION public.trg_audit_schools()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- BEGIN
--   IF TG_OP = 'INSERT' THEN
--     PERFORM public.log_audit_event(
--       auth.uid(), NULL,
--       'create', 'school', NEW.id::text, NEW.id,
--       jsonb_build_object('new', row_to_json(NEW))
--     );
--   ELSIF TG_OP = 'UPDATE' THEN
--     PERFORM public.log_audit_event(
--       auth.uid(), NULL,
--       'update', 'school', NEW.id::text, NEW.id,
--       jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
--     );
--   ELSIF TG_OP = 'DELETE' THEN
--     PERFORM public.log_audit_event(
--       auth.uid(), NULL,
--       'delete', 'school', OLD.id::text, OLD.id,
--       jsonb_build_object('old', row_to_json(OLD))
--     );
--   END IF;
--   RETURN COALESCE(NEW, OLD);
-- END;
-- $$;
--
-- CREATE TRIGGER trg_schools_audit
--   AFTER INSERT OR UPDATE OR DELETE ON public.schools
--   FOR EACH ROW EXECUTE FUNCTION public.trg_audit_schools();
-- =============================================================================
