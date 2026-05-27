-- ── Portal Phase 1: additive RLS policies for parent and student portals ────────
-- These policies are additive — existing broad "school members" SELECT policies
-- remain untouched so school_admin / teacher queries are unaffected.
-- Future work: narrow the broad policies to exclude parent/student roles and rely
-- exclusively on these targeted ones.

-- attendance_records ──────────────────────────────────────────────────────────

CREATE POLICY "Students can view their own attendance records"
  ON public.attendance_records FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = attendance_records.student_id
        AND s.profile_id = auth.uid()
    )
  );

CREATE POLICY "Parents can view attendance records for their children"
  ON public.attendance_records FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = attendance_records.student_id
        AND p.profile_id = auth.uid()
    )
  );

-- student_invoices ─────────────────────────────────────────────────────────────

CREATE POLICY "Students can view their own invoices"
  ON public.student_invoices FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_invoices.student_id
        AND s.profile_id = auth.uid()
    )
  );

CREATE POLICY "Parents can view invoices for their children"
  ON public.student_invoices FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = student_invoices.student_id
        AND p.profile_id = auth.uid()
    )
  );

-- student_payments ─────────────────────────────────────────────────────────────

CREATE POLICY "Students can view their own payments"
  ON public.student_payments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_payments.student_id
        AND s.profile_id = auth.uid()
    )
  );

CREATE POLICY "Parents can view payments for their children"
  ON public.student_payments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = student_payments.student_id
        AND p.profile_id = auth.uid()
    )
  );

-- grades ──────────────────────────────────────────────────────────────────────

CREATE POLICY "Students can view their own grades"
  ON public.grades FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = grades.student_id
        AND s.profile_id = auth.uid()
    )
  );

CREATE POLICY "Parents can view grades for their children"
  ON public.grades FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_student_links psl
      JOIN public.parents p ON p.id = psl.parent_id
      WHERE psl.student_id = grades.student_id
        AND p.profile_id = auth.uid()
    )
  );
