-- =============================================================================
-- Migration 037: Targeted finance performance indexes (Phase 49.4)
--
-- Adds composite indexes for hot finance queries that filter by school and then
-- range/order on a date column. These columns were previously unindexed
-- (only school_id / student_id / status were indexed on these tables), so on a
-- large school the planner had to sort thousands of rows per page load.
--
-- Each index is justified by confirmed query usage — no speculative indexes:
--
--   1. student_payments(school_id, paid_at DESC)
--      Used by: /school/finance/reports (paid_at range), the payments journal
--      /school/finance/payments (paid_at range + ORDER BY paid_at DESC), the
--      /school dashboard recent payments, and the /finance-officer dashboard.
--
--   2. student_invoices(school_id, created_at DESC)
--      Used by: /school/finance/invoices (ORDER BY created_at DESC),
--      /school/finance recent invoices, and /school/finance/reports
--      (created_at range for "invoiced in period").
--
--   3. student_invoices(school_id, due_date)
--      Used by the "overdue" queries on /school dashboard, /school/finance,
--      /school/finance/reports and /finance-officer
--      (status IN ('unpaid','partial') AND due_date < today).
--
-- These tables are read far more than written on the finance dashboards, so the
-- extra btree maintenance cost on insert/update is negligible.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
-- For a very large existing table you may prefer to run each statement with
-- CREATE INDEX CONCURRENTLY outside a transaction to avoid a write lock.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_student_payments_school_paid_at
  ON public.student_payments(school_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_invoices_school_created_at
  ON public.student_invoices(school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_invoices_school_due_date
  ON public.student_invoices(school_id, due_date);
