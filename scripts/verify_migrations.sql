-- =============================================================================
-- Migration verification (audit C1) — run in the Supabase SQL editor.
--
-- Confirms the manually-applied migrations are present in this database. Every
-- query below should return the row(s) noted; a missing row = a missing
-- migration. Complements GET /api/health/db (which covers tables + functions
-- but cannot see policies or constraints through PostgREST).
-- =============================================================================

-- 1) SECURITY DEFINER helpers expected by the app -----------------------------
-- Expect rows: is_super_admin, is_school_member, has_school_role (002),
-- is_school_active (025), is_parent_of_student (038),
-- get_school_plan / check_school_student_limit / check_school_teacher_limit (039),
-- attendance_class_summary / attendance_monthly_summary / attendance_daily_summary (041),
-- record_student_payment (042), log_audit_event (005), create_notification (006).
SELECT proname
FROM pg_proc
WHERE proname IN (
  'is_super_admin','is_school_member','has_school_role','is_school_active',
  'is_parent_of_student','get_school_plan','check_school_student_limit',
  'check_school_teacher_limit','attendance_class_summary','attendance_monthly_summary',
  'attendance_daily_summary','record_student_payment','log_audit_event','create_notification'
)
ORDER BY proname;

-- 2) Tenant write-gate RESTRICTIVE policies (025) -----------------------------
-- Expect MANY rows (one INSERT/UPDATE/DELETE policy per tenant-scoped table).
-- Zero rows => migration 025 was not applied (suspended schools could still write).
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
ORDER BY tablename, policyname;

-- 3) Finance integrity constraint (042) ---------------------------------------
-- Expect exactly 1 row.
SELECT conname
FROM pg_constraint
WHERE conname = 'student_invoices_paid_lte_total';

-- 4) Pre-flight before applying 042's CHECK (must return 0 rows) --------------
-- If this returns rows, fix the data before adding the constraint.
SELECT id, total_amount, amount_paid
FROM public.student_invoices
WHERE amount_paid > total_amount;

-- 5) Cross-school integrity trigger (002) -------------------------------------
-- Expect 1 row.
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_check_parent_student_school';

-- 6) Notifications type CHECK includes the newer event types (027/028/031/034)
-- Inspect the CHECK clause: it should list assessment_created, payment_recorded,
-- timetable_created/updated/deleted, exam_results_published, etc.
SELECT pg_get_constraintdef(oid) AS notifications_type_check
FROM pg_constraint
WHERE conrelid = 'public.notifications'::regclass AND contype = 'c';
