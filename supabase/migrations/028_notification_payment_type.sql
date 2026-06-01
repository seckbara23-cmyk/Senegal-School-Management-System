-- =============================================================================
-- Migration 028: payment_recorded notification type (Phase 36.2)
--
-- Phase 36.2 wires real school events to in-app notifications. Payments need a
-- dedicated type so the notification center can label "Paiement enregistré"
-- distinctly from invoice creation. This adds 'payment_recorded' to the
-- notifications.type CHECK (extending migration 027); all previously allowed
-- values are retained.
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
    'assessment_created',
    -- Phase 36.2
    'payment_recorded'
  ));
