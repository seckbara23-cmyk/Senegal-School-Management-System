-- =============================================================================
-- Migration 029: Finance-officer payment writes  ── PROPOSAL / NOT YET WIRED ──
--
-- STATUS: Reviewed-pending. This migration is the concrete proposal required by
-- the Finance Officer Portal phase. The portal ships READ-ONLY: a finance
-- officer can view invoices, payments, receipts and reports for their school
-- but cannot record payments, because today's RLS only grants finance_officer
-- SELECT on the finance tables (migration 019). There is NO finance_officer
-- write policy on student_payments or student_invoices.
--
-- AUDIT OF CURRENT FINANCE RLS (for reference):
--   student_payments   SELECT  finance_officer  ✅ (migration 019)
--   student_payments   write   school_admin only (FOR ALL, migration 012) ❌ FO
--   student_invoices   SELECT  finance_officer  ✅ (migration 019)
--   student_invoices   write   school_admin only (FOR ALL, migration 012) ❌ FO
--   invoice_lines      SELECT  finance_officer  ✅ (migration 019)
--   restrictive write-gate (migration 025) already requires an ACTIVE school.
--
-- This migration would ADDITIVELY grant a finance officer the minimum writes
-- needed to record a payment:
--   1. INSERT a row into student_payments for their school.
--   2. UPDATE student_invoices.amount_paid / status (recompute after payment).
-- It does NOT grant invoice creation, fee-item management, bulk invoicing, or
-- cancellation — those remain school_admin-only. It does not weaken or replace
-- any existing policy (only adds new permissive policies); the migration-025
-- restrictive gate still blocks writes for suspended/archived schools.
--
-- ⚠️ DO NOT APPLY until reviewed AND the matching application code lands:
--   - a finance-officer payment server action (resolving school via the
--     finance_officer membership) + the payment form on the FO invoice detail.
-- Applying the RLS alone is harmless (no code uses it yet); wiring the UI
-- without this migration would fail at the RLS layer. Keep them together.
--
-- IDEMPOTENT: DROP POLICY IF EXISTS before each CREATE.
-- =============================================================================

-- 1. Finance officers may record payments (INSERT) for their own school.
DROP POLICY IF EXISTS "Finance officers can record payments" ON public.student_payments;
CREATE POLICY "Finance officers can record payments"
  ON public.student_payments FOR INSERT
  WITH CHECK (public.has_school_role(school_id, ARRAY['finance_officer']));

-- 2. Finance officers may update invoice totals/status after a payment.
--    (UPDATE only — not INSERT/DELETE, so they cannot create or remove invoices.)
DROP POLICY IF EXISTS "Finance officers can update invoice payment status" ON public.student_invoices;
CREATE POLICY "Finance officers can update invoice payment status"
  ON public.student_invoices FOR UPDATE
  USING (public.has_school_role(school_id, ARRAY['finance_officer']))
  WITH CHECK (public.has_school_role(school_id, ARRAY['finance_officer']));

-- NOTE: The migration-025 RESTRICTIVE policies (active_school_required_insert /
-- _update) still apply on top of these, so writes remain blocked when the
-- school is suspended/archived. No change needed there.
