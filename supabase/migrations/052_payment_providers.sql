-- =============================================================================
-- Migration 052: Payment provider abstraction (Phase 4.6)
--
-- A catalogue of payment providers, keyed by `code` (which matches the existing
-- student_payments.payment_method values — no enum change). Every provider is a
-- MANUAL mode today (the cashier records the payment); the table is the config
-- surface so Wave / Orange Money can later be flipped to `mode='online'` and
-- backed by a real PaymentProvider implementation (createCharge/verifyWebhook)
-- without touching callers. No external integration here.
--
-- Reference data (not school-scoped): readable by any authenticated user,
-- managed by super admins.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_providers (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  provider   TEXT NOT NULL,                                   -- family: cash/bank/cheque/wave/orange/other
  mode       TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'online')),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_payment_providers_updated_at ON public.payment_providers;
CREATE TRIGGER trg_payment_providers_updated_at
  BEFORE UPDATE ON public.payment_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "Authenticated can view payment providers" ON public.payment_providers;
CREATE POLICY "Authenticated can view payment providers" ON public.payment_providers
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admin can manage payment providers" ON public.payment_providers;
CREATE POLICY "Super admin can manage payment providers" ON public.payment_providers
  FOR ALL USING (public.is_super_admin());

-- Seed: codes match student_payments.payment_method values. All manual for now.
INSERT INTO public.payment_providers (code, label, provider, mode, is_enabled, sort_order) VALUES
  ('cash',                'Espèces',           'cash',   'manual', TRUE, 1),
  ('wave_manual',         'Wave',              'wave',   'manual', TRUE, 2),
  ('orange_money_manual', 'Orange Money',      'orange', 'manual', TRUE, 3),
  ('bank_transfer',       'Virement bancaire', 'bank',   'manual', TRUE, 4),
  ('cheque',              'Chèque',            'cheque', 'manual', TRUE, 5),
  ('other',               'Autre',             'other',  'manual', TRUE, 6)
ON CONFLICT (code) DO NOTHING;
