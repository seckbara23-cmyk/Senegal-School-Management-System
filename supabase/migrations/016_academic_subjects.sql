-- ── Academic subjects, class assignments, teacher assignments ─────────────────

-- subjects: school-scoped subject catalog
CREATE TABLE IF NOT EXISTS public.subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  coefficient  NUMERIC(4, 2),
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT subjects_school_name_unique UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS subjects_school_id_idx ON public.subjects (school_id);

-- class_subjects: links a subject to a class for a specific academic year
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id         UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT class_subjects_class_subject_unique UNIQUE (class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS class_subjects_school_id_idx      ON public.class_subjects (school_id);
CREATE INDEX IF NOT EXISTS class_subjects_class_id_idx       ON public.class_subjects (class_id);
CREATE INDEX IF NOT EXISTS class_subjects_subject_id_idx     ON public.class_subjects (subject_id);
CREATE INDEX IF NOT EXISTS class_subjects_academic_year_idx  ON public.class_subjects (academic_year_id);

-- teacher_subject_assignments: one teacher per class_subject
CREATE TABLE IF NOT EXISTS public.teacher_subject_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id       UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  class_subject_id UUID NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT tsa_class_subject_unique UNIQUE (class_subject_id)
);

CREATE INDEX IF NOT EXISTS tsa_school_id_idx       ON public.teacher_subject_assignments (school_id);
CREATE INDEX IF NOT EXISTS tsa_teacher_id_idx      ON public.teacher_subject_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS tsa_class_subject_id_idx ON public.teacher_subject_assignments (class_subject_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.subjects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subject_assignments ENABLE ROW LEVEL SECURITY;

-- subjects
CREATE POLICY "School members can view subjects" ON public.subjects FOR SELECT USING (
  public.is_school_member(school_id) OR public.is_super_admin()
);
CREATE POLICY "School admins can manage subjects" ON public.subjects FOR ALL USING (
  public.has_school_role(school_id, ARRAY['school_admin'])
);
CREATE POLICY "Super admin can manage all subjects" ON public.subjects FOR ALL USING (
  public.is_super_admin()
);

-- class_subjects
CREATE POLICY "School members can view class_subjects" ON public.class_subjects FOR SELECT USING (
  public.is_school_member(school_id) OR public.is_super_admin()
);
CREATE POLICY "School admins can manage class_subjects" ON public.class_subjects FOR ALL USING (
  public.has_school_role(school_id, ARRAY['school_admin'])
);
CREATE POLICY "Super admin can manage all class_subjects" ON public.class_subjects FOR ALL USING (
  public.is_super_admin()
);

-- teacher_subject_assignments
CREATE POLICY "School members can view teacher_subject_assignments" ON public.teacher_subject_assignments FOR SELECT USING (
  public.is_school_member(school_id) OR public.is_super_admin()
);
CREATE POLICY "School admins can manage teacher_subject_assignments" ON public.teacher_subject_assignments FOR ALL USING (
  public.has_school_role(school_id, ARRAY['school_admin'])
);
CREATE POLICY "Super admin can manage all teacher_subject_assignments" ON public.teacher_subject_assignments FOR ALL USING (
  public.is_super_admin()
);
