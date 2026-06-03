-- =============================================================================
-- Migration 040: SaaS billing ledger for EduSen subscriptions (Phase 50.4)
--
-- Internal billing of SCHOOLS for their EduSen subscription. This is entirely
-- SEPARATE from the student-fee finance tables (student_invoices /
-- student_payments) — do NOT conflate them: those bill parents for school fees,
-- these bill schools for the SaaS subscription.
--
-- FOUNDATION ONLY: no external payment provider (Wave / Orange Money / card)
-- integration, no callbacks. Payments are recorded manually by a super admin.
-- No automatic school suspension is driven by these tables — the access gate
-- stays schools.subscription_status (see migration 024 / lib/tenant.ts).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================


-- ─── 1. subscription_invoices ────────────────────────────────────────────────
-- One SaaS invoice issued to a school. amount_paid + status mirror the
-- student-invoice pattern so an invoice flips to 'paid' once fully settled.
-- invoice_number is platform-wide unique (issued by EduSen, not per-tenant).
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            UUID NOT NULL REFERENCES public.schools(id)              ON DELETE CASCADE,
  subscription_id      UUID          REFERENCES public.school_subscriptions(id) ON DELETE SET NULL,
  invoice_number       TEXT NOT NULL UNIQUE,
  amount               NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  amount_paid          NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency             TEXT NOT NULL DEFAULT 'XOF',
  billing_period_start DATE,
  billing_period_end   DATE,
  due_date             DATE,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'cancelled')),
  issued_at            TIMESTAMP WITH TIME ZONE,
  paid_at              TIMESTAMP WITH TIME ZONE,
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_school_id       ON public.subscription_invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_status          ON public.subscription_invoices(school_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_subscription_id ON public.subscription_invoices(subscription_id);

-- Super admins manage every SaaS invoice.
CREATE POLICY "Super admin manages all subscription invoices" ON public.subscription_invoices
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- School admins may READ their own school's SaaS invoices (no writes).
CREATE POLICY "School admins can view their subscription invoices" ON public.subscription_invoices
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin']));


-- ─── 2. subscription_payments ────────────────────────────────────────────────
-- A payment recorded against a SaaS invoice. method enumerates the eventual
-- channels, but only manual recording is wired in this phase.
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id               UUID NOT NULL REFERENCES public.schools(id)                ON DELETE CASCADE,
  subscription_invoice_id UUID NOT NULL REFERENCES public.subscription_invoices(id)  ON DELETE CASCADE,
  amount                  NUMERIC(12, 0) NOT NULL CHECK (amount > 0),
  method                  TEXT NOT NULL DEFAULT 'manual'
                            CHECK (method IN ('manual', 'wave', 'orange_money', 'card', 'bank_transfer')),
  reference               TEXT,
  paid_at                 TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  recorded_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_invoice_id ON public.subscription_payments(subscription_invoice_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_school_id  ON public.subscription_payments(school_id);

-- Super admins manage every SaaS payment.
CREATE POLICY "Super admin manages all subscription payments" ON public.subscription_payments
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- School admins may READ their own school's SaaS payments (no writes).
CREATE POLICY "School admins can view their subscription payments" ON public.subscription_payments
  FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin']));
