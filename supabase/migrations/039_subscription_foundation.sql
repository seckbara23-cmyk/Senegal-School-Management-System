-- =============================================================================
-- Migration 039: Subscription data model foundation (Phase 50.1)
--
-- Adds the relational SaaS subscription model. FOUNDATION ONLY:
--   • NO billing-provider integration (no Stripe/Paystack/etc.)
--   • NO enforcement is wired into the app yet — the limit helpers exist but
--     nothing calls them. Adding a student/teacher is NOT blocked by this.
--
-- RELATIONSHIP TO EXISTING schools COLUMNS (do not confuse / do not duplicate):
--   • schools.subscription_status  (active|inactive|suspended|archived)
--       → the AUTHORITATIVE ACCESS-CONTROL lifecycle, enforced in the (app)
--         layout guard + RLS. UNCHANGED. Still the source of truth for whether
--         a tenant can use the app.
--   • schools.subscription_plan (starter|standard|premium) + schools.trial_ends_at
--       → legacy descriptive metadata (migration 026), still edited on the
--         super-admin school screen. UNCHANGED. The new tables supersede these
--         going forward; a later phase can retire the inline columns once the
--         UI reads from school_subscriptions.
--   • school_subscriptions.status (trialing|active|past_due|suspended|cancelled)
--       → the COMMERCIAL / BILLING state. Separate concern from the access
--         lifecycle above.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================


-- ─── 1. subscription_plans ───────────────────────────────────────────────────
-- The plan catalogue. Prices are integer FCFA (the app uses whole-FCFA integers
-- everywhere; FCFA has no minor unit). NULL limit = unlimited.
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,          -- machine code, e.g. 'starter'
  name           TEXT NOT NULL,                 -- display name
  monthly_price  INTEGER NOT NULL DEFAULT 0,    -- FCFA / month
  yearly_price   INTEGER NOT NULL DEFAULT 0,    -- FCFA / year
  max_students   INTEGER,                       -- NULL = unlimited
  max_teachers   INTEGER,                       -- NULL = unlimited
  max_storage_mb INTEGER,                       -- NULL = unlimited
  is_active      BOOLEAN NOT NULL DEFAULT true, -- offered to new schools?
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT subscription_plans_prices_nonneg CHECK (monthly_price >= 0 AND yearly_price >= 0)
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Super admins manage the catalogue.
DROP POLICY IF EXISTS "Super admin manages all plans" ON public.subscription_plans;
CREATE POLICY "Super admin manages all plans" ON public.subscription_plans
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Any authenticated school member may read the ACTIVE plan catalogue (to show
-- their plan / available plans). Inactive (grandfathered) plans are read via the
-- SECURITY DEFINER helper get_school_plan() below, so this stays minimal.
DROP POLICY IF EXISTS "Authenticated can view active plans" ON public.subscription_plans;
CREATE POLICY "Authenticated can view active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true);


-- ─── 2. school_subscriptions ─────────────────────────────────────────────────
-- One subscription row per school (1:1). plan_id ON DELETE RESTRICT so a plan in
-- use cannot be deleted; school_id ON DELETE CASCADE so removing a school cleans
-- up its subscription.
CREATE TABLE IF NOT EXISTS public.school_subscriptions (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            UUID NOT NULL UNIQUE REFERENCES public.schools(id)            ON DELETE CASCADE,
  plan_id              UUID NOT NULL        REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status               TEXT NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at        TIMESTAMP WITH TIME ZONE,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end   TIMESTAMP WITH TIME ZONE,
  cancelled_at         TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_subscriptions_plan_id ON public.school_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_school_subscriptions_status  ON public.school_subscriptions(status);

-- Super admins manage every subscription.
DROP POLICY IF EXISTS "Super admin manages all subscriptions" ON public.school_subscriptions;
CREATE POLICY "Super admin manages all subscriptions" ON public.school_subscriptions
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- School admins may READ ONLY their own school's subscription (no writes).
-- has_school_role() is SECURITY DEFINER, so this does not recurse.
DROP POLICY IF EXISTS "School admins can view their school subscription" ON public.school_subscriptions;
CREATE POLICY "School admins can view their school subscription" ON public.school_subscriptions
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin']));


-- ─── 3. Helper functions (SECURITY DEFINER) ──────────────────────────────────
-- All run as the function owner with a pinned search_path: they bypass RLS for
-- reliable cross-table counts and avoid the policy-recursion class of bug (see
-- migration 002 / 038). EXECUTE is granted to PUBLIC by default.

-- get_school_plan(): the plan + billing status for a school's current
-- subscription. Returns no rows if the school has no subscription on file.
CREATE OR REPLACE FUNCTION public.get_school_plan(p_school_id uuid)
RETURNS TABLE (
  plan_id        uuid,
  plan_code      text,
  plan_name      text,
  max_students   integer,
  max_teachers   integer,
  max_storage_mb integer,
  status         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.code, p.name, p.max_students, p.max_teachers, p.max_storage_mb, ss.status
  FROM public.school_subscriptions ss
  JOIN public.subscription_plans   p ON p.id = ss.plan_id
  WHERE ss.school_id = p_school_id
  LIMIT 1;
$$;

-- check_school_student_limit(): TRUE when the school may add another student
-- (active student count < plan.max_students, or the plan is unlimited). Returns
-- TRUE when no subscription/plan is on file — foundation does NOT block.
CREATE OR REPLACE FUNCTION public.check_school_student_limit(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.max_students IS NULL
           OR (SELECT COUNT(*) FROM public.students s
               WHERE s.school_id = p_school_id AND s.status = 'active') < p.max_students
    FROM public.school_subscriptions ss
    JOIN public.subscription_plans   p ON p.id = ss.plan_id
    WHERE ss.school_id = p_school_id
    LIMIT 1
  ), true);
$$;

-- check_school_teacher_limit(): TRUE when the school may add another teacher
-- (active teacher count < plan.max_teachers, or unlimited). TRUE when no
-- subscription/plan on file.
CREATE OR REPLACE FUNCTION public.check_school_teacher_limit(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.max_teachers IS NULL
           OR (SELECT COUNT(*) FROM public.teachers t
               WHERE t.school_id = p_school_id AND t.status = 'active') < p.max_teachers
    FROM public.school_subscriptions ss
    JOIN public.subscription_plans   p ON p.id = ss.plan_id
    WHERE ss.school_id = p_school_id
    LIMIT 1
  ), true);
$$;


-- ─── 4. Seed the default plan catalogue ──────────────────────────────────────
-- Codes mirror the existing schools.subscription_plan values. Prices are
-- editable PLACEHOLDERS (FCFA) — billing is not integrated. ON CONFLICT keeps
-- super-admin edits intact on re-run.
INSERT INTO public.subscription_plans
  (code, name, monthly_price, yearly_price, max_students, max_teachers, max_storage_mb, is_active)
VALUES
  ('starter',  'Starter',   25000,  250000,   200,   20,  1024, true),
  ('standard', 'Standard',  60000,  600000,  1000,   80,  5120, true),
  ('premium',  'Premium',  120000, 1200000,  NULL,  NULL,  NULL, true)
ON CONFLICT (code) DO NOTHING;


-- ─── 5. Backfill one subscription per existing school ────────────────────────
-- Maps each school to the plan matching its legacy schools.subscription_plan
-- (fallback 'starter'). Billing status is derived from the access lifecycle as a
-- best-effort starting point; schools.subscription_status remains authoritative
-- for access. Idempotent via ON CONFLICT (school_id).
INSERT INTO public.school_subscriptions
  (school_id, plan_id, status, trial_ends_at, current_period_start, cancelled_at)
SELECT
  s.id,
  COALESCE(p.id, (SELECT id FROM public.subscription_plans WHERE code = 'starter')),
  CASE s.subscription_status
    WHEN 'suspended' THEN 'suspended'
    WHEN 'archived'  THEN 'cancelled'
    WHEN 'inactive'  THEN 'cancelled'
    ELSE 'active'
  END,
  s.trial_ends_at::timestamptz,
  TIMEZONE('utc'::text, NOW()),
  CASE WHEN s.subscription_status IN ('archived', 'inactive')
       THEN TIMEZONE('utc'::text, NOW()) END
FROM public.schools s
LEFT JOIN public.subscription_plans p ON p.code = s.subscription_plan
ON CONFLICT (school_id) DO NOTHING;
