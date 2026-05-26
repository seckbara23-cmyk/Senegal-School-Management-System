-- ─── Migration 014: bulk invoice creation RPC ────────────────────────────────
--
-- SECURITY DEFINER function so all inserts happen atomically in one
-- transaction. auth.uid() is still available inside SECURITY DEFINER
-- functions in Supabase (JWT claims travel with the session, not the OS user).
--
-- Authorization is re-validated internally:
--   • caller must be active school_admin for p_school_id
--   • class, academic_year, and fee_items must belong to p_school_id
--   • RLS on the tables remains a second defence layer
--
-- Duplicate guard: skips any student who already has a non-cancelled invoice
-- with the same (school_id, student_id, title, due_date) combination.
-- Limitation: class_id is not stored on student_invoices in Phase 3; the
-- title+due_date guard is sufficient for practical use. See Finance Phase 4
-- for a class_id column on student_invoices.
--
-- Returns JSON:  { "created_count": N, "skipped_count": M }

CREATE OR REPLACE FUNCTION public.create_bulk_invoices(
  p_school_id        UUID,
  p_class_id         UUID,
  p_academic_year_id UUID,
  p_title            TEXT,
  p_due_date         DATE,
  p_fee_item_ids     UUID[],
  p_custom_desc      TEXT          DEFAULT NULL,
  p_custom_amount    NUMERIC(12,0) DEFAULT NULL,
  p_created_by       UUID          DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id     UUID;
  v_fee_item       RECORD;
  v_total_amount   NUMERIC(12,0);
  v_invoice_id     UUID;
  v_invoice_number TEXT;
  v_year           TEXT;
  v_inv_count      BIGINT;
  v_created_count  INT            := 0;
  v_skipped_count  INT            := 0;
  v_fee_total      NUMERIC(12,0)  := 0;
BEGIN

  -- ── Auth guard ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id  = auth.uid()
      AND school_id = p_school_id
      AND role      = 'school_admin'
      AND status    = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied: not an active school_admin for this school';
  END IF;

  -- ── Ownership checks ────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'Class does not belong to school';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_years
    WHERE id = p_academic_year_id AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'Academic year does not belong to school';
  END IF;

  IF array_length(p_fee_item_ids, 1) IS NOT NULL
     AND array_length(p_fee_item_ids, 1) > 0
  THEN
    IF (
      SELECT COUNT(*)
      FROM public.fee_items
      WHERE id = ANY(p_fee_item_ids)
        AND school_id = p_school_id
        AND is_active  = true
    ) <> array_length(p_fee_item_ids, 1)
    THEN
      RAISE EXCEPTION 'One or more fee items are invalid or inactive';
    END IF;
  END IF;

  -- ── Compute total per student ───────────────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_fee_total
  FROM public.fee_items
  WHERE id = ANY(p_fee_item_ids) AND school_id = p_school_id;

  v_total_amount := v_fee_total + COALESCE(p_custom_amount, 0);

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Total amount per student must be greater than 0';
  END IF;

  v_year := EXTRACT(YEAR FROM NOW())::TEXT;

  -- ── Loop over active enrollments ────────────────────────────────────────────
  FOR v_student_id IN
    SELECT sce.student_id
    FROM public.student_class_enrollments sce
    WHERE sce.class_id         = p_class_id
      AND sce.school_id        = p_school_id
      AND sce.academic_year_id = p_academic_year_id
      AND sce.status           = 'active'
    ORDER BY sce.enrolled_at
  LOOP

    -- Duplicate guard (title + due_date uniqueness per student)
    IF EXISTS (
      SELECT 1 FROM public.student_invoices
      WHERE student_id = v_student_id
        AND school_id  = p_school_id
        AND title      = p_title
        AND status    != 'cancelled'
        AND (
          (due_date IS NULL AND p_due_date IS NULL)
          OR due_date = p_due_date
        )
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Invoice number: count all school invoices (including those just inserted
    -- in this transaction) then +1, giving sequential numbers within the batch.
    SELECT COUNT(*) + 1 INTO v_inv_count
    FROM public.student_invoices
    WHERE school_id = p_school_id;

    v_invoice_number := v_year || '-' || LPAD(v_inv_count::TEXT, 4, '0');

    INSERT INTO public.student_invoices (
      school_id, student_id, academic_year_id,
      invoice_number, title, total_amount, amount_paid, status,
      due_date, created_by
    ) VALUES (
      p_school_id, v_student_id, p_academic_year_id,
      v_invoice_number, p_title, v_total_amount, 0, 'unpaid',
      p_due_date, p_created_by
    )
    RETURNING id INTO v_invoice_id;

    -- Fee item lines
    FOR v_fee_item IN
      SELECT id, name, amount
      FROM public.fee_items
      WHERE id = ANY(p_fee_item_ids) AND school_id = p_school_id
      ORDER BY name
    LOOP
      INSERT INTO public.invoice_lines (
        school_id, invoice_id, fee_item_id, description, amount
      ) VALUES (
        p_school_id, v_invoice_id, v_fee_item.id, v_fee_item.name, v_fee_item.amount
      );
    END LOOP;

    -- Custom line (optional)
    IF p_custom_desc IS NOT NULL
       AND p_custom_amount IS NOT NULL
       AND p_custom_amount > 0
    THEN
      INSERT INTO public.invoice_lines (
        school_id, invoice_id, fee_item_id, description, amount
      ) VALUES (
        p_school_id, v_invoice_id, NULL, p_custom_desc, p_custom_amount
      );
    END IF;

    v_created_count := v_created_count + 1;
  END LOOP;

  RETURN json_build_object(
    'created_count', v_created_count,
    'skipped_count', v_skipped_count
  );

END;
$$;

-- Only authenticated users (JWT present) may call this function.
-- The auth guard inside verifies the school_admin role.
REVOKE ALL ON FUNCTION public.create_bulk_invoices FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_bulk_invoices TO authenticated;
