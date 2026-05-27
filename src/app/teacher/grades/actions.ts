'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// Resolve teacher context for server actions — never reads teacher_id from
// form data; always resolves via auth.uid() → school_memberships → teachers.
async function resolveTeacher() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'teacher')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/dashboard')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('profile_id', user.id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!teacher) redirect('/dashboard')

  return { supabase, schoolId, teacherId: (teacher as { id: string }).id }
}

// ─── Assessment creation ──────────────────────────────────────────────────────

const AssessmentSchema = z.object({
  class_subject_id:   z.string().uuid('Attribution de classe invalide.'),
  academic_period_id: z.string().uuid('Période invalide.'),
  title:              z.string().min(1, 'Le titre est requis.').max(200, 'Titre trop long.'),
  assessment_type:    z.enum(['devoir', 'composition', 'examen', 'participation', 'autre']),
  coefficient: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 1 : Number(v)),
    z.number().min(0.5, 'Coefficient minimum 0.5').max(100, 'Coefficient maximum 100'),
  ),
  max_score: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 20 : Number(v)),
    z.number().min(1, 'Barème minimum 1').max(1000, 'Barème maximum 1000'),
  ),
  assessment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
})

export type CreateTeacherAssessmentState = {
  errors?: {
    class_subject_id?:   string[]
    academic_period_id?: string[]
    title?:              string[]
    assessment_type?:    string[]
    coefficient?:        string[]
    max_score?:          string[]
    assessment_date?:    string[]
    _form?:              string[]
  }
}

export async function createTeacherAssessment(
  _prevState: CreateTeacherAssessmentState,
  formData: FormData,
): Promise<CreateTeacherAssessmentState> {
  const { supabase, schoolId, teacherId } = await resolveTeacher()

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
    return { errors: parsed.error.flatten().fieldErrors as CreateTeacherAssessmentState['errors'] }
  }

  const { class_subject_id, academic_period_id, title, assessment_type, coefficient, max_score, assessment_date } = parsed.data

  // Verify teacher is assigned to this class_subject
  const { data: assignment } = await supabase
    .from('teacher_subject_assignments')
    .select('id')
    .eq('class_subject_id', class_subject_id)
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!assignment) {
    return { errors: { class_subject_id: ["Vous n'êtes pas assigné à cette matière."] } }
  }

  // Verify period belongs to this school
  const { data: period } = await supabase
    .from('academic_periods')
    .select('id')
    .eq('id', academic_period_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!period) {
    return { errors: { academic_period_id: ['Période introuvable.'] } }
  }

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
    return { errors: { _form: ["Erreur lors de la création de l'évaluation. Veuillez réessayer."] } }
  }

  redirect(`/teacher/grades/${(newAssessment as { id: string }).id}`)
}

// Save (upsert / delete) grades for one assessment.
// Security invariants:
//   1. teacher_id is never read from formData — resolved from auth.uid()
//   2. assessment ownership is verified via teacher_subject_assignments
//   3. valid student IDs are whitelisted through student_class_enrollments
export async function saveTeacherGrades(formData: FormData): Promise<void> {
  const { supabase, schoolId, teacherId } = await resolveTeacher()

  const assessmentId = z.string().uuid().safeParse(formData.get('assessment_id'))
  if (!assessmentId.success) redirect('/teacher/grades?error=invalid')

  // Fetch assessment and verify it belongs to this school
  const { data: rawAssessment } = await supabase
    .from('assessments')
    .select('id, max_score, class_subject_id, class_subjects!class_subject_id(class_id)')
    .eq('id', assessmentId.data)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawAssessment) redirect('/teacher/grades?error=invalid')

  type AssessmentMeta = {
    id: string
    max_score: number
    class_subject_id: string
    class_subjects: { class_id: string }
  }
  const meta = rawAssessment as unknown as AssessmentMeta

  // Verify this teacher is assigned to the assessment's class_subject
  const { data: assignment } = await supabase
    .from('teacher_subject_assignments')
    .select('id')
    .eq('class_subject_id', meta.class_subject_id)
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!assignment) redirect('/teacher/grades?error=unauthorized')

  const classId  = meta.class_subjects.class_id
  const maxScore = meta.max_score

  // Whitelist student IDs through active enrollment — prevents injecting
  // arbitrary student IDs via the form
  const { data: enrollments } = await supabase
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const validStudentIds = new Set(
    ((enrollments ?? []) as { student_id: string }[]).map((e) => e.student_id)
  )

  type GradeInput = {
    assessment_id: string
    student_id:    string
    school_id:     string
    score:         number
    comment:       string | null
    updated_at:    string
  }
  const toUpsert: GradeInput[] = []
  const toDelete: string[]     = []

  for (const studentId of Array.from(validStudentIds)) {
    const rawScore   = (formData.get(`score_${studentId}`) as string | null)?.trim() ?? ''
    const rawComment = (formData.get(`comment_${studentId}`) as string | null)?.trim() ?? ''

    if (rawScore === '') {
      toDelete.push(studentId)
      continue
    }

    const score = parseFloat(rawScore)
    if (isNaN(score) || score < 0 || score > maxScore) {
      redirect(`/teacher/grades/${assessmentId.data}?error=invalid_score`)
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

  if (toDelete.length > 0) {
    await supabase
      .from('grades')
      .delete()
      .eq('assessment_id', assessmentId.data)
      .eq('school_id', schoolId)
      .in('student_id', toDelete)
  }

  if (toUpsert.length > 0) {
    await supabase
      .from('grades')
      .upsert(toUpsert, { onConflict: 'assessment_id,student_id' })
  }

  redirect(`/teacher/grades/${assessmentId.data}?saved=1`)
}
