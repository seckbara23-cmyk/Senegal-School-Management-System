-- =============================================================================
-- Migration 029: Finance-officer payment writes
--
-- Grants a finance officer the MINIMUM writes needed to record a payment from
-- the finance-officer portal, additively (no existing policy is weakened or
-- replaced). Until migration 019, finance_officer had SELECT only on the
-- finance tables; the write policies are school_admin-only (migration 012).
--
-- WHAT THIS ALLOWS (finance_officer, own active school):
--   1. INSERT a row into student_payments.
--   2. UPDATE student_invoices ONLY to move a payable invoice
--      (unpaid/partial) to unpaid/partial/paid — i.e. recompute amount_paid
--      and status after a payment.
--
-- WHAT THIS DOES NOT ALLOW:
--   • Invoice creation        — no INSERT policy on student_invoices for FO.
--   • Invoice deletion        — no DELETE policy.
--   • Invoice CANCELLATION    — the UPDATE USING clause only targets invoices
--                               currently 'unpaid'/'partial', and the WITH
--                               CHECK forbids a resulting status of
--                               'cancelled' (allowed results: unpaid/partial/
--                               paid). A FO can neither cancel an invoice nor
--                               edit an already paid/cancelled one.
--   • Fee-item management      — no policy on fee_items.
--   • Invoice line mutation    — no policy on invoice_lines.
--
-- The migration-025 RESTRICTIVE gate (active_school_required_insert/_update)
-- still applies on top, so all of the above is blocked for suspended/archived
-- schools.
--
-- IDEMPOTENT: DROP POLICY IF EXISTS before each CREATE. Safe to rerun.
--
-- ⚠️ MANUAL: run this in the Supabase SQL editor against the project database.
--    Do NOT apply automatically.
-- =============================================================================

-- 1. Finance officers may record payments (INSERT) for their own school.
DROP POLICY IF EXISTS "Finance officers can record payments" ON public.student_payments;
CREATE POLICY "Finance officers can record payments"
  ON public.student_payments FOR INSERT
  WITH CHECK (public.has_school_role(school_id, ARRAY['finance_officer']));

-- 2. Finance officers may update a payable invoice's total/status after a
--    payment — but only unpaid/partial invoices, and never to 'cancelled'.
DROP POLICY IF EXISTS "Finance officers can update invoice payment status" ON public.student_invoices;
CREATE POLICY "Finance officers can update invoice payment status"
  ON public.student_invoices FOR UPDATE
  USING (
    public.has_school_role(school_id, ARRAY['finance_officer'])
    AND status IN ('unpaid', 'partial')
  )
  WITH CHECK (
    public.has_school_role(school_id, ARRAY['finance_officer'])
    AND status IN ('unpaid', 'partial', 'paid')
  );
