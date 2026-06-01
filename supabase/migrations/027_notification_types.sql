-- =============================================================================
-- Migration 027: Notification event types (Phase 36.1)
--
-- The notifications.type column (migration 006) was constrained to a small set
-- of severity values (info/success/warning/error/system). Phase 36.1 introduces
-- semantic EVENT types so the notification center can label and route each
-- notification by what produced it. This widens the CHECK to allow the new
-- event types while retaining the legacy severity values for backward
-- compatibility (existing rows and the create_notification() default 'info').
--
-- New event types:
--   announcement_published   — a school announcement was published
--   invoice_created          — a fee invoice was issued to a student
--   invoice_overdue          — an invoice passed its due date unpaid
--   attendance_recorded      — attendance was recorded for a student
--   bulletin_published       — a report card / bulletin was published
--   assessment_created       — a new assessment was created
--
-- Event-specific context (e.g. invoice_id, announcement_id) is stored in the
-- existing notifications.metadata JSONB column — no new column is needed.
--
-- IDEMPOTENT: the CHECK constraint is DROP-then-ADD.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- legacy severities (kept for backward compatibility)
    'info', 'success', 'warning', 'error', 'system',
    -- semantic event types (Phase 36.1)
    'announcement_published',
    'invoice_created',
    'invoice_overdue',
    'attendance_recorded',
    'bulletin_published',
    'assessment_created'
  ));
