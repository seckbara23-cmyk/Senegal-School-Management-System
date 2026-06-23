-- =============================================================================
-- Migration 056: Digital payments — request lifecycle + webhook log (Phase 7.1)
--
-- Additive. Adds the online-payment lifecycle table (payment_requests) and the
-- idempotency/forensics log (payment_webhook_events). Widens payment_method with
-- the online codes and registers the online providers. The atomic money write
-- stays in record_student_payment (042) for manual entry; online reconciliation
-- uses the separate record_online_payment RPC (migration 058) — no change to the
-- existing finance path.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- ── payment_requests: one online checkout attempt against one invoice ─────────
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES public.student_invoices(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES public.students(id)         ON DELETE CASCADE,
  initiated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider            TEXT NOT NULL CHECK (provider IN ('wave', 'orange_money')),
  amount              NUMERIC(12, 0) NOT NULL CHECK (amount > 0),
  currency            TEXT NOT NULL DEFAULT 'XOF',
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled')),
  provider_session_id TEXT,
  provider_reference  TEXT,
  checkout_url        TEXT,
  idempotency_key     TEXT NOT NULL,
  payment_id          UUID REFERENCES public.student_payments(id) ON DELETE SET NULL,
  error_message       TEXT,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  paid_at             TIMESTAMP WITH TIME ZONE,
  CONSTRAINT payment_requests_idem_unique UNIQUE (idempotency_key)
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_requests_school   ON public.payment_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_invoice  ON public.payment_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_student  ON public.payment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status   ON public.payment_requests(school_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_session  ON public.payment_requests(provider_session_id) WHERE provider_session_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_payment_requests_updated_at ON public.payment_requests;
CREATE TRIGGER trg_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Integrity: invoice + student belong to the school and match each other.
CREATE OR REPLACE FUNCTION public.check_payment_request_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_invoices i WHERE i.id = NEW.invoice_id AND i.school_id = NEW.school_id AND i.student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'invoice % does not belong to school % / student %', NEW.invoice_id, NEW.school_id, NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_request_integrity ON public.payment_requests;
CREATE TRIGGER trg_payment_request_integrity
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_payment_request_integrity();

-- RLS: parents see their linked children's requests; staff see the school's.
-- Writes happen via the service-role server path (initiate/webhook), so only
-- staff get a manage policy here.
DROP POLICY IF EXISTS "Parents view own children payment requests" ON public.payment_requests;
CREATE POLICY "Parents view own children payment requests" ON public.payment_requests
  FOR SELECT USING (public.is_parent_of_student(student_id));

DROP POLICY IF EXISTS "Staff view school payment requests" ON public.payment_requests;
CREATE POLICY "Staff view school payment requests" ON public.payment_requests
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin', 'finance_officer']) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins manage payment requests" ON public.payment_requests;
CREATE POLICY "School admins manage payment requests" ON public.payment_requests
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin());

-- ── payment_webhook_events: idempotency + forensics (service-role writes) ─────
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT NOT NULL,
  event_id           TEXT NOT NULL,
  payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  school_id          UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  signature_valid    BOOLEAN NOT NULL DEFAULT FALSE,
  status_reported    TEXT,
  amount_reported    NUMERIC(12, 0),
  payload            JSONB,
  result             TEXT,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT payment_webhook_event_unique UNIQUE (provider, event_id)
);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_webhook_events_request ON public.payment_webhook_events(payment_request_id);

DROP POLICY IF EXISTS "Staff view school webhook events" ON public.payment_webhook_events;
CREATE POLICY "Staff view school webhook events" ON public.payment_webhook_events
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin());

-- ── Widen payment_method + register online providers ─────────────────────────
ALTER TABLE public.student_payments DROP CONSTRAINT IF EXISTS student_payments_payment_method_check;
ALTER TABLE public.student_payments ADD CONSTRAINT student_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'wave_manual', 'orange_money_manual', 'wave', 'orange_money', 'other'));

INSERT INTO public.payment_providers (code, label, provider, mode, is_enabled, sort_order) VALUES
  ('wave',         'Wave (en ligne)',         'wave',   'online', TRUE, 7),
  ('orange_money', 'Orange Money (en ligne)', 'orange', 'online', TRUE, 8)
ON CONFLICT (code) DO NOTHING;
