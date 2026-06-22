-- =============================================================================
-- Migration 049: Payment plans (Phase 4.1)
--
-- A payment plan overlays a due-dated INSTALLMENT SCHEDULE on ONE existing
-- invoice. The invoice remains the single source of truth for total_amount,
-- amount_paid and status — installments are a schedule only. Per-installment
-- "paid" is DERIVED at read time (FIFO allocation of invoice.amount_paid across
-- installments by sequence). This means ZERO change to student_payments or the
-- record_student_payment() RPC — fully additive, no breaking changes.
--
-- One plan per invoice (UNIQUE invoice_id). Tenant-isolated; active-school write
-- gate consistent with migration 025.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id)         ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES public.student_invoices(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  total_amount NUMERIC(12, 0) NOT NULL CHECK (total_amount >= 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT payment_plans_invoice_unique UNIQUE (invoice_id)
);

CREATE TABLE IF NOT EXISTS public.payment_plan_installments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.payment_plans(id)  ON DELETE CASCADE,
  sequence   INTEGER NOT NULL CHECK (sequence >= 1),
  amount     NUMERIC(12, 0) NOT NULL CHECK (amount > 0),
  due_date   DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT plan_installment_sequence_unique UNIQUE (plan_id, sequence)
);

ALTER TABLE public.payment_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plan_installments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_plans_school     ON public.payment_plans(school_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_student    ON public.payment_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_plan   ON public.payment_plan_installments(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_school ON public.payment_plan_installments(school_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_due    ON public.payment_plan_installments(due_date);

DROP TRIGGER IF EXISTS trg_payment_plans_updated_at ON public.payment_plans;
CREATE TRIGGER trg_payment_plans_updated_at
  BEFORE UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Integrity: invoice + student belong to the plan's school, and match each other.
CREATE OR REPLACE FUNCTION public.check_payment_plan_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_invoices i
    WHERE i.id = NEW.invoice_id AND i.school_id = NEW.school_id AND i.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'invoice % does not belong to school % / student %', NEW.invoice_id, NEW.school_id, NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_plan_integrity ON public.payment_plans;
CREATE TRIGGER trg_payment_plan_integrity
  BEFORE INSERT OR UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.check_payment_plan_integrity();

-- ── RLS: plans ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "School members can view payment plans" ON public.payment_plans;
CREATE POLICY "School members can view payment plans" ON public.payment_plans
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can manage payment plans" ON public.payment_plans;
CREATE POLICY "School admins can manage payment plans" ON public.payment_plans
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all payment plans" ON public.payment_plans;
CREATE POLICY "Super admin can manage all payment plans" ON public.payment_plans
  FOR ALL USING (public.is_super_admin());

-- ── RLS: installments ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "School members can view plan installments" ON public.payment_plan_installments;
CREATE POLICY "School members can view plan installments" ON public.payment_plan_installments
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can manage plan installments" ON public.payment_plan_installments;
CREATE POLICY "School admins can manage plan installments" ON public.payment_plan_installments
  FOR ALL USING (public.has_school_role(school_id, ARRAY['school_admin']));

DROP POLICY IF EXISTS "Super admin can manage all plan installments" ON public.payment_plan_installments;
CREATE POLICY "Super admin can manage all plan installments" ON public.payment_plan_installments
  FOR ALL USING (public.is_super_admin());

-- ── RESTRICTIVE active-school write gate ──────────────────────────────────────
DROP POLICY IF EXISTS active_school_required_insert ON public.payment_plans;
CREATE POLICY active_school_required_insert ON public.payment_plans
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_update ON public.payment_plans;
CREATE POLICY active_school_required_update ON public.payment_plans
  AS RESTRICTIVE FOR UPDATE USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_delete ON public.payment_plans;
CREATE POLICY active_school_required_delete ON public.payment_plans
  AS RESTRICTIVE FOR DELETE USING (public.is_school_active(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS active_school_required_insert ON public.payment_plan_installments;
CREATE POLICY active_school_required_insert ON public.payment_plan_installments
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_update ON public.payment_plan_installments;
CREATE POLICY active_school_required_update ON public.payment_plan_installments
  AS RESTRICTIVE FOR UPDATE USING (public.is_school_active(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_active(school_id) OR public.is_super_admin());
DROP POLICY IF EXISTS active_school_required_delete ON public.payment_plan_installments;
CREATE POLICY active_school_required_delete ON public.payment_plan_installments
  AS RESTRICTIVE FOR DELETE USING (public.is_school_active(school_id) OR public.is_super_admin());
