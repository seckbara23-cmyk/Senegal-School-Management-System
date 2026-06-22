-- =============================================================================
-- Migration 050: Transport billing integration (Phase 4.2)
--
-- Additive only. Transport fees flow through the EXISTING invoice generation:
-- a transport charge is just an invoice_line with fee_item_id NULL. This adds a
-- nullable `source` tag so transport lines can be reported on (and distinguished
-- from ad-hoc custom lines) without any change to invoices/payments behaviour.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN public.invoice_lines.source IS
  'Origin tag for reporting: NULL = fee item / ad-hoc, ''transport'' = transport fee line (Phase 4.2).';

CREATE INDEX IF NOT EXISTS idx_invoice_lines_source ON public.invoice_lines(source) WHERE source IS NOT NULL;
