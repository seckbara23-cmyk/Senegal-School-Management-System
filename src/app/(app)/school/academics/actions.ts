'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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
    if (error.code === '23505') {
      return { errors: { name: ['Une matière avec ce nom existe déjà.'] } }
    }
    return { errors: { _form: ['Erreur lors de la création. Réessayez.'] } }
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
