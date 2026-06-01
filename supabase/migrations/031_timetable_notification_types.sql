-- =============================================================================
-- Migration 031: timetable notification types (Phase 37.4)
--
-- Adds the timetable change event types to the notifications.type CHECK
-- (extending migration 028). All previously allowed values are retained.
--
--   timetable_created  — a lesson slot was added
--   timetable_updated  — a lesson slot was changed
--   timetable_deleted  — a lesson slot was removed
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
    -- legacy severities
    'info', 'success', 'warning', 'error', 'system',
    -- Phase 36.1
    'announcement_published',
    'invoice_created',
    'invoice_overdue',
    'attendance_recorded',
    'bulletin_published',
    'assessment_created',
    -- Phase 36.2
    'payment_recorded',
    -- Phase 37.4
    'timetable_created',
    'timetable_updated',
    'timetable_deleted'
  ));
