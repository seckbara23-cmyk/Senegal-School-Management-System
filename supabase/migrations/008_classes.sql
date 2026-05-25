-- ─── academic_years ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academic_years (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id  UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  starts_on  DATE NOT NULL,
  ends_on    DATE NOT NULL,
  is_active  BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT academic_years_school_name_unique UNIQUE(school_id, name)
);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

-- ─── classes ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.classes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID REFERENCES public.schools(id)        ON DELETE CASCADE NOT NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,
  level            TEXT,
  section          TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- ─── student_class_enrollments ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_class_enrollments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID REFERENCES public.schools(id)        ON DELETE CASCADE NOT NULL,
  student_id       UUID REFERENCES public.students(id)       ON DELETE CASCADE NOT NULL,
  class_id         UUID REFERENCES public.classes(id)        ON DELETE CASCADE NOT NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE NOT NULL,
  status           TEXT DEFAULT 'active'
                     CHECK (status IN ('active', 'transferred', 'withdrawn')) NOT NULL,
  enrolled_at      TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT student_class_enrollments_unique UNIQUE(student_id, class_id, academic_year_id)
);

ALTER TABLE public.student_class_enrollments ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_academic_years_school_id
  ON public.academic_years(school_id);

CREATE INDEX IF NOT EXISTS idx_classes_school_id
  ON public.classes(school_id);

CREATE INDEX IF NOT EXISTS idx_classes_academic_year_id
  ON public.classes(academic_year_id);

CREATE INDEX IF NOT EXISTS idx_student_class_enrollments_school_id
  ON public.student_class_enrollments(school_id);

CREATE INDEX IF NOT EXISTS idx_student_class_enrollments_student_id
  ON public.student_class_enrollments(student_id);

CREATE INDEX IF NOT EXISTS idx_student_class_enrollments_class_id
  ON public.student_class_enrollments(class_id);

-- ─── RLS: academic_years ──────────────────────────────────────────────────────

CREATE POLICY "Users can view academic years in their school" ON public.academic_years
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = academic_years.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage academic years" ON public.academic_years
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid()
        AND school_id = academic_years.school_id
        AND role = 'school_admin'
        AND status = 'active'
    )
  );

CREATE POLICY "Super admin can manage all academic years" ON public.academic_years
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- ─── RLS: classes ─────────────────────────────────────────────────────────────

CREATE POLICY "Users can view classes in their school" ON public.classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = classes.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage classes" ON public.classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid()
        AND school_id = classes.school_id
        AND role = 'school_admin'
        AND status = 'active'
    )
  );

CREATE POLICY "Super admin can manage all classes" ON public.classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

-- ─── RLS: student_class_enrollments ──────────────────────────────────────────

CREATE POLICY "Users can view enrollments in their school" ON public.student_class_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = student_class_enrollments.school_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );

CREATE POLICY "School admins can manage enrollments" ON public.student_class_enrollments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid()
        AND school_id = student_class_enrollments.school_id
        AND role = 'school_admin'
        AND status = 'active'
    )
  );

CREATE POLICY "Super admin can manage all enrollments" ON public.student_class_enrollments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND global_role = 'super_admin'
    )
  );
