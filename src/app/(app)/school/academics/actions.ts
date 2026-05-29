'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSchoolId(): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')
  return (membership as { school_id: string }).school_id
}

// ── Create subject ────────────────────────────────────────────────────────────

const SubjectSchema = z.object({
  name:        z.string().min(1, 'Le nom est requis.').max(100, 'Nom trop long.'),
  code:        z.string().max(20, 'Code trop long.').optional(),
  coefficient: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(100).optional(),
  ),
})

export type CreateSubjectState = {
  errors?: { name?: string[]; code?: string[]; coefficient?: string[]; _form?: string[] }
}

export async function createSubject(
  _prevState: CreateSubjectState,
  formData: FormData,
): Promise<CreateSubjectState> {
  const schoolId = await getSchoolId()

  const parsed = SubjectSchema.safeParse({
    name:        formData.get('name'),
    code:        formData.get('code') || undefined,
    coefficient: formData.get('coefficient'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, code, coefficient } = parsed.data
  const supabase = createClient()

  const { error } = await supabase.from('subjects').insert({
    school_id:   schoolId,
    name:        name.trim(),
    code:        code?.trim() || null,
    coefficient: coefficient ?? null,
  })

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'createSubject',
        schoolId,
        entityIds: { name },
        constraints: {
          subjects_school_name_unique: { field: 'name', message: 'Une matière avec ce nom existe déjà.' },
        },
        fallback: 'Erreur lors de la création. Réessayez.',
      }) as CreateSubjectState['errors'],
    }
  }

  redirect('/school/academics/subjects')
}

// ── Assign subject to class ───────────────────────────────────────────────────

const AssignSubjectSchema = z.object({
  class_id:   z.string().uuid('Classe invalide.'),
  subject_id: z.string().uuid('Matière invalide.'),
})

export async function assignSubjectToClass(formData: FormData): Promise<void> {
  const schoolId = await getSchoolId()

  const parsed = AssignSubjectSchema.safeParse({
    class_id:   formData.get('class_id'),
    subject_id: formData.get('subject_id'),
  })

  if (!parsed.success) redirect('/school/academics/assignments?error=invalid')

  const { class_id, subject_id } = parsed.data
  const supabase = createClient()

  // Verify class belongs to this school and get its academic_year_id
  const [classRes, subjectRes] = await Promise.all([
    supabase.from('classes').select('id, academic_year_id').eq('id', class_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('subjects').select('id').eq('id', subject_id).eq('school_id', schoolId).maybeSingle(),
  ])

  if (!classRes.data || !subjectRes.data) redirect('/school/academics/assignments?error=invalid')

  const academic_year_id = (classRes.data as { id: string; academic_year_id: string }).academic_year_id

  const { error } = await supabase.from('class_subjects').insert({
    school_id:        schoolId,
    class_id,
    subject_id,
    academic_year_id,
  })

  if (error) {
    if (error.code === '23505') redirect('/school/academics/assignments?error=duplicate')
    logSupabaseError(error, { action: 'assignSubjectToClass', schoolId, entityIds: { class_id, subject_id } })
    redirect('/school/academics/assignments?error=server')
  }

  redirect('/school/academics/assignments')
}

// ── Assign / remove teacher from class subject ────────────────────────────────

const AssignTeacherSchema = z.object({
  class_subject_id: z.string().uuid('Attribution invalide.'),
  teacher_id:       z.string().uuid().optional(),
})

export async function assignTeacher(formData: FormData): Promise<void> {
  const schoolId = await getSchoolId()

  const parsed = AssignTeacherSchema.safeParse({
    class_subject_id: formData.get('class_subject_id'),
    teacher_id:       formData.get('teacher_id') || undefined,
  })

  if (!parsed.success) redirect('/school/academics/assignments?error=invalid')

  const { class_subject_id, teacher_id } = parsed.data
  const supabase = createClient()

  // Verify class_subject belongs to this school
  const { data: cs } = await supabase
    .from('class_subjects')
    .select('id')
    .eq('id', class_subject_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!cs) redirect('/school/academics/assignments?error=invalid')

  if (!teacher_id) {
    // Remove assignment
    await supabase
      .from('teacher_subject_assignments')
      .delete()
      .eq('class_subject_id', class_subject_id)
      .eq('school_id', schoolId)
  } else {
    // Verify teacher belongs to this school
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id')
      .eq('id', teacher_id)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!teacher) redirect('/school/academics/assignments?error=invalid')

    await supabase.from('teacher_subject_assignments').upsert(
      { school_id: schoolId, teacher_id, class_subject_id },
      { onConflict: 'class_subject_id' },
    )
  }

  redirect('/school/academics/assignments')
}

// ── Remove subject from class ─────────────────────────────────────────────────

const RemoveSubjectSchema = z.object({
  class_subject_id: z.string().uuid('Attribution invalide.'),
})

export async function removeSubjectFromClass(formData: FormData): Promise<void> {
  const schoolId = await getSchoolId()

  const parsed = RemoveSubjectSchema.safeParse({
    class_subject_id: formData.get('class_subject_id'),
  })

  if (!parsed.success) redirect('/school/academics/assignments?error=invalid')

  const supabase = createClient()

  const { error } = await supabase
    .from('class_subjects')
    .delete()
    .eq('id', parsed.data.class_subject_id)
    .eq('school_id', schoolId)

  if (error) redirect('/school/academics/assignments?error=server')

  redirect('/school/academics/assignments')
}

// ── Create academic period ────────────────────────────────────────────────────

const PeriodSchema = z.object({
  academic_year_id: z.string().uuid('Année scolaire invalide.'),
  name:             z.string().min(1, 'Le nom est requis.').max(100, 'Nom trop long.'),
  starts_on:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  ends_on:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  is_active:        z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
})

export type CreatePeriodState = {
  errors?: { academic_year_id?: string[]; name?: string[]; starts_on?: string[]; ends_on?: string[]; _form?: string[] }
}

export async function createPeriod(
  _prevState: CreatePeriodState,
  formData: FormData,
): Promise<CreatePeriodState> {
  const schoolId = await getSchoolId()

  const parsed = PeriodSchema.safeParse({
    academic_year_id: formData.get('academic_year_id'),
    name:             formData.get('name'),
    starts_on:        formData.get('starts_on') || '',
    ends_on:          formData.get('ends_on') || '',
    is_active:        formData.get('is_active'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { academic_year_id, name, starts_on, ends_on, is_active } = parsed.data
  const supabase = createClient()

  // Verify academic_year belongs to this school
  const { data: year } = await supabase
    .from('academic_years')
    .select('id')
    .eq('id', academic_year_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!year) return { errors: { academic_year_id: ['Année scolaire invalide.'] } }

  const { error } = await supabase.from('academic_periods').insert({
    school_id:        schoolId,
    academic_year_id,
    name:             name.trim(),
    starts_on:        starts_on || null,
    ends_on:          ends_on   || null,
    is_active,
  })

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'createPeriod',
        schoolId,
        entityIds: { academic_year_id, name },
        constraints: {
          academic_periods_school_year_name_unique: {
            field: 'name',
            message: 'Une période avec ce nom existe déjà pour cette année.',
          },
        },
        fallback: 'Erreur lors de la création. Réessayez.',
      }) as CreatePeriodState['errors'],
    }
  }

  redirect('/school/academics/periods')
}

// ── Create assessment ─────────────────────────────────────────────────────────

const AssessmentSchema = z.object({
  class_subject_id:   z.string().uuid('Attribution de classe invalide.'),
  academic_period_id: z.string().uuid('Période invalide.'),
  title:              z.string().min(1, 'Le titre est requis.').max(200, 'Titre trop long.'),
  assessment_type:    z.enum(['devoir','composition','examen','participation','autre']),
  coefficient: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 1 : Number(v)),
    z.number().min(0.5).max(100),
  ),
  max_score: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 20 : Number(v)),
    z.number().min(1).max(1000),
  ),
  assessment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
})

export type CreateAssessmentState = {
  errors?: {
    class_subject_id?: string[]
    academic_period_id?: string[]
    title?: string[]
    assessment_type?: string[]
    coefficient?: string[]
    max_score?: string[]
    assessment_date?: string[]
    _form?: string[]
  }
}

export async function createAssessment(
  _prevState: CreateAssessmentState,
  formData: FormData,
): Promise<CreateAssessmentState> {
  const schoolId = await getSchoolId()

  const parsed = AssessmentSchema.safeParse({
    class_subject_id:   formData.get('class_subject_id'),
    academic_period_id: formData.get('academic_period_id'),
    title:              formData.get('title'),
    assessment_type:    formData.get('assessment_type'),
    coefficient:        formData.get('coefficient'),
    max_score:          formData.get('max_score'),
    assessment_date:    formData.get('assessment_date') || '',
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { class_subject_id, academic_period_id, title, assessment_type, coefficient, max_score, assessment_date } = parsed.data
  const supabase = createClient()

  // Verify class_subject and period both belong to this school
  const [csRes, periodRes] = await Promise.all([
    supabase.from('class_subjects').select('id').eq('id', class_subject_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('academic_periods').select('id').eq('id', academic_period_id).eq('school_id', schoolId).maybeSingle(),
  ])

  if (!csRes.data)     return { errors: { class_subject_id:   ['Attribution invalide.'] } }
  if (!periodRes.data) return { errors: { academic_period_id: ['Période invalide.']     } }

  const { data: newAssessment, error } = await supabase
    .from('assessments')
    .insert({
      school_id:          schoolId,
      class_subject_id,
      academic_period_id,
      title:              title.trim(),
      assessment_type,
      coefficient,
      max_score,
      assessment_date:    assessment_date || null,
    })
    .select('id')
    .single()

  if (error || !newAssessment) {
    return {
      errors: formatServerActionError(error, {
        action: 'createAssessment',
        schoolId,
        entityIds: { class_subject_id, academic_period_id, title },
        fallback: 'Erreur lors de la création. Réessayez.',
      }) as CreateAssessmentState['errors'],
    }
  }

  redirect(`/school/academics/assessments/${newAssessment.id}`)
}

// ── Save grades ───────────────────────────────────────────────────────────────

export async function saveGrades(formData: FormData): Promise<void> {
  const schoolId = await getSchoolId()

  const assessmentId = z.string().uuid().safeParse(formData.get('assessment_id'))
  if (!assessmentId.success) redirect('/school/academics/assessments?error=invalid')

  const supabase = createClient()

  // Verify assessment belongs to school; get max_score and class_id
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, max_score, class_subject_id, class_subjects!class_subject_id(class_id)')
    .eq('id', assessmentId.data)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!assessment) redirect('/school/academics/assessments?error=invalid')

  type AssessmentMeta = {
    id: string
    max_score: number
    class_subject_id: string
    class_subjects: { class_id: string }
  }
  const meta = assessment as unknown as AssessmentMeta
  const classId  = meta.class_subjects.class_id
  const maxScore = meta.max_score

  // Get active enrolled students for the class — security: only valid student IDs accepted
  const { data: enrollments } = await supabase
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const validStudentIds = new Set(
    ((enrollments ?? []) as { student_id: string }[]).map((e) => e.student_id)
  )

  // Parse grade inputs: score_<studentId> and comment_<studentId>
  type GradeInput = { assessment_id: string; student_id: string; school_id: string; score: number; comment: string | null; updated_at: string }
  const toUpsert: GradeInput[] = []
  const toDelete: string[] = []

  for (const studentId of Array.from(validStudentIds)) {
    const rawScore   = (formData.get(`score_${studentId}`) as string | null)?.trim() ?? ''
    const rawComment = (formData.get(`comment_${studentId}`) as string | null)?.trim() ?? ''

    if (rawScore === '') {
      toDelete.push(studentId)
      continue
    }

    const score = parseFloat(rawScore)
    if (isNaN(score) || score < 0 || score > maxScore) {
      redirect(`/school/academics/assessments/${assessmentId.data}?error=invalid_score`)
    }

    toUpsert.push({
      assessment_id: assessmentId.data,
      student_id:    studentId,
      school_id:     schoolId,
      score,
      comment:       rawComment || null,
      updated_at:    new Date().toISOString(),
    })
  }

  // Delete cleared grades
  if (toDelete.length > 0) {
    await supabase
      .from('grades')
      .delete()
      .eq('assessment_id', assessmentId.data)
      .eq('school_id', schoolId)
      .in('student_id', toDelete)
  }

  // Upsert new/updated grades
  if (toUpsert.length > 0) {
    await supabase
      .from('grades')
      .upsert(toUpsert, { onConflict: 'assessment_id,student_id' })
  }

  redirect(`/school/academics/assessments/${assessmentId.data}?saved=1`)
}
