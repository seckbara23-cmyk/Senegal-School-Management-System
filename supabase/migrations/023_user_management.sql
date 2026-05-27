-- =============================================================================
-- Migration 023: User Management Support
-- Adds:
--   1. profiles SELECT policy for school admins to view their school members
--   2. SECURITY DEFINER RPC bridging auth.users.last_sign_in_at safely
--   3. idx_profiles_email for duplicate-email detection during account creation
-- Idempotent: DROP POLICY IF EXISTS before every CREATE POLICY
-- =============================================================================

-- 1. Allow school admins to view profiles of every user who shares their school.
--    Required for /school/users list and detail pages.
--    Uses has_school_role() SECURITY DEFINER helper to avoid recursive RLS on
--    school_memberships (same pattern as migrations 019–022).
DROP POLICY IF EXISTS "School admins can view profiles of their school members"
  ON public.profiles;
CREATE POLICY "School admins can view profiles of their school members"
  ON public.profiles FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships sm
      WHERE sm.user_id  = profiles.id
        AND public.has_school_role(sm.school_id, ARRAY['school_admin'])
    )
  );

-- 2. SECURITY DEFINER function: exposes auth.users.last_sign_in_at to school admins.
--    Runs as the function owner (postgres) so it can read the auth schema.
--    Authorization check: has_school_role() verifies auth.uid() is school_admin in
--    p_school_id before returning any data.
CREATE OR REPLACE FUNCTION public.get_school_member_last_logins(p_school_id UUID)
RETURNS TABLE (user_id UUID, last_sign_in_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (au.id)
    au.id            AS user_id,
    au.last_sign_in_at
  FROM auth.users au
  WHERE au.id IN (
    SELECT sm.user_id
    FROM   public.school_memberships sm
    WHERE  sm.school_id = p_school_id
  )
    AND public.has_school_role(p_school_id, ARRAY['school_admin'])
  ORDER BY au.id
$$;

-- 3. Index for fast email lookup — used during account creation to surface
--    duplicate-email errors before hitting the Auth API.
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
