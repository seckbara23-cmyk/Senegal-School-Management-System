-- =============================================================================
-- Migration 026: Subscription foundation fields (Phase 35 Task D)
--
-- Adds the two foundation columns the super-admin tenant profile layer needs to
-- record a school's commercial plan and trial window. This is FOUNDATION ONLY —
-- no billing, no SaaS invoicing, no enforcement is introduced here. The fields
-- are descriptive metadata managed by super admins on the school edit screen.
--
--   subscription_plan  TEXT NOT NULL DEFAULT 'starter'
--                      Allowed: 'starter' | 'standard' | 'premium'.
--                      Existing rows backfill to 'starter' via the DEFAULT.
--   trial_ends_at      DATE (nullable) — optional trial expiry date; no
--                      automated action is taken when it passes (yet).
--
-- The lifecycle column subscription_status is UNCHANGED (managed by the
-- suspend/reactivate/archive actions, see migration 024).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; CHECK constraint is DROP-then-ADD.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS trial_ends_at     DATE;

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_subscription_plan_check;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_subscription_plan_check
  CHECK (subscription_plan IN ('starter', 'standard', 'premium'));
