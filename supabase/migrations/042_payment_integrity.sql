-- =============================================================================
-- Migration 042: Payment integrity — atomic recording + balance backstop
--
-- Fixes the finance race condition (audit H1): payment recording was a
-- non-atomic read-modify-write of student_invoices.amount_paid, so concurrent
-- payments could lose updates or push amount_paid above total_amount.
--
-- PART 1 — a hard DB guarantee that a payment can never over-collect.
-- PART 2 — record_student_payment(): a SECURITY DEFINER RPC that locks the
--          invoice row (FOR UPDATE → serialises concurrent payments), authorises
--          the caller (school_admin OR finance_officer of the invoice's school),
--          enforces the active-school write gate, validates the amount, inserts
--          the payment and recomputes amount_paid/status — all in one
--          transaction. The app calls this instead of separate INSERT + UPDATE.
--
-- PRE-CHECK before applying PART 1 (must return 0 rows):
--   SELECT id FROM public.student_invoices WHERE amount_paid > total_amount;
--
-- NOTE: Run this in the Supabase SQL editor against the project database, and
-- deploy the matching app code only AFTER this migration is applied.
-- =============================================================================

-- ── PART 1: balance backstop ─────────────────────────────────────────────────
ALTER TABLE public.student_invoices
  ADD CONSTRAINT student_invoices_paid_lte_total CHECK (amount_paid <= total_amount);

-- ── PART 2: atomic payment recorder ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_student_payment(
  p_invoice_id     uuid,
  p_amount         numeric,
  p_payment_method text,
  p_receipt_number text,
  p_reference      text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_paid_at        timestamptz DEFAULT now()
)
RETURNS TABLE (payment_id uuid, new_status text, new_amount_paid numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_school   uuid;
  v_student  uuid;
  v_total    numeric;
  v_paid     numeric;
  v_status   text;
  v_new_paid numeric;
  v_new_stat text;
  v_pid      uuid;
BEGIN
  -- Lock the invoice for the rest of the transaction. Concurrent payments on the
  -- same invoice now queue here instead of racing on a stale read.
  SELECT school_id, student_id, total_amount, amount_paid, status
    INTO v_school, v_student, v_total, v_paid, v_status
  FROM public.student_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  -- Authorisation is enforced INSIDE the definer function (it bypasses RLS).
  IF NOT public.has_school_role(v_school, ARRAY['school_admin','finance_officer']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_school_active(v_school) THEN
    RAISE EXCEPTION 'school_readonly';
  END IF;

  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'invoice_cancelled'; END IF;
  IF v_status = 'paid'      THEN RAISE EXCEPTION 'invoice_paid'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount_invalid'; END IF;
  IF p_amount > (v_total - v_paid) THEN RAISE EXCEPTION 'amount_exceeds_balance'; END IF;

  INSERT INTO public.student_payments
    (school_id, student_id, invoice_id, amount, payment_method, reference, notes, receipt_number, paid_at, created_by)
  VALUES
    (v_school, v_student, p_invoice_id, p_amount, p_payment_method, p_reference, p_notes, p_receipt_number, p_paid_at, auth.uid())
  RETURNING id INTO v_pid;

  v_new_paid := v_paid + p_amount;
  v_new_stat := CASE
    WHEN v_new_paid >= v_total THEN 'paid'
    WHEN v_new_paid > 0        THEN 'partial'
    ELSE 'unpaid'
  END;

  UPDATE public.student_invoices
    SET amount_paid = v_new_paid, status = v_new_stat
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_pid, v_new_stat, v_new_paid;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.record_student_payment(uuid, numeric, text, text, text, text, timestamptz)
  TO authenticated;
