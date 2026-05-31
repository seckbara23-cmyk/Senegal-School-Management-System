-- =============================================================================
-- Migration 024: School archival lifecycle
--
-- Extends the EXISTING schools.subscription_status column to support an
-- 'archived' tenant state, used by the super-admin tenant lifecycle controls
-- (Phase 35 Task A). No new status column is introduced — archival reuses the
-- single subscription_status field.
--
-- Lifecycle states:
--   active     — normal operation
--   suspended  — school users blocked from school modules; data intact
--   archived   — read-only historical tenant, hidden from the active list
--   inactive   — pre-existing value, retained for backward compatibility
--
-- Enforcement of the suspended/archived access rules is performed in the
-- application layer (the (app) layout guard); this migration only widens the
-- allowed value set so the status can be persisted.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_subscription_status_check;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_subscription_status_check
  CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'archived'));
