-- =============================================================================
-- Migration 025: Tenant lifecycle RLS hardening (Phase 35 Task C)
--
-- Adds DATABASE-LEVEL defense-in-depth for the tenant write-protection that
-- Phase 35 Task A/B introduced at the application layer (isSchoolWritable() in
-- src/lib/tenant.ts). Writes to tenant-scoped tables are now blocked by RLS
-- whenever the owning school is NOT in the 'active' lifecycle state
-- (subscription_status <> 'active', i.e. inactive / suspended / archived).
--
-- DESIGN DECISION — why RESTRICTIVE policies instead of editing existing ones
-- ---------------------------------------------------------------------------
-- The task's recommended pattern is to AND `is_school_active(school_id)` into
-- each existing permissive write policy. That works for tables with dedicated
-- write policies, but several tables (students, grades, student_invoices,
-- invoice_lines, student_payments, teacher_subject_assignments) expose their
-- ONLY school_admin/teacher SELECT path through a single `FOR ALL` "manage"
-- policy (the broad member SELECT was dropped in migration 019/020). Editing
-- those `FOR ALL` USING clauses would also restrict SELECT for suspended /
-- archived schools — violating the explicit requirement that SELECT/read
-- policies remain unchanged.
--
-- Adding RESTRICTIVE write policies (INSERT / UPDATE / DELETE only — never
-- SELECT) achieves the same write-gate without touching a single existing
-- policy: restrictive policies are AND-ed with the permissive set, so they can
-- only further restrict, never widen. This satisfies "do not weaken existing
-- RLS" and "SELECT/read policies remain unchanged" by construction, and
-- automatically covers every current and future write policy on each table
-- (e.g. the teacher INSERT/UPDATE/DELETE policies from migration 022).
--
-- SUPER-ADMIN EXEMPTION
-- ---------------------
-- Restrictive policies apply to every role. Each gate therefore allows the row
-- when `is_super_admin()` is true, so super-admin lifecycle management of
-- suspended / archived tenants keeps working. (Super-admin server actions use
-- the service-role client, which bypasses RLS entirely; the OR clause is the
-- belt-and-braces for any super-admin write that goes through a user session.)
--
-- TABLES INTENTIONALLY EXCLUDED FROM THE WRITE-GATE
-- -------------------------------------------------
--   schools      — super admin must always be able to flip subscription_status.
--   profiles     — not tenant-scoped (per-user).
--   audit_logs   — append-only log; writes go through log_audit_event()
--                  (SECURITY DEFINER) and must keep working for any school.
--   notifications— its only write policy ("mark own as read") is owner-scoped
--                  (user_id), not a tenant-staff mutation, and inserts go
--                  through create_notification() (SECURITY DEFINER). Blocking a
--                  user from reading/clearing their own inbox is not intended.
--
-- IDEMPOTENT: helper uses CREATE OR REPLACE; every policy is DROP-then-CREATE
-- (via EXECUTE in the loop). Safe to rerun.
--
-- NOTE: Run this in the Supabase SQL editor against the project database.
--       Do NOT apply until reviewed.
-- =============================================================================

-- =============================================================================
-- PART 1: is_school_active() helper
-- =============================================================================
-- SECURITY DEFINER so it can read public.schools regardless of the caller's
-- own RLS visibility, and so it cannot be subverted via search_path injection.
-- STABLE: result is constant within a statement. Looks up schools by primary
-- key (id), so no extra index is required.
--
-- Fails closed: a missing school row (or NULL p_school_id) yields FALSE, so a
-- write is blocked rather than silently allowed — mirroring isSchoolWritable().

CREATE OR REPLACE FUNCTION public.is_school_active(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schools
    WHERE id = p_school_id
      AND subscription_status = 'active'
  );
$$;

-- =============================================================================
-- PART 2: RESTRICTIVE write-gate policies on tenant-scoped tables
-- =============================================================================
-- For each table below we (re)create three RESTRICTIVE policies — one per write
-- command — that require the owning school to be active (or the caller to be a
-- super admin). SELECT is deliberately NOT gated.
--
--   active_school_required_insert  → FOR INSERT  WITH CHECK
--   active_school_required_update  → FOR UPDATE  USING + WITH CHECK
--   active_school_required_delete  → FOR DELETE  USING
--
-- Every listed table has a NOT NULL school_id column, so the gate always has a
-- value to evaluate.

DO $$
DECLARE
  t          text;
  gate       text := '(public.is_school_active(school_id) OR public.is_super_admin())';
  tenant_tables text[] := ARRAY[
    'students',
    'teachers',
    'parents',
    'parent_student_links',
    'school_memberships',
    'academic_years',
    'classes',
    'student_class_enrollments',
    'attendance_sessions',
    'attendance_records',
    'announcements',
    'subjects',
    'class_subjects',
    'teacher_subject_assignments',
    'academic_periods',
    'assessments',
    'grades',
    'fee_items',
    'student_invoices',
    'invoice_lines',
    'student_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- INSERT
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'active_school_required_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (%s)',
      'active_school_required_insert', t, gate
    );

    -- UPDATE
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'active_school_required_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)',
      'active_school_required_update', t, gate, gate
    );

    -- DELETE
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'active_school_required_delete', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE USING (%s)',
      'active_school_required_delete', t, gate
    );
  END LOOP;
END $$;

-- =============================================================================
-- PART 3: School-admin audit-log viewer policy
-- =============================================================================
-- Previously audit_logs had a single SELECT policy: super_admin only.
-- Add a permissive SELECT policy letting an ACTIVE school_admin read audit
-- rows for their OWN ACTIVE school. has_school_role() already enforces
-- role = 'school_admin' AND membership status = 'active'; is_school_active()
-- adds the subscription_status = 'active' requirement. Platform-level rows
-- (school_id IS NULL) stay super-admin-only because of the NOT NULL guard.
--
-- Super-admin audit access is unchanged.

DROP POLICY IF EXISTS "School admins can view their school audit logs"
  ON public.audit_logs;
CREATE POLICY "School admins can view their school audit logs"
  ON public.audit_logs FOR SELECT USING (
    audit_logs.school_id IS NOT NULL
    AND public.has_school_role(audit_logs.school_id, ARRAY['school_admin'])
    AND public.is_school_active(audit_logs.school_id)
  );

-- =============================================================================
-- PART 4: Close the create_bulk_invoices() SECURITY DEFINER bypass
-- =============================================================================
-- create_bulk_invoices() (migration 014) is SECURITY DEFINER and owned by a
-- BYPASSRLS role, so it ignores the RESTRICTIVE gate added in Part 2. Without
-- this guard, an authenticated school_admin of a suspended/archived school
-- could still bulk-create invoices by calling the RPC directly (bypassing the
-- app-layer isSchoolWritable() check in the finance server action).
--
-- This is a faithful re-creation of the migration-014 function with ONE added
-- guard immediately after the existing auth guard. No other logic changes.

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

  -- ── Tenant lifecycle guard (Phase 35 Task C) ─────────────────────────────────
  -- Defense-in-depth: the RESTRICTIVE RLS write-gate cannot reach this
  -- SECURITY DEFINER function, so enforce the active-school rule here too.
  IF NOT public.is_school_active(p_school_id) THEN
    RAISE EXCEPTION 'School is not active; writes are disabled';
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

REVOKE ALL ON FUNCTION public.create_bulk_invoices FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_bulk_invoices TO authenticated;
