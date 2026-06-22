'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { getClassTemplate } from '@/lib/class-templates'
import { parseCsv, readClassRows } from '@/lib/parse-csv'

// ─── Shared admin guard ───────────────────────────────────────────────────────
// Returns the resolved school + actor, or null when the caller is not an active
// school admin (the caller decides how to respond).
async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null
  return { supabase, schoolId: (membership as { school_id: string }).school_id, actor: user }
}

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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
      return {
        errors: formatServerActionError(yearError, {
          action: 'createClass:academicYear',
          schoolId,
          entityIds: { year_name: y.year_name },
          constraints: {
            academic_years_school_name_unique: {
              field: 'year_name',
              message: 'Une année scolaire avec ce nom existe déjà.',
            },
          },
          fallback: "Erreur lors de la création de l'année scolaire.",
        }) as CreateClassState['errors'],
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
    return {
      errors: formatServerActionError(classError, {
        action: 'createClass',
        schoolId,
        entityIds: { academicYearId, name: classParsed.data.name },
        fallback: 'Erreur lors de la création de la classe. Veuillez réessayer.',
      }) as CreateClassState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'class_created', resourceType: 'class', resourceId: newClass.id,
    metadata: { name: classParsed.data.name, academic_year_id: academicYearId, level: classParsed.data.level ?? null, section: classParsed.data.section ?? null },
  })

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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
    return {
      errors: formatServerActionError(upsertError, {
        action: 'enrollStudents',
        schoolId,
        userId: user.id,
        entityIds: { classId, studentCount: studentIds.length },
        fallback: "Erreur lors de l'inscription. Veuillez réessayer.",
      }) as EnrollStudentsState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'students_enrolled', resourceType: 'class', resourceId: cls.id as string,
    metadata: { class_id: cls.id, academic_year_id: cls.academic_year_id, student_ids: studentIds, count: studentIds.length },
  })

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/classes/${classId}?error=readonly`)
  }

  // Update WHERE id = enrollmentId AND school_id = schoolId — prevents
  // withdrawing enrollments that belong to a different school.
  const { error } = await supabase
    .from('student_class_enrollments')
    .update({ status: 'withdrawn' })
    .eq('id', enrollmentId)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'withdrawEnrollment', schoolId, userId: user.id, entityIds: { enrollmentId, classId } })
    redirect(`/school/classes/${classId}?error=withdraw`)
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'enrollment_withdrawn', resourceType: 'enrollment', resourceId: enrollmentId,
    metadata: { enrollment_id: enrollmentId, class_id: classId },
  })

  redirect(`/school/classes/${classId}`)
}

// ─── Transfer a student to another class ──────────────────────────────────────
// Moves a student from their current active class to another class in the SAME
// academic year: the current active enrollment(s) for that year are marked
// 'transferred' and an active enrollment is created in the target class.

const TransferSchema = z.object({
  student_id:      z.string().uuid('Élève invalide.'),
  target_class_id: z.string().uuid('Classe invalide.'),
})

export async function transferStudent(formData: FormData): Promise<void> {
  const ctx = await resolveAdmin()
  if (!ctx) redirect('/school')
  const { supabase, schoolId, actor } = ctx!

  const parsed = TransferSchema.safeParse({
    student_id:      formData.get('student_id'),
    target_class_id: formData.get('target_class_id'),
  })
  if (!parsed.success) redirect('/school/students')
  const { student_id, target_class_id } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/students/${student_id}/transfer?error=readonly`)
  }

  // Verify student + target class belong to this school.
  const { data: stu } = await supabase
    .from('students').select('id').eq('id', student_id).eq('school_id', schoolId).maybeSingle()
  if (!stu) redirect('/school/students')

  const { data: cls } = await supabase
    .from('classes').select('id, academic_year_id').eq('id', target_class_id).eq('school_id', schoolId).maybeSingle()
  if (!cls) redirect(`/school/students/${student_id}/transfer?error=invalid`)
  const yearId = (cls as { academic_year_id: string }).academic_year_id

  // Already actively enrolled in the target?
  const { data: existingTarget } = await supabase
    .from('student_class_enrollments')
    .select('id, status')
    .eq('school_id', schoolId).eq('student_id', student_id)
    .eq('class_id', target_class_id).eq('academic_year_id', yearId)
    .maybeSingle()
  if (existingTarget && (existingTarget as { status: string }).status === 'active') {
    redirect(`/school/students/${student_id}/transfer?error=already`)
  }

  // Mark current active enrollment(s) for this year as transferred.
  await supabase
    .from('student_class_enrollments')
    .update({ status: 'transferred' })
    .eq('school_id', schoolId).eq('student_id', student_id)
    .eq('academic_year_id', yearId).eq('status', 'active')

  // Enroll (or reactivate) in the target class.
  const { error } = await supabase
    .from('student_class_enrollments')
    .upsert(
      { school_id: schoolId, student_id, class_id: target_class_id, academic_year_id: yearId, status: 'active', enrolled_at: new Date().toISOString() },
      { onConflict: 'student_id,class_id,academic_year_id' },
    )
  if (error) {
    logSupabaseError(error, { action: 'transferStudent', schoolId, userId: actor.id, entityIds: { student_id, target_class_id } })
    redirect(`/school/students/${student_id}/transfer?error=server`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'student_transferred', resourceType: 'student', resourceId: student_id,
    metadata: { student_id, target_class_id, academic_year_id: yearId },
  })

  redirect(`/school/classes/${target_class_id}`)
}

// ─── Promote a class (bulk move active students to another class) ─────────────
// End-of-year workflow: every ACTIVE student of the source class is moved to a
// target class (typically next year's). Source enrollments are marked
// 'transferred'; active enrollments are created/reactivated in the target.

const PromoteSchema = z.object({
  source_class_id: z.string().uuid('Classe source invalide.'),
  target_class_id: z.string().uuid('Classe cible invalide.'),
})

export async function promoteClass(formData: FormData): Promise<void> {
  const ctx = await resolveAdmin()
  if (!ctx) redirect('/school')
  const { supabase, schoolId, actor } = ctx!

  const parsed = PromoteSchema.safeParse({
    source_class_id: formData.get('source_class_id'),
    target_class_id: formData.get('target_class_id'),
  })
  if (!parsed.success) redirect('/school/classes')
  const { source_class_id, target_class_id } = parsed.data

  if (source_class_id === target_class_id) redirect(`/school/classes/${source_class_id}/promote?error=same`)
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/classes/${source_class_id}/promote?error=readonly`)

  // Verify both classes belong to this school.
  const { data: clsData } = await supabase
    .from('classes').select('id, academic_year_id').in('id', [source_class_id, target_class_id]).eq('school_id', schoolId)
  const rows = (clsData ?? []) as { id: string; academic_year_id: string }[]
  const source = rows.find((r) => r.id === source_class_id)
  const target = rows.find((r) => r.id === target_class_id)
  if (!source || !target) redirect(`/school/classes/${source_class_id}/promote?error=invalid`)
  const targetYear = target.academic_year_id

  // Active students of the source class.
  const { data: enr } = await supabase
    .from('student_class_enrollments').select('student_id')
    .eq('school_id', schoolId).eq('class_id', source_class_id).eq('status', 'active')
  const studentIds = ((enr ?? []) as { student_id: string }[]).map((e) => e.student_id)
  if (studentIds.length === 0) redirect(`/school/classes/${source_class_id}/promote?error=empty`)

  // Mark the source enrollments as transferred.
  await supabase
    .from('student_class_enrollments')
    .update({ status: 'transferred' })
    .eq('school_id', schoolId).eq('class_id', source_class_id).eq('status', 'active')

  // Create / reactivate active enrollments in the target class.
  const now = new Date().toISOString()
  const targetRows = studentIds.map((id) => ({
    school_id: schoolId, student_id: id, class_id: target_class_id, academic_year_id: targetYear, status: 'active', enrolled_at: now,
  }))
  const { error } = await supabase
    .from('student_class_enrollments')
    .upsert(targetRows, { onConflict: 'student_id,class_id,academic_year_id' })
  if (error) {
    logSupabaseError(error, { action: 'promoteClass', schoolId, userId: actor.id, entityIds: { source_class_id, target_class_id, count: studentIds.length } })
    redirect(`/school/classes/${source_class_id}/promote?error=server`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'class_promoted', resourceType: 'class', resourceId: source_class_id,
    metadata: { source_class_id, target_class_id, target_year: targetYear, moved: studentIds.length },
  })

  redirect(`/school/classes/${target_class_id}?promoted=${studentIds.length}`)
}

// ─── Update class ───────────────────────────────────────────────────────────────

export type UpdateClassState = {
  errors?: { name?: string[]; level?: string[]; section?: string[]; _form?: string[] }
}

export async function updateClass(
  _prevState: UpdateClassState,
  formData: FormData,
): Promise<UpdateClassState> {
  const ctx = await resolveAdmin()
  if (!ctx) return { errors: { _form: ['Non autorisé.'] } }
  const { supabase, schoolId, actor } = ctx

  const classId = z.string().uuid().safeParse(formData.get('class_id'))
  if (!classId.success) return { errors: { _form: ['Identifiant de classe invalide.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = ClassFieldsSchema.safeParse({
    name:    formData.get('name'),
    level:   formData.get('level'),
    section: formData.get('section'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as UpdateClassState['errors'] }
  }

  // Scope by id AND school_id — prevents cross-school edits (RLS is the 2nd layer).
  const { error } = await supabase
    .from('classes')
    .update({
      name:    parsed.data.name,
      level:   parsed.data.level   ?? null,
      section: parsed.data.section ?? null,
    })
    .eq('id', classId.data)
    .eq('school_id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'updateClass', schoolId, userId: actor.id,
        entityIds: { classId: classId.data, name: parsed.data.name },
        fallback: 'Erreur lors de la mise à jour de la classe. Veuillez réessayer.',
      }) as UpdateClassState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'class_updated', resourceType: 'class', resourceId: classId.data,
    metadata: { name: parsed.data.name, level: parsed.data.level ?? null, section: parsed.data.section ?? null },
  })

  redirect(`/school/classes/${classId.data}`)
}

// ─── Delete class (only when safe) ────────────────────────────────────────────
// The schema has no archive column, so we hard-delete ONLY when the class is
// empty and unused. A class with active enrollments, attendance sessions,
// timetable slots, or subject assignments (which carry assessments/grades) is
// blocked with a clear French message — its dependents would otherwise be
// cascade-deleted.

export async function deleteClass(formData: FormData): Promise<void> {
  const ctx = await resolveAdmin()
  if (!ctx) redirect('/school/classes')
  const { supabase, schoolId, actor } = ctx!

  const parsed = z.string().uuid().safeParse(formData.get('class_id'))
  if (!parsed.success) redirect('/school/classes')
  const classId = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/classes/${classId}?error=readonly`)
  }

  // Confirm the class belongs to this school.
  const { data: cls } = await supabase
    .from('classes').select('id').eq('id', classId).eq('school_id', schoolId).maybeSingle()
  if (!cls) redirect('/school/classes')

  // Dependency checks (counts only — head requests).
  const [enrollRes, attendanceRes, timetableRes, subjectsRes] = await Promise.all([
    supabase.from('student_class_enrollments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('class_id', classId).eq('status', 'active'),
    supabase.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('class_id', classId),
    supabase.from('timetable_slots').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('class_id', classId),
    supabase.from('class_subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('class_id', classId),
  ])

  if ((enrollRes.count ?? 0) > 0) {
    redirect(`/school/classes/${classId}?error=has_students`)
  }
  if ((attendanceRes.count ?? 0) > 0 || (timetableRes.count ?? 0) > 0 || (subjectsRes.count ?? 0) > 0) {
    redirect(`/school/classes/${classId}?error=in_use`)
  }

  const { error } = await supabase.from('classes').delete().eq('id', classId).eq('school_id', schoolId)
  if (error) {
    logSupabaseError(error, { action: 'deleteClass', schoolId, userId: actor.id, entityIds: { classId } })
    redirect(`/school/classes/${classId}?error=delete`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'class_deleted', resourceType: 'class', resourceId: classId, metadata: {},
  })

  redirect('/school/classes?deleted=1')
}

// ─── Bulk create from a structure template ────────────────────────────────────

export type TemplateState = { errors?: { _form?: string[] } }

async function verifyYear(supabase: ReturnType<typeof createClient>, schoolId: string, yearId: string): Promise<boolean> {
  const { data } = await supabase.from('academic_years').select('id').eq('id', yearId).eq('school_id', schoolId).maybeSingle()
  return !!data
}

export async function createClassesFromTemplate(
  _prevState: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const ctx = await resolveAdmin()
  if (!ctx) return { errors: { _form: ['Non autorisé.'] } }
  const { supabase, schoolId, actor } = ctx

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const yearId = z.string().uuid().safeParse(formData.get('academic_year_id'))
  if (!yearId.success || !(await verifyYear(supabase, schoolId, yearId.data))) {
    return { errors: { _form: ['Veuillez sélectionner une année scolaire valide.'] } }
  }

  const template = getClassTemplate(String(formData.get('template_key') ?? ''))
  if (!template) return { errors: { _form: ['Modèle invalide.'] } }

  // Skip names that already exist for this year (case-insensitive).
  const { data: existing } = await supabase
    .from('classes').select('name').eq('school_id', schoolId).eq('academic_year_id', yearId.data)
  const existingNames = new Set(((existing ?? []) as { name: string }[]).map((c) => c.name.trim().toLowerCase()))

  const toCreate = template.classes.filter((c) => !existingNames.has(c.name.toLowerCase()))
  const skipped = template.classes.length - toCreate.length

  let created = 0
  if (toCreate.length > 0) {
    const rows = toCreate.map((c) => ({
      school_id: schoolId, academic_year_id: yearId.data, name: c.name, level: c.level, section: c.section,
    }))
    const { data, error } = await supabase.from('classes').insert(rows).select('id')
    if (error) {
      return {
        errors: {
          _form: [formatServerActionError(error, {
            action: 'createClassesFromTemplate', schoolId, userId: actor.id,
            entityIds: { template: template.key, count: toCreate.length },
            fallback: 'Erreur lors de la création des classes. Veuillez réessayer.',
          })._form?.[0] ?? 'Erreur lors de la création des classes.'],
        },
      }
    }
    created = (data ?? []).length
    await logAuditEvent(supabase, {
      actorId: actor.id, actorEmail: actor.email, schoolId,
      action: 'classes_bulk_created', resourceType: 'class', resourceId: yearId.data,
      metadata: { source: 'template', template: template.key, created, skipped, academic_year_id: yearId.data },
    })
  }

  redirect(`/school/classes?created=${created}&skipped=${skipped}`)
}

// ─── Import classes from a CSV file ───────────────────────────────────────────
// The whole import is blocked if ANY data row is invalid (the safer choice — no
// partially-correct file is committed). Duplicates (already in the year, or
// repeated within the file) are NOT errors: they are silently skipped and
// reported in the success count.

export type ImportState = {
  errors?: { _form?: string[] }
  rowErrors?: { line: number; message: string }[]
}

export async function importClasses(
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const ctx = await resolveAdmin()
  if (!ctx) return { errors: { _form: ['Non autorisé.'] } }
  const { supabase, schoolId, actor } = ctx

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const yearId = z.string().uuid().safeParse(formData.get('academic_year_id'))
  if (!yearId.success || !(await verifyYear(supabase, schoolId, yearId.data))) {
    return { errors: { _form: ['Veuillez sélectionner une année scolaire valide.'] } }
  }

  const csvText = String(formData.get('csv_text') ?? '')
  if (!csvText.trim()) return { errors: { _form: ['Aucune donnée à importer. Choisissez un fichier CSV.'] } }

  const rows = readClassRows(parseCsv(csvText))
  if (rows.length === 0) return { errors: { _form: ['Le fichier ne contient aucune classe.'] } }

  // Block the whole import on any invalid row.
  const rowErrors = rows.filter((r) => r.error).map((r) => ({ line: r.line, message: `Ligne ${r.line} : ${r.error}` }))
  if (rowErrors.length > 0) {
    return { errors: { _form: ["Le fichier contient des erreurs. Corrigez-les puis réessayez (aucune classe n'a été importée)."] }, rowErrors }
  }

  // Duplicates: skip rows already present this year, and de-dup within the file.
  const { data: existing } = await supabase
    .from('classes').select('name').eq('school_id', schoolId).eq('academic_year_id', yearId.data)
  const seen = new Set(((existing ?? []) as { name: string }[]).map((c) => c.name.trim().toLowerCase()))

  const toCreate: { school_id: string; academic_year_id: string; name: string; level: string | null; section: string | null }[] = []
  let skipped = 0
  for (const r of rows) {
    const key = r.name.toLowerCase()
    if (seen.has(key)) { skipped++; continue }
    seen.add(key)
    toCreate.push({ school_id: schoolId, academic_year_id: yearId.data, name: r.name, level: r.level || null, section: r.section || null })
  }

  let created = 0
  if (toCreate.length > 0) {
    const { data, error } = await supabase.from('classes').insert(toCreate).select('id')
    if (error) {
      return {
        errors: {
          _form: [formatServerActionError(error, {
            action: 'importClasses', schoolId, userId: actor.id,
            entityIds: { count: toCreate.length },
            fallback: "Erreur lors de l'import des classes. Veuillez réessayer.",
          })._form?.[0] ?? "Erreur lors de l'import des classes."],
        },
      }
    }
    created = (data ?? []).length
    await logAuditEvent(supabase, {
      actorId: actor.id, actorEmail: actor.email, schoolId,
      action: 'classes_bulk_created', resourceType: 'class', resourceId: yearId.data,
      metadata: { source: 'import', created, skipped, academic_year_id: yearId.data },
    })
  }

  redirect(`/school/classes?created=${created}&skipped=${skipped}`)
}
