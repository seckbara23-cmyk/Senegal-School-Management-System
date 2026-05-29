-- ============================================================================
-- Grant an active school_admin membership to a user (data fix / seed)
-- ----------------------------------------------------------------------------
-- WHY:
--   Every /school/* page requires an ACTIVE school_admin membership:
--       school_memberships.role = 'school_admin' AND status = 'active'
--   A user without one is redirected to /dashboard. A super_admin who has no
--   such membership therefore cannot open any /school/* page.
--
-- WHAT THIS DOES (idempotent — safe to run repeatedly):
--   1. Finds the auth user by email.
--   2. Reuses a school this user already administers (any status); otherwise
--      finds or creates a single demo school (by unique slug).
--   3. Ensures a profiles row exists WITHOUT changing global_role
--      (super_admin access is preserved).
--   4. Inserts — or reactivates — the school_admin membership as 'active'.
--
-- It NEVER deletes anything and NEVER downgrades global_role.
-- ============================================================================

DO $$
DECLARE
  -- 👇 Change this if you need to fix a different account.
  v_email     text := 'seckbara23@gmail.com';
  v_user_id   uuid;
  v_school_id uuid;
BEGIN
  -- 1. Resolve the auth user by email (case-insensitive).
  SELECT id
    INTO v_user_id
    FROM auth.users
   WHERE lower(email) = lower(v_email)
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth user found for email %. Sign up/log in once first.', v_email;
  END IF;

  -- 2. Prefer a school this user already administers (active OR inactive), so
  --    we reactivate an existing membership rather than create a duplicate.
  SELECT sm.school_id
    INTO v_school_id
    FROM public.school_memberships sm
   WHERE sm.user_id = v_user_id
     AND sm.role    = 'school_admin'
   ORDER BY sm.created_at ASC
   LIMIT 1;

  -- 2b. No existing school_admin membership → find or create one demo school.
  IF v_school_id IS NULL THEN
    SELECT id INTO v_school_id
      FROM public.schools
     WHERE slug = 'ecole-demo'
     LIMIT 1;

    IF v_school_id IS NULL THEN
      INSERT INTO public.schools (name, slug, subscription_status)
      VALUES ('École Démo', 'ecole-demo', 'active')
      RETURNING id INTO v_school_id;
      RAISE NOTICE 'Created demo school % (slug: ecole-demo)', v_school_id;
    END IF;
  END IF;

  -- 3. Ensure a profiles row exists. DO NOTHING on conflict so an existing
  --    global_role (e.g. super_admin) is never overwritten or removed.
  INSERT INTO public.profiles (id, email)
  VALUES (v_user_id, v_email)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Insert or reactivate the school_admin membership (idempotent upsert on
  --    the UNIQUE (user_id, school_id, role) constraint).
  INSERT INTO public.school_memberships (user_id, school_id, role, status)
  VALUES (v_user_id, v_school_id, 'school_admin', 'active')
  ON CONFLICT (user_id, school_id, role)
  DO UPDATE SET status = 'active', updated_at = now();

  RAISE NOTICE 'OK: user % now has active school_admin on school %', v_user_id, v_school_id;
END $$;

-- ============================================================================
-- Verification (read-only) — should return exactly one row, status = active.
-- ============================================================================
SELECT
  u.email,
  p.global_role,
  s.name        AS school_name,
  s.slug        AS school_slug,
  sm.role,
  sm.status
FROM auth.users u
LEFT JOIN public.profiles           p  ON p.id = u.id
LEFT JOIN public.school_memberships sm ON sm.user_id = u.id AND sm.role = 'school_admin'
LEFT JOIN public.schools            s  ON s.id = sm.school_id
WHERE lower(u.email) = lower('seckbara23@gmail.com');
