-- ─── Migration 013: receipt_number on student_payments ───────────────────────
--
-- Adds receipt_number (TEXT, nullable) to student_payments.
-- Backfills existing rows with sequential per-school-per-year numbers.
-- Adds a partial unique index (school_id, receipt_number) WHERE NOT NULL.

-- ─── Add column ───────────────────────────────────────────────────────────────

ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

-- ─── Backfill existing payments ───────────────────────────────────────────────
-- Assigns REC-YYYY-NNNNNN sequentially per school per calendar year,
-- ordered by paid_at then created_at for determinism.

UPDATE public.student_payments p
SET receipt_number =
  'REC-' || ranked.yr || '-' || LPAD(ranked.rn::TEXT, 6, '0')
FROM (
  SELECT
    id,
    EXTRACT(YEAR FROM paid_at)::TEXT AS yr,
    ROW_NUMBER() OVER (
      PARTITION BY school_id, DATE_TRUNC('year', paid_at)
      ORDER BY paid_at, created_at
    ) AS rn
  FROM public.student_payments
  WHERE receipt_number IS NULL
) ranked
WHERE p.id = ranked.id;

-- ─── Unique index per school ──────────────────────────────────────────────────
-- Partial index allows NULL receipt_number (legacy or failed inserts) without
-- violating uniqueness. Only non-null values are enforced.

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_payments_school_receipt
  ON public.student_payments (school_id, receipt_number)
  WHERE receipt_number IS NOT NULL;
