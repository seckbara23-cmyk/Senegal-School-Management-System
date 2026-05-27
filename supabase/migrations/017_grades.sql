-- ── Academic periods, assessments, and grades ────────────────────────────────

-- academic_periods: trimester/semester/term scoping for assessments
CREATE TABLE IF NOT EXISTS public.academic_periods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  starts_on        DATE,
  ends_on          DATE,
  is_active        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_periods_school_year_name_unique UNIQUE (school_id, academic_year_id, name)
);

CREATE INDEX IF NOT EXISTS academic_periods_school_id_idx ON public.academic_periods (school_id);
CREATE INDEX IF NOT EXISTS academic_periods_year_id_idx   ON public.academic_periods (academic_year_id);

-- assessments: an evaluation event for a class_subject in a period
CREATE TABLE IF NOT EXISTS public.assessments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  class_subject_id   UUID NOT NULL REFERENCES public.class_subjects(id)  ON DELETE CASCADE,
  academic_period_id UUID NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  assessment_type    TEXT NOT NULL DEFAULT 'devoir'
                       CHECK (assessment_type IN ('devoir','composition','examen','participation','autre')),
  coefficient        NUMERIC(4, 2) NOT NULL DEFAULT 1,
  max_score          NUMERIC(5, 2) NOT NULL DEFAULT 20,
  assessment_date    DATE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessments_school_id_idx        ON public.assessments (school_id);
CREATE INDEX IF NOT EXISTS assessments_class_subject_id_idx ON public.assessments (class_subject_id);
CREATE INDEX IF NOT EXISTS assessments_period_id_idx        ON public.assessments (academic_period_id);

-- grades: one row per student per assessment
CREATE TABLE IF NOT EXISTS public.grades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id)    ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id)    ON DELETE CASCADE,
  score         NUMERIC(5, 2) NOT NULL,
  comment       TEXT,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT grades_assessment_student_unique UNIQUE (assessment_id, student_id)
);

CREATE INDEX IF NOT EXISTS grades_school_id_idx     ON public.grades (school_id);
CREATE INDEX IF NOT EXISTS grades_assessment_id_idx ON public.grades (assessment_id);
CREATE INDEX IF NOT EXISTS grades_student_id_idx    ON public.grades (student_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades           ENABLE ROW LEVEL SECURITY;

-- academic_periods
CREATE POLICY "School members can view academic_periods" ON public.academic_periods FOR SELECT USING (
  public.is_school_member(school_id) OR public.is_super_admin()
);
CREATE POLICY "School admins can manage academic_periods" ON public.academic_periods FOR ALL USING (
  public.has_school_role(school_id, ARRAY['school_admin'])
);
CREATE POLICY "Super admin can manage all academic_periods" ON public.academic_periods FOR ALL USING (
  public.is_super_admin()
);

-- assessments
CREATE POLICY "School members can view assessments" ON public.assessments FOR SELECT USING (
  public.is_school_member(school_id) OR public.is_super_admin()
);
CREATE POLICY "School admins can manage assessments" ON public.assessments FOR ALL USING (
  public.has_school_role(school_id, ARRAY['school_admin'])
);
CREATE POLICY "Super admin can manage all assessments" ON public.assessments FOR ALL USING (
  public.is_super_admin()
);

-- grades
CREATE POLICY "School members can view grades" ON public.grades FOR SELECT USING (
  public.is_school_member(school_id) OR public.is_super_admin()
);
CREATE POLICY "School admins can manage grades" ON public.grades FOR ALL USING (
  public.has_school_role(school_id, ARRAY['school_admin'])
);
CREATE POLICY "Super admin can manage all grades" ON public.grades FOR ALL USING (
  public.is_super_admin()
);
