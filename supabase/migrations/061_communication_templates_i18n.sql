-- =============================================================================
-- Migration 061: Communication templates — English + Wolof (Phase 10F)
--
-- Additive DATA only (no schema change): English and Wolof platform-default
-- translations for the transactional templates seeded in migration 060. French
-- remains canonical; renderTemplate falls back to fr when a locale row is absent.
-- The partial unique index (key, channel, locale WHERE school_id IS NULL) keeps
-- one platform default per scope, so these never collide with the fr rows.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

INSERT INTO public.communication_templates (school_id, key, channel, locale, subject, body) VALUES
  -- English
  (NULL, 'invoice_reminder', 'email', 'en', 'Payment reminder — {{school_name}}', 'Hello,\n\nA balance of {{amount}} is outstanding for {{student_name}}{{due_clause}}.\n\nKind regards,\n{{school_name}}'),
  (NULL, 'invoice_reminder', 'sms',   'en', NULL, '{{school_name}}: {{amount}} balance due for {{student_name}}{{due_clause}}.'),
  (NULL, 'invoice_created',  'email', 'en', 'New invoice — {{school_name}}', 'Hello,\n\nAn invoice of {{amount}} is available for {{student_name}}.\n\n{{school_name}}'),
  (NULL, 'payment_recorded', 'email', 'en', 'Payment received — {{school_name}}', 'Hello,\n\nWe confirm receipt of {{amount}} for {{student_name}}. Thank you.\n\n{{school_name}}'),
  (NULL, 'attendance_alert', 'sms',   'en', NULL, '{{school_name}}: {{student_name}} was {{status}} on {{date}}.'),
  -- Wolof (pilot)
  (NULL, 'invoice_reminder', 'email', 'wo', 'Fattali fey — {{school_name}}', 'Asalaa maalekum,\n\nBor bu tollu ci {{amount}} a ngi des ci {{student_name}}{{due_clause}}.\n\nJërëjëf,\n{{school_name}}'),
  (NULL, 'invoice_reminder', 'sms',   'wo', NULL, '{{school_name}}: bor bu {{amount}} ci {{student_name}}{{due_clause}}.'),
  (NULL, 'invoice_created',  'email', 'wo', 'Faktur bu bees — {{school_name}}', 'Asalaa maalekum,\n\nFaktur bu {{amount}} a ngi am ngir {{student_name}}.\n\n{{school_name}}'),
  (NULL, 'payment_recorded', 'email', 'wo', 'Fey bu ñu jot — {{school_name}}', 'Asalaa maalekum,\n\nJotnaa {{amount}} ngir {{student_name}}. Jërëjëf.\n\n{{school_name}}'),
  (NULL, 'attendance_alert', 'sms',   'wo', NULL, '{{school_name}}: {{student_name}} {{status}} na ci {{date}}.')
ON CONFLICT DO NOTHING;
