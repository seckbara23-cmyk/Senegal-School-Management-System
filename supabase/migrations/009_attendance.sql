-- ─── attendance_sessions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID REFERENCES public.schools(id)        ON DELETE CASCADE NOT NULL,
  class_id         UUID REFERENCES public.classes(id)        ON DELETE CASCADE NOT NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
  session_date     DATE NOT NULL,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id)            ON DELETE SET NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT attendance_sessions_class_date_unique UNIQUE(class_id, session_date)
);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- ─── attendance_records ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id  UUID REFERENCES public.schools(id)             ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.students(id)            ON DELETE CASCADE NOT NULL,
  status     TEXT DEFAULT 'present'
               CHECK (status IN ('present', 'absent', 'late', 'excused')) NOT NULL,
  notes      TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT attendance_records_session_student_unique UNIQUE(session_id, student_id)
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_school_id
  ON public.attendance_sessions(school_id);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_id
  ON public.attendance_sessions(class_id);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_session_date
  ON public.attendance_sessions(session_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_records_school_id
  ON public.attendance_records(school_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_session_id
  ON public.attendance_records(session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id
  ON public.attendance_records(student_id);

-- ─── RLS: attendance_sessions ─────────────────────────────────────────────────

CREATE POLICY "Users can view attendance sessions in their school"
  ON public.attendance_sessions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = attendance_sessions.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage attendance sessions"
  ON public.attendance_sessions FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid()
        AND school_id = attendance_sessions.school_id
        AND role = 'school_admin'
        AND status = 'active'
    )
  );

CREATE POLICY "Super admin can manage all attendance sessions"
  ON public.attendance_sessions FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- ─── RLS: attendance_records ──────────────────────────────────────────────────

CREATE POLICY "Users can view attendance records in their school"
  ON public.attendance_records FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = attendance_records.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage attendance records"
  ON public.attendance_records FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid()
        AND school_id = attendance_records.school_id
        AND role = 'school_admin'
        AND status = 'active'
    )
  );

CREATE POLICY "Super admin can manage all attendance records"
  ON public.attendance_records FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );
