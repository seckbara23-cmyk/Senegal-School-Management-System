-- ============================================================================
-- Migration 019: Tighten RLS — parent/student data access (Phase 1.1)
--
-- Problem: Several "any school member" broad SELECT policies let parents and
-- students read every row in sensitive tables (all invoices, all grades, all
-- attendance records for every student in the school).
--
-- Fix: Replace each broad SELECT policy with role-scoped ones:
--
--   school_admin     → full access (existing FOR ALL manage policies unchanged)
--   teacher          → SELECT on academic / attendance tables
--   finance_officer  → SELECT on finance tables + students (for billing UI)
--   parent           → SELECT only rows linked to their own children
--   student          → SELECT only their own rows
--   super_admin      → unchanged bypass via existing FOR ALL policies
--
-- Tables left intentionally broad (non-sensitive metadata):
--   academic_periods, assessments, announcements
--
-- Tables already correctly scoped (no change):
--   parent_student_links, notifications
--
-- Existing portal policies from migration 018 (student/parent own records for
-- attendance_records, student_invoices, student_payments, grades) are kept as-is;
-- this migration only replaces the broad "all school members" counterpart.
--
-- Idempotent: every DROP POLICY uses IF EXISTS; every index uses IF NOT EXISTS.
-- Safe to rerun if a previous partial run left some policies already created.
-- ============================================================================

-- ── Performance index: parents.profile_id ────────────────────────────────────
-- Used in every parent portal sub-query that joins through parents.profile_id.
-- Not created by prior migrations; without it each policy evaluation scans parents.

CREATE INDEX IF NOT EXISTS idx_parents_profile_id
  ON public.parents (profile_id)
  WHERE profile_id IS NOT NULL;

-- ============================================================================
-- 1. students
-- ============================================================================
-- Old (002): "Users can view students in their schools"
--   is_school_member(school_id) → every school member sees every student row.
--
-- After drop:
--   school_admin + teacher  → covered by existing "School admins and teachers
--                             can manage students in their school" FOR ALL
--   finance_officer         → new SELECT policy below
--   parent                  → new SELECT limited to linked children
--   student                 → new SELECT limited to own record
--   super_admin             → covered by existing "Super admin can manage all
--                             students" FOR ALL
-- ============================================================================

DROP POLICY IF EXISTS "Users can view students in their schools" ON public.students;

DROP POLICY IF EXISTS "Finance officers can view students in their school" ON public.students;
CREATE POLICY "Finance officers can view students in their school"
  ON public.students FOR SELECT USING (
    public.has_school_role(students.school_id, ARRAY['finance_officer'])
  );

DROP POLICY IF EXISTS "Parents can view their linked students" ON public.students;
CREATE POLICY "Parents can view their linked students"
  ON public.students FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = students.id
        AND p.profile_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can view their own record" ON public.students;
CREATE POLICY "Students can view their own record"
  ON public.students FOR SELECT USING (
    students.profile_id = auth.uid()
  );

-- ============================================================================
-- 2. attendance_sessions
-- ============================================================================
-- Old (009): "Users can view attendance sessions in their school"
--   Raw school_memberships join with no status='active' check →
--   every school member (including inactive) sees every session.
--
-- After drop:
--   school_admin + teacher  → new SELECT policy below
--   parent                  → sessions that have records for their children
--   student                 → sessions that have a record for their own id
--   super_admin             → covered by existing FOR ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view attendance sessions in their school"
  ON public.attendance_sessions;

DROP POLICY IF EXISTS "Staff can view attendance sessions in their school"
  ON public.attendance_sessions;
CREATE POLICY "Staff can view attendance sessions in their school"
  ON public.attendance_sessions FOR SELECT USING (
    public.has_school_role(
      attendance_sessions.school_id,
      ARRAY['school_admin', 'teacher']
    )
  );

DROP POLICY IF EXISTS "Parents can view attendance sessions for their children"
  ON public.attendance_sessions;
CREATE POLICY "Parents can view attendance sessions for their children"
  ON public.attendance_sessions FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.attendance_records ar
      JOIN public.parent_student_links psl ON psl.student_id = ar.student_id
      JOIN public.parents             p   ON p.id            = psl.parent_id
      WHERE ar.session_id  = attendance_sessions.id
        AND p.profile_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can view their own attendance sessions"
  ON public.attendance_sessions;
CREATE POLICY "Students can view their own attendance sessions"
  ON public.attendance_sessions FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.attendance_records ar
      JOIN public.students s ON s.id = ar.student_id
      WHERE ar.session_id = attendance_sessions.id
        AND s.profile_id  = auth.uid()
    )
  );

-- ============================================================================
-- 3. attendance_records
-- ============================================================================
-- Old (009): "Users can view attendance records in their school"
--   Raw school_memberships join with no status='active' check →
--   every school member sees every attendance record.
--
-- After drop:
--   school_admin + teacher  → new SELECT policy below
--   parent / student        → covered by portal policies from migration 018:
--                             "Parents can view attendance records for their children"
--                             "Students can view their own attendance records"
--   super_admin             → covered by existing FOR ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view attendance records in their school"
  ON public.attendance_records;

DROP POLICY IF EXISTS "Staff can view attendance records in their school"
  ON public.attendance_records;
CREATE POLICY "Staff can view attendance records in their school"
  ON public.attendance_records FOR SELECT USING (
    public.has_school_role(
      attendance_records.school_id,
      ARRAY['school_admin', 'teacher']
    )
  );

-- ============================================================================
-- 4. student_invoices
-- ============================================================================
-- Old (012): "School members can view invoices"
--   is_school_member(school_id) → every school member sees every invoice.
--
-- After drop:
--   school_admin     → covered by existing "School admins can manage invoices"
--                      FOR ALL
--   finance_officer  → new SELECT policy below
--   parent / student → covered by portal policies from migration 018:
--                      "Parents can view invoices for their children"
--                      "Students can view their own invoices"
--   super_admin      → covered by existing FOR ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "School members can view invoices" ON public.student_invoices;

DROP POLICY IF EXISTS "Finance officers can view invoices in their school"
  ON public.student_invoices;
CREATE POLICY "Finance officers can view invoices in their school"
  ON public.student_invoices FOR SELECT USING (
    public.has_school_role(student_invoices.school_id, ARRAY['finance_officer'])
  );

-- ============================================================================
-- 5. invoice_lines
-- ============================================================================
-- Old (012): "School members can view invoice lines"
--   is_school_member(school_id) → every school member sees every line.
--   Migration 018 added no portal policies for invoice_lines — adding them here.
--
-- After drop:
--   school_admin     → covered by existing "School admins can manage invoice
--                      lines" FOR ALL
--   finance_officer  → new SELECT policy below
--   parent           → new SELECT via student_invoices join (added here)
--   student          → new SELECT via student_invoices join (added here)
--   super_admin      → covered by existing FOR ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "School members can view invoice lines" ON public.invoice_lines;

DROP POLICY IF EXISTS "Finance officers can view invoice lines in their school"
  ON public.invoice_lines;
CREATE POLICY "Finance officers can view invoice lines in their school"
  ON public.invoice_lines FOR SELECT USING (
    public.has_school_role(invoice_lines.school_id, ARRAY['finance_officer'])
  );

DROP POLICY IF EXISTS "Parents can view invoice lines for their children"
  ON public.invoice_lines;
CREATE POLICY "Parents can view invoice lines for their children"
  ON public.invoice_lines FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.student_invoices    si
      JOIN public.parent_student_links psl ON psl.student_id = si.student_id
      JOIN public.parents              p   ON p.id           = psl.parent_id
      WHERE si.id          = invoice_lines.invoice_id
        AND p.profile_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can view their own invoice lines"
  ON public.invoice_lines;
CREATE POLICY "Students can view their own invoice lines"
  ON public.invoice_lines FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.student_invoices si
      JOIN public.students         s  ON s.id = si.student_id
      WHERE si.id         = invoice_lines.invoice_id
        AND s.profile_id  = auth.uid()
    )
  );

-- ============================================================================
-- 6. student_payments
-- ============================================================================
-- Old (012): "School members can view payments"
--   is_school_member(school_id) → every school member sees every payment.
--
-- After drop:
--   school_admin     → covered by existing "School admins can manage payments"
--                      FOR ALL
--   finance_officer  → new SELECT policy below
--   parent / student → covered by portal policies from migration 018:
--                      "Parents can view payments for their children"
--                      "Students can view their own payments"
--   super_admin      → covered by existing FOR ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "School members can view payments" ON public.student_payments;

DROP POLICY IF EXISTS "Finance officers can view payments in their school"
  ON public.student_payments;
CREATE POLICY "Finance officers can view payments in their school"
  ON public.student_payments FOR SELECT USING (
    public.has_school_role(student_payments.school_id, ARRAY['finance_officer'])
  );

-- ============================================================================
-- 7. grades
-- ============================================================================
-- Old (017): "School members can view grades"
--   is_school_member(school_id) → every school member sees every grade row.
--
-- After drop:
--   school_admin     → covered by existing "School admins can manage grades"
--                      FOR ALL
--   teacher          → new SELECT policy below
--   parent / student → covered by portal policies from migration 018:
--                      "Parents can view grades for their children"
--                      "Students can view their own grades"
--   super_admin      → covered by existing FOR ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "School members can view grades" ON public.grades;

DROP POLICY IF EXISTS "Teachers can view grades in their school" ON public.grades;
CREATE POLICY "Teachers can view grades in their school"
  ON public.grades FOR SELECT USING (
    public.has_school_role(grades.school_id, ARRAY['teacher'])
  );

-- ============================================================================
-- Intentionally unchanged (non-sensitive / already correctly scoped):
--
--   academic_periods      "School members can view academic_periods"  → broad OK
--   assessments           "School members can view assessments"       → broad OK
--   announcements         "School members can view announcements"     → broad OK
--   notifications         "Users can view own notifications"          → owner-scoped
--   parent_student_links  targeted policies from 002 + 003            → correct
-- ============================================================================
