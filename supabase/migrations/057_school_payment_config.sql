-- =============================================================================
-- Migration 057: Per-school payment provider credentials (Phase 7.1)
--
-- Each school connects its OWN Wave / Orange Money business account. Secrets are
-- stored ENCRYPTED at rest (AES-256-GCM, app layer — ciphertext base64 in the
-- *_enc columns) and decrypted only server-side with PAYMENTS_ENC_KEY by the
-- service-role path during charge/verify. The admin UI never renders secrets;
-- even a row read yields only ciphertext, useless without the env key.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.school_payment_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL CHECK (provider IN ('wave', 'orange_money')),
  is_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  mode               TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'live')),
  merchant_id        TEXT,
  api_key_enc        TEXT,   -- AES-256-GCM ciphertext (base64)
  webhook_secret_enc TEXT,   -- AES-256-GCM ciphertext (base64)
  updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT school_payment_config_unique UNIQUE (school_id, provider)
);

ALTER TABLE public.school_payment_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_school_payment_config_school ON public.school_payment_config(school_id);

DROP TRIGGER IF EXISTS trg_school_payment_config_updated_at ON public.school_payment_config;
CREATE TRIGGER trg_school_payment_config_updated_at
  BEFORE UPDATE ON public.school_payment_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "School admins manage payment config" ON public.school_payment_config;
CREATE POLICY "School admins manage payment config" ON public.school_payment_config
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin manage all payment config" ON public.school_payment_config;
CREATE POLICY "Super admin manage all payment config" ON public.school_payment_config
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_insert ON public.school_payment_config;
CREATE POLICY active_school_required_insert ON public.school_payment_config
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_update ON public.school_payment_config;
CREATE POLICY active_school_required_update ON public.school_payment_config
  AS RESTRICTIVE FOR UPDATE USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
