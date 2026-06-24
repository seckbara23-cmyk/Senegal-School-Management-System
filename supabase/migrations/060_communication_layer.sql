-- =============================================================================
-- Migration 060: Communication layer foundation (Phase 9D.1)
--
-- Multi-channel communication, abstracted from day one (mirrors the payment
-- provider model). In-app stays the DEFAULT channel via the existing
-- notifications table — no table here for it. Email/SMS/WhatsApp are additive,
-- platform-managed by default with optional per-school override.
--
-- Tables: communication_providers (catalogue), school_communication_config
-- (per-school enablement + optional encrypted override creds), communication_
-- templates (platform defaults + school overrides), communication_preferences
-- (opt-out model), communication_messages (delivery log/tracking),
-- communication_webhook_events (delivery-receipt idempotency).
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

-- ── Provider catalogue (global) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communication_providers (
  code       TEXT PRIMARY KEY,
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  label      TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);
ALTER TABLE public.communication_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view comm providers" ON public.communication_providers;
CREATE POLICY "Authenticated can view comm providers" ON public.communication_providers FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Super admin manage comm providers" ON public.communication_providers;
CREATE POLICY "Super admin manage comm providers" ON public.communication_providers FOR ALL USING (public.is_super_admin());

INSERT INTO public.communication_providers (code, channel, label, sort_order) VALUES
  ('resend',        'email',    'Resend',          1),
  ('smtp',          'email',    'SMTP',            2),
  ('twilio_sms',    'sms',      'Twilio SMS',       1),
  ('orange_sms',    'sms',      'Orange SMS',       2),
  ('meta_whatsapp', 'whatsapp', 'WhatsApp (Meta)',  1)
ON CONFLICT (code) DO NOTHING;

-- ── Per-school channel config (override creds encrypted; null → platform env) ──
CREATE TABLE IF NOT EXISTS public.school_communication_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  channel            TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  provider_code      TEXT,
  is_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  mode               TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'live')),
  sender_id          TEXT,                 -- email from-address / SMS sender id / WhatsApp number
  api_key_enc        TEXT,                 -- optional per-school override (AES-256-GCM); null → platform env
  webhook_secret_enc TEXT,
  config             JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT school_comm_config_unique UNIQUE (school_id, channel)
);
ALTER TABLE public.school_communication_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_school_comm_config_school ON public.school_communication_config(school_id);
DROP TRIGGER IF EXISTS trg_school_comm_config_updated_at ON public.school_communication_config;
CREATE TRIGGER trg_school_comm_config_updated_at BEFORE UPDATE ON public.school_communication_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "School admins manage comm config" ON public.school_communication_config;
CREATE POLICY "School admins manage comm config" ON public.school_communication_config FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage all comm config" ON public.school_communication_config;
CREATE POLICY "Super admin manage all comm config" ON public.school_communication_config FOR ALL USING (public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_insert ON public.school_communication_config;
CREATE POLICY active_school_required_insert ON public.school_communication_config AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_update ON public.school_communication_config;
CREATE POLICY active_school_required_update ON public.school_communication_config AS RESTRICTIVE FOR UPDATE USING (public.is_school_active(school_id) OR public.is_super_admin()) WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());

-- ── Templates (platform defaults: school_id NULL; school overrides) ───────────
CREATE TABLE IF NOT EXISTS public.communication_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID REFERENCES public.schools(id) ON DELETE CASCADE,   -- NULL = platform default
  key        TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp')),
  locale     TEXT NOT NULL DEFAULT 'fr',
  subject    TEXT,
  body       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_tpl_platform ON public.communication_templates(key, channel, locale) WHERE school_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_tpl_school ON public.communication_templates(school_id, key, channel, locale) WHERE school_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_comm_templates_updated_at ON public.communication_templates;
CREATE TRIGGER trg_comm_templates_updated_at BEFORE UPDATE ON public.communication_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "Members view templates" ON public.communication_templates;
CREATE POLICY "Members view templates" ON public.communication_templates FOR SELECT USING (school_id IS NULL OR public.is_school_member(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS "School admins manage own templates" ON public.communication_templates;
CREATE POLICY "School admins manage own templates" ON public.communication_templates FOR ALL USING (school_id IS NOT NULL AND public.has_school_role(school_id, ARRAY['school_admin']));
DROP POLICY IF EXISTS "Super admin manage all templates" ON public.communication_templates;
CREATE POLICY "Super admin manage all templates" ON public.communication_templates FOR ALL USING (public.is_super_admin());

-- Platform-default French templates (transactional). Channel-specific bodies.
INSERT INTO public.communication_templates (school_id, key, channel, locale, subject, body) VALUES
  (NULL, 'invoice_reminder', 'email', 'fr', 'Rappel de paiement — {{school_name}}', 'Bonjour,\n\nUn solde de {{amount}} reste à régler pour {{student_name}}{{due_clause}}.\n\nCordialement,\n{{school_name}}'),
  (NULL, 'invoice_reminder', 'sms',   'fr', NULL, '{{school_name}}: solde de {{amount}} à régler pour {{student_name}}{{due_clause}}.'),
  (NULL, 'invoice_created',  'email', 'fr', 'Nouvelle facture — {{school_name}}', 'Bonjour,\n\nUne facture de {{amount}} est disponible pour {{student_name}}.\n\n{{school_name}}'),
  (NULL, 'payment_recorded', 'email', 'fr', 'Paiement reçu — {{school_name}}', 'Bonjour,\n\nNous confirmons la réception de {{amount}} pour {{student_name}}. Merci.\n\n{{school_name}}'),
  (NULL, 'attendance_alert', 'sms',   'fr', NULL, '{{school_name}}: {{student_name}} a été {{status}} le {{date}}.')
ON CONFLICT DO NOTHING;

-- ── Preferences (opt-out model: store deviations from category defaults) ──────
CREATE TABLE IF NOT EXISTS public.communication_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('finance', 'attendance', 'academic', 'announcements', 'marketing')),
  channel    TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp')),
  opted_in   BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT comm_pref_unique UNIQUE (school_id, user_id, category, channel)
);
ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_comm_pref_user ON public.communication_preferences(school_id, user_id);
DROP TRIGGER IF EXISTS trg_comm_pref_updated_at ON public.communication_preferences;
CREATE TRIGGER trg_comm_pref_updated_at BEFORE UPDATE ON public.communication_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "Users manage own preferences" ON public.communication_preferences;
CREATE POLICY "Users manage own preferences" ON public.communication_preferences FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "School admins view preferences" ON public.communication_preferences;
CREATE POLICY "School admins view preferences" ON public.communication_preferences FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin());

-- ── Delivery log / tracking ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communication_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  channel            TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp')),
  provider_code      TEXT,
  recipient_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_address         TEXT,
  category           TEXT,
  template_key       TEXT,
  subject            TEXT,
  body_preview       TEXT,
  status             TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced', 'read', 'skipped')),
  provider_message_id TEXT,
  error              TEXT,
  cost_estimate      NUMERIC(10, 2),
  related_type       TEXT,
  related_id         TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  delivered_at       TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_comm_messages_school ON public.communication_messages(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_messages_status ON public.communication_messages(school_id, status);
CREATE INDEX IF NOT EXISTS idx_comm_messages_provider_msg ON public.communication_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_comm_messages_updated_at ON public.communication_messages;
CREATE TRIGGER trg_comm_messages_updated_at BEFORE UPDATE ON public.communication_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP POLICY IF EXISTS "School admins view messages" ON public.communication_messages;
CREATE POLICY "School admins view messages" ON public.communication_messages FOR SELECT USING (public.has_school_role(school_id, ARRAY['school_admin']) OR public.is_super_admin());

-- ── Delivery-receipt idempotency ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communication_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  message_id      UUID REFERENCES public.communication_messages(id) ON DELETE SET NULL,
  status_reported TEXT,
  payload         JSONB,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT comm_webhook_event_unique UNIQUE (channel, event_id)
);
ALTER TABLE public.communication_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin view comm webhook events" ON public.communication_webhook_events;
CREATE POLICY "Super admin view comm webhook events" ON public.communication_webhook_events FOR SELECT USING (public.is_super_admin());
