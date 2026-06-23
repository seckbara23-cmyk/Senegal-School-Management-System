-- =============================================================================
-- Migration 058: record_online_payment RPC (Phase 7.1)
--
-- The atomic money write for ONLINE payments. Mirrors record_student_payment
-- (042) — invoice row lock, recompute amount_paid/status, generate a
-- student_payments row — but authorises on a VERIFIED payment_request (system
-- path) instead of has_school_role, since the caller is the service-role webhook
-- / return-page reconciler (no JWT). Exactly-once via the payment_requests
-- 'processing'→'paid' transition under the request+invoice locks. Overpayment is
-- clamped to the remaining balance.
--
-- SECURITY: granted to service_role ONLY (revoked from public/authenticated), so
-- no logged-in user can mark a request paid without a real provider settlement.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_online_payment(
  p_request_id     uuid,
  p_provider_ref   text,
  p_receipt_number text
)
RETURNS TABLE (payment_id uuid, outcome text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req      public.payment_requests%ROWTYPE;
  v_student  uuid;
  v_total    numeric;
  v_paid     numeric;
  v_status   text;
  v_apply    numeric;
  v_method   text;
  v_pid      uuid;
  v_new_paid numeric;
  v_new_stat text;
BEGIN
  -- Lock the request; reconcile at most once.
  SELECT * INTO v_req FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status = 'paid' THEN
    RETURN QUERY SELECT v_req.payment_id, 'already_paid'::text, 'paid'::text; RETURN;
  END IF;

  v_method := CASE v_req.provider WHEN 'wave' THEN 'wave' WHEN 'orange_money' THEN 'orange_money' ELSE 'other' END;

  -- Lock the invoice (serialise against manual payments on the same invoice).
  SELECT student_id, total_amount, amount_paid, status
    INTO v_student, v_total, v_paid, v_status
  FROM public.student_invoices WHERE id = v_req.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  IF v_status = 'cancelled' THEN
    UPDATE public.payment_requests SET status = 'failed', error_message = 'invoice_cancelled', updated_at = now() WHERE id = p_request_id;
    RETURN QUERY SELECT NULL::uuid, 'invoice_cancelled'::text, v_status; RETURN;
  END IF;

  -- Clamp to remaining balance (a manual payment may have landed first).
  v_apply := LEAST(v_req.amount, v_total - v_paid);

  IF v_apply <= 0 THEN
    -- Nothing left to apply: settled elsewhere. Close the request, flag overpay.
    UPDATE public.payment_requests
      SET status = 'paid', provider_reference = p_provider_ref, error_message = 'overpayment_no_balance', paid_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN QUERY SELECT NULL::uuid, 'overpayment_no_balance'::text, v_status; RETURN;
  END IF;

  INSERT INTO public.student_payments
    (school_id, student_id, invoice_id, amount, payment_method, reference, notes, receipt_number, paid_at, created_by)
  VALUES
    (v_req.school_id, v_student, v_req.invoice_id, v_apply, v_method, p_provider_ref, 'Paiement en ligne', p_receipt_number, now(), NULL)
  RETURNING id INTO v_pid;

  v_new_paid := v_paid + v_apply;
  v_new_stat := CASE WHEN v_new_paid >= v_total THEN 'paid' WHEN v_new_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  UPDATE public.student_invoices SET amount_paid = v_new_paid, status = v_new_stat WHERE id = v_req.invoice_id;
  UPDATE public.payment_requests
    SET status = 'paid', payment_id = v_pid, provider_reference = p_provider_ref, paid_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN QUERY SELECT v_pid, 'recorded'::text, v_new_stat;
END;
$$;

REVOKE ALL ON FUNCTION public.record_online_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_online_payment(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_payment(uuid, text, text) TO service_role;
