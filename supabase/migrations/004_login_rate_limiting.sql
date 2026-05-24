-- =============================================================================
-- Migration 004: Login Rate Limiting
--
-- Adds a login_attempts table used exclusively by the server-side
-- /api/auth/login route to enforce brute-force limits.
--
-- Access model:
--   - All reads/writes go through the service role in the API route.
--   - RLS is enabled with zero policies, so anon and authenticated roles
--     have no direct access whatsoever.
--   - Service role bypasses RLS — no policies needed for the API route.
--
-- Limits enforced in application code (route.ts):
--   - 5 failed attempts per email per 15-minute window  → 429
--   - 20 failed attempts per IP per 15-minute window    → 429
--
-- On successful login, failed attempts for that email are deleted so a
-- legitimate user is not permanently locked out after eventually succeeding.
--
-- Cleanup: old rows are not auto-purged by this migration. A future
-- pg_cron job or Supabase scheduled function can run:
--   DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '24 hours';
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  ip           TEXT,                         -- nullable: not always available
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded    BOOLEAN     NOT NULL DEFAULT false
);

-- Partial index for the email-based rate limit query:
--   WHERE email = $1 AND NOT succeeded AND attempted_at >= $2
CREATE INDEX IF NOT EXISTS idx_login_attempts_email
  ON public.login_attempts (email, attempted_at DESC)
  WHERE NOT succeeded;

-- Partial index for the IP-based rate limit query:
--   WHERE ip = $1 AND NOT succeeded AND attempted_at >= $2
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON public.login_attempts (ip, attempted_at DESC)
  WHERE ip IS NOT NULL AND NOT succeeded;

-- Enable RLS. Zero policies = zero direct access for anon/authenticated roles.
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- No manual steps required after running this migration.
-- The API route handles all reads and writes via the service role.
-- =============================================================================
