-- =============================================================================
-- Migration 051: Payment reminder framework (Phase 4.5)
--
-- A log of payment reminders sent for an invoice (and optionally a specific
-- installment). The `channel` column is the extension point: only 'in_app' is
-- implemented now (creates a notification); 'sms'/'email'/'whatsapp' are valid
-- values for future channels but not yet wired. Reminders are MANUAL — nothing
-- is sent automatically. Additive; no change to invoices/payments.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.schools(id)                     ON DELETE CASCADE,
  invoice_id     UUID NOT NULL REFERENCES public.student_invoices(id)            ON DELETE CASCADE,
  installment_id UUID REFERENCES public.payment_plan_installments(id)            ON DELETE SET NULL,
  student_id     UUID NOT NULL REFERENCES public.students(id)                    ON DELETE CASCADE,
  channel        TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'sms', 'email', 'whatsapp')),
  status         TEXT NOT NULL DEFAULT 'sent'   CHECK (status IN ('sent', 'failed')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_reminders_school  ON public.payment_reminders(school_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON public.payment_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_sent_at ON public.payment_reminders(school_id, sent_at DESC);

DROP POLICY IF EXISTS "School members can view payment reminders" ON public.payment_reminders;
CREATE POLICY "School members can view payment reminders" ON public.payment_reminders
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can manage payment reminders" ON public.payment_reminders;
CREATE POLICY "School admins can manage payment reminders" ON public.payment_reminders
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all payment reminders" ON public.payment_reminders;
CREATE POLICY "Super admin can manage all payment reminders" ON public.payment_reminders
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_insert ON public.payment_reminders;
CREATE POLICY active_school_required_insert ON public.payment_reminders
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

-- ── Notification type: invoice_reminder ──────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'info', 'success', 'warning', 'error', 'system',
  'announcement_published', 'invoice_created', 'invoice_overdue', 'payment_recorded',
  'attendance_recorded', 'bulletin_published', 'assessment_created',
  'timetable_created', 'timetable_updated', 'timetable_deleted', 'exam_results_published',
  'homework_assigned', 'message_received', 'invoice_reminder'
));
