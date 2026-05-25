'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const YearSchema = z.object({
  year_name: z
    .string()
    .min(1, "Le nom de l'année scolaire est requis.")
    .max(50, 'Nom trop long (50 caractères max).'),
  year_starts_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).'),
  year_ends_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).'),
  year_is_active: z.preprocess((v) => v === 'on', z.boolean()),
})

const ClassFieldsSchema = z.object({
  name: z
    .string()
    .min(1, 'Le nom de la classe est requis.')
    .max(100, 'Nom trop long (100 caractères max).'),
  level: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().max(50, 'Niveau trop long (50 caractères max).').optional()
  ),
  section: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().max(50, 'Section trop longue (50 caractères max.).').optional()
  ),
})

// ─── State type ───────────────────────────────────────────────────────────────

export type CreateClassState = {
  errors?: {
    academic_year_id?: string[]
    year_name?:        string[]
    year_starts_on?:   string[]
    year_ends_on?:     string[]
    name?:             string[]
    level?:            string[]
    section?:          string[]
    _form?:            string[]
  }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function createClass(
  _prevState: CreateClassState,
  formData: FormData
): Promise<CreateClassState> {
  const supabase = createClient()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  // ── School admin guard ─────────────────────────────────────────────────────
  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    return { errors: { _form: ['Non autorisé.'] } }
  }

  const schoolId = memberships[0].school_id as string

  // ── Resolve academic year ──────────────────────────────────────────────────
  const rawYearId = (formData.get('academic_year_id') as string | null)?.trim()
  let academicYearId: string

  if (!rawYearId) {
    return { errors: { academic_year_id: ["Veuillez sélectionner une année scolaire."] } }
  }

  if (rawYearId === 'new') {
    // Validate and insert a new academic year.
    const yearParsed = YearSchema.safeParse({
      year_name:      formData.get('year_name'),
      year_starts_on: formData.get('year_starts_on'),
      year_ends_on:   formData.get('year_ends_on'),
      year_is_active: formData.get('year_is_active'),
    })

    if (!yearParsed.success) {
      return {
        errors: yearParsed.error.flatten().fieldErrors as CreateClassState['errors'],
      }
    }

    const y = yearParsed.data
    const { data: newYear, error: yearError } = await supabase
      .from('academic_years')
      .insert({
        school_id:  schoolId,
        name:       y.year_name,
        starts_on:  y.year_starts_on,
        ends_on:    y.year_ends_on,
        is_active:  y.year_is_active,
      })
      .select('id')
      .single()

    if (yearError || !newYear) {
      console.error('[createClass] academic year insert error:', yearError?.message)
      if (yearError?.code === '23505') {
        return {
          errors: {
            year_name: ['Une année scolaire avec ce nom existe déjà.'],
          },
        }
      }
      return {
        errors: { _form: ["Erreur lors de la création de l'année scolaire."] },
      }
    }

    academicYearId = newYear.id
  } else {
    // Verify the submitted year belongs to this school — never trust the client.
    const { data: year } = await supabase
      .from('academic_years')
      .select('id')
      .eq('id', rawYearId)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!year) {
      return {
        errors: { academic_year_id: ['Année scolaire introuvable.'] },
      }
    }

    academicYearId = year.id
  }

  // ── Validate class fields ──────────────────────────────────────────────────
  const classParsed = ClassFieldsSchema.safeParse({
    name:    formData.get('name'),
    level:   formData.get('level'),
    section: formData.get('section'),
  })

  if (!classParsed.success) {
    return {
      errors: classParsed.error.flatten().fieldErrors as CreateClassState['errors'],
    }
  }

  // ── Insert class ───────────────────────────────────────────────────────────
  const { data: newClass, error: classError } = await supabase
    .from('classes')
    .insert({
      school_id:        schoolId,
      academic_year_id: academicYearId,
      name:             classParsed.data.name,
      level:            classParsed.data.level    ?? null,
      section:          classParsed.data.section  ?? null,
    })
    .select('id')
    .single()

  if (classError || !newClass) {
    console.error('[createClass] class insert error:', classError?.message)
    return {
      errors: { _form: ['Erreur lors de la création de la classe. Veuillez réessayer.'] },
    }
  }

  redirect(`/school/classes/${newClass.id}`)
}

// ─── Enroll students ──────────────────────────────────────────────────────────

export type EnrollStudentsState = {
  errors?: {
    student_ids?: string[]
    _form?:       string[]
  }
}

export async function enrollStudents(
  _prevState: EnrollStudentsState,
  formData: FormData
): Promise<EnrollStudentsState> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    return { errors: { _form: ['Non autorisé.'] } }
  }

  const schoolId = memberships[0].school_id as string

  // Verify class belongs to this school — classId from form is NOT trusted for auth,
  // only for query lookup combined with the server-side schoolId.
  const classId = (formData.get('classId') as string | null)?.trim()
  if (!classId) return { errors: { _form: ['Classe introuvable.'] } }

  const { data: cls } = await supabase
    .from('classes')
    .select('id, academic_year_id')
    .eq('id', classId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!cls) return { errors: { _form: ['Classe introuvable.'] } }

  // Collect selected student IDs from checkboxes.
  const rawIds = formData.getAll('student_ids') as string[]
  const studentIds = rawIds.map((id) => id.trim()).filter(Boolean)

  if (studentIds.length === 0) {
    return { errors: { student_ids: ['Sélectionnez au moins un élève.'] } }
  }

  // Verify every submitted student ID belongs to this school.
  // This prevents enrolling students from another school even if someone crafts
  // a malicious request with foreign student IDs.
  const { data: validStudents } = await supabase
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .in('id', studentIds)

  const validSet = new Set((validStudents ?? []).map((s) => (s as { id: string }).id))
  const hasInvalid = studentIds.some((id) => !validSet.has(id))

  if (hasInvalid) {
    return { errors: { _form: ['Un ou plusieurs élèves sélectionnés sont invalides.'] } }
  }

  // Upsert handles both fresh enrollments and re-enrollment of previously
  // withdrawn students (sets status back to 'active').
  const now = new Date().toISOString()
  const records = studentIds.map((studentId) => ({
    school_id:        schoolId,
    student_id:       studentId,
    class_id:         cls.id         as string,
    academic_year_id: cls.academic_year_id as string,
    status:           'active',
    enrolled_at:      now,
  }))

  const { error: upsertError } = await supabase
    .from('student_class_enrollments')
    .upsert(records, { onConflict: 'student_id,class_id,academic_year_id' })

  if (upsertError) {
    console.error('[enrollStudents] upsert error:', upsertError.message)
    return {
      errors: { _form: ["Erreur lors de l'inscription. Veuillez réessayer."] },
    }
  }

  redirect(`/school/classes/${classId}`)
}

// ─── Withdraw enrollment ──────────────────────────────────────────────────────

export async function withdrawEnrollment(formData: FormData): Promise<void> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) return

  const schoolId    = memberships[0].school_id as string
  const enrollmentId = (formData.get('enrollmentId') as string | null)?.trim()
  const classId      = (formData.get('classId')      as string | null)?.trim()

  if (!enrollmentId || !classId) return

  // Update WHERE id = enrollmentId AND school_id = schoolId — prevents
  // withdrawing enrollments that belong to a different school.
  await supabase
    .from('student_class_enrollments')
    .update({ status: 'withdrawn' })
    .eq('id', enrollmentId)
    .eq('school_id', schoolId)

  redirect(`/school/classes/${classId}`)
}
