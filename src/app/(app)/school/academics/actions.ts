'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { notifyAssessmentCreated } from '@/lib/notification-events'
import { validateExamSessionForAssessment } from '@/lib/exam-sessions'
import { getSubjectTemplate, preloadDefaultSubjectsForSchool } from '@/lib/subject-templates'
import { parseCsv, readSubjectRows } from '@/lib/parse-csv'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSchoolId() {
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
  return { schoolId: (membership as { school_id: string }).school_id, actor: user }
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
  const { schoolId, actor } = await getSchoolId()

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const { data: subject, error } = await supabase.from('subjects').insert({
    school_id:   schoolId,
    name:        name.trim(),
    code:        code?.trim() || null,
    coefficient: coefficient ?? null,
  })
    .select('id')
    .single()

  if (error || !subject) {
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

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_created', resourceType: 'subject', resourceId: (subject as { id: string }).id,
    metadata: { name: name.trim(), code: code?.trim() || null, coefficient: coefficient ?? null },
  })

  redirect('/school/academics/subjects')
}

// ── Update subject ────────────────────────────────────────────────────────────

export type UpdateSubjectState = {
  errors?: { name?: string[]; code?: string[]; coefficient?: string[]; _form?: string[] }
}

export async function updateSubject(
  _prevState: UpdateSubjectState,
  formData: FormData,
): Promise<UpdateSubjectState> {
  const { schoolId, actor } = await getSchoolId()

  const subjectId = z.string().uuid().safeParse(formData.get('subject_id'))
  if (!subjectId.success) return { errors: { _form: ['Identifiant matière invalide.'] } }

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  // Both id and school_id must match — prevents cross-school writes (RLS is the
  // second layer).
  const { error } = await supabase
    .from('subjects')
    .update({
      name:        name.trim(),
      code:        code?.trim() || null,
      coefficient: coefficient ?? null,
    })
    .eq('id', subjectId.data)
    .eq('school_id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'updateSubject',
        schoolId,
        userId: actor.id,
        entityIds: { subjectId: subjectId.data, name },
        constraints: {
          subjects_school_name_unique: { field: 'name', message: 'Une matière avec ce nom existe déjà.' },
        },
        fallback: 'Erreur lors de la mise à jour. Réessayez.',
      }) as UpdateSubjectState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_updated', resourceType: 'subject', resourceId: subjectId.data,
    metadata: { name: name.trim(), code: code?.trim() || null, coefficient: coefficient ?? null },
  })

  redirect('/school/academics/subjects')
}

// ── Delete subject (only when safe) ────────────────────────────────────────────
// A subject can be removed only while it is not assigned to any class. Deleting
// an assigned subject would cascade through class_subjects → timetable slots,
// assessments and grades, so we refuse and ask the admin to detach it first.

export async function deleteSubject(formData: FormData): Promise<void> {
  const { schoolId, actor } = await getSchoolId()

  const parsed = z.string().uuid().safeParse(formData.get('subject_id'))
  if (!parsed.success) redirect('/school/academics/subjects')
  const subjectId = parsed.data
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/academics/subjects/${subjectId}/edit?error=readonly`)
  }

  const { count } = await supabase
    .from('class_subjects')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('subject_id', subjectId)
  if ((count ?? 0) > 0) {
    redirect(`/school/academics/subjects/${subjectId}/edit?error=inuse`)
  }

  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', subjectId)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'deleteSubject', schoolId, userId: actor.id, entityIds: { subjectId } })
    redirect(`/school/academics/subjects/${subjectId}/edit?error=delete`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_deleted', resourceType: 'subject', resourceId: subjectId,
    metadata: {},
  })

  redirect('/school/academics/subjects')
}

// ── Preload default subject catalogue ─────────────────────────────────────────
// One-click button. School is resolved from the authenticated admin context;
// only missing subjects are inserted (case-insensitive), existing ones are
// untouched. Audited.

export async function preloadDefaultSubjects(): Promise<void> {
  const { schoolId, actor } = await getSchoolId()
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect('/school/academics/subjects?error=readonly')
  }

  const res = await preloadDefaultSubjectsForSchool(supabase, schoolId)
  if (res.failed) {
    redirect('/school/academics/subjects?error=preload')
  }
  if (res.created > 0) {
    await logAuditEvent(supabase, {
      actorId: actor.id, actorEmail: actor.email, schoolId,
      action: 'subjects_bulk_created', resourceType: 'subject', resourceId: schoolId,
      metadata: { source: 'preload', created: res.created, skipped: res.skipped },
    })
  }
  redirect(`/school/academics/subjects?loaded=1&created=${res.created}&skipped=${res.skipped}`)
}

// ── Bulk create from a subject template ───────────────────────────────────────

export type SubjectTemplateState = { errors?: { _form?: string[] } }

export async function createSubjectsFromTemplate(
  _prevState: SubjectTemplateState,
  formData: FormData,
): Promise<SubjectTemplateState> {
  const { schoolId, actor } = await getSchoolId()
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const template = getSubjectTemplate(String(formData.get('template_key') ?? ''))
  if (!template) return { errors: { _form: ['Modèle invalide.'] } }

  const { data: existing } = await supabase.from('subjects').select('name').eq('school_id', schoolId)
  const have = new Set(((existing ?? []) as { name: string }[]).map((s) => s.name.trim().toLowerCase()))

  const toCreate = template.subjects.filter((s) => !have.has(s.name.toLowerCase()))
  const skipped = template.subjects.length - toCreate.length

  let created = 0
  if (toCreate.length > 0) {
    const rows = toCreate.map((s) => ({ school_id: schoolId, name: s.name, code: s.code, coefficient: s.coefficient }))
    const { data, error } = await supabase.from('subjects').insert(rows).select('id')
    if (error) {
      return {
        errors: {
          _form: [formatServerActionError(error, {
            action: 'createSubjectsFromTemplate', schoolId, userId: actor.id,
            entityIds: { template: template.key, count: toCreate.length },
            fallback: 'Erreur lors de la création des matières. Veuillez réessayer.',
          })._form?.[0] ?? 'Erreur lors de la création des matières.'],
        },
      }
    }
    created = (data ?? []).length
    await logAuditEvent(supabase, {
      actorId: actor.id, actorEmail: actor.email, schoolId,
      action: 'subjects_bulk_created', resourceType: 'subject', resourceId: schoolId,
      metadata: { source: 'template', template: template.key, created, skipped },
    })
  }

  redirect(`/school/academics/subjects?created=${created}&skipped=${skipped}`)
}

// ── Import subjects from CSV ───────────────────────────────────────────────────
// Blocked entirely if any row is structurally invalid (safer than partial).
// Duplicates (already present, or repeated in-file) are skipped, not errors.

export type SubjectImportState = {
  errors?: { _form?: string[] }
  rowErrors?: { line: number; message: string }[]
}

export async function importSubjectsFromCsv(
  _prevState: SubjectImportState,
  formData: FormData,
): Promise<SubjectImportState> {
  const { schoolId, actor } = await getSchoolId()
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const csvText = String(formData.get('csv_text') ?? '')
  if (!csvText.trim()) return { errors: { _form: ['Aucune donnée à importer. Choisissez un fichier CSV.'] } }

  const rows = readSubjectRows(parseCsv(csvText))
  if (rows.length === 0) return { errors: { _form: ['Le fichier ne contient aucune matière.'] } }

  const rowErrors = rows.filter((r) => r.error).map((r) => ({ line: r.line, message: `Ligne ${r.line} : ${r.error}` }))
  if (rowErrors.length > 0) {
    return { errors: { _form: ["Le fichier contient des erreurs. Corrigez-les puis réessayez (aucune matière n'a été importée)."] }, rowErrors }
  }

  const { data: existing } = await supabase.from('subjects').select('name').eq('school_id', schoolId)
  const seen = new Set(((existing ?? []) as { name: string }[]).map((s) => s.name.trim().toLowerCase()))

  const toCreate: { school_id: string; name: string; code: string | null; coefficient: number | null }[] = []
  let skipped = 0
  for (const r of rows) {
    const key = r.name.toLowerCase()
    if (seen.has(key)) { skipped++; continue }
    seen.add(key)
    const coef = r.coefficient ? Number(r.coefficient.replace(',', '.')) : null
    toCreate.push({ school_id: schoolId, name: r.name, code: r.code || null, coefficient: coef })
  }

  let created = 0
  if (toCreate.length > 0) {
    const { data, error } = await supabase.from('subjects').insert(toCreate).select('id')
    if (error) {
      return {
        errors: {
          _form: [formatServerActionError(error, {
            action: 'importSubjectsFromCsv', schoolId, userId: actor.id,
            entityIds: { count: toCreate.length },
            fallback: "Erreur lors de l'import des matières. Veuillez réessayer.",
          })._form?.[0] ?? "Erreur lors de l'import des matières."],
        },
      }
    }
    created = (data ?? []).length
    await logAuditEvent(supabase, {
      actorId: actor.id, actorEmail: actor.email, schoolId,
      action: 'subjects_bulk_created', resourceType: 'subject', resourceId: schoolId,
      metadata: { source: 'import', created, skipped },
    })
  }

  redirect(`/school/academics/subjects?created=${created}&skipped=${skipped}`)
}

// ── Assign subject to class ───────────────────────────────────────────────────

const AssignSubjectSchema = z.object({
  class_id:   z.string().uuid('Classe invalide.'),
  subject_id: z.string().uuid('Matière invalide.'),
})

export async function assignSubjectToClass(formData: FormData): Promise<void> {
  const { schoolId, actor } = await getSchoolId()

  const parsed = AssignSubjectSchema.safeParse({
    class_id:   formData.get('class_id'),
    subject_id: formData.get('subject_id'),
  })

  if (!parsed.success) redirect('/school/academics/assignments?error=invalid')

  const { class_id, subject_id } = parsed.data
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect('/school/academics/assignments?error=readonly')
  }

  // Verify class belongs to this school and get its academic_year_id
  const [classRes, subjectRes] = await Promise.all([
    supabase.from('classes').select('id, academic_year_id').eq('id', class_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('subjects').select('id').eq('id', subject_id).eq('school_id', schoolId).maybeSingle(),
  ])

  if (!classRes.data || !subjectRes.data) redirect('/school/academics/assignments?error=invalid')

  const academic_year_id = (classRes.data as { id: string; academic_year_id: string }).academic_year_id

  const { data: newLink, error } = await supabase.from('class_subjects').insert({
    school_id:        schoolId,
    class_id,
    subject_id,
    academic_year_id,
  })
    .select('id')
    .single()

  if (error || !newLink) {
    if (error?.code === '23505') redirect('/school/academics/assignments?error=duplicate')
    logSupabaseError(error, { action: 'assignSubjectToClass', schoolId, entityIds: { class_id, subject_id } })
    redirect('/school/academics/assignments?error=server')
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_assigned_to_class', resourceType: 'class_subject', resourceId: (newLink as { id: string }).id,
    metadata: { class_id, subject_id, academic_year_id },
  })

  redirect('/school/academics/assignments')
}

// ── Assign / remove teacher from class subject ────────────────────────────────

const AssignTeacherSchema = z.object({
  class_subject_id: z.string().uuid('Attribution invalide.'),
  teacher_id:       z.string().uuid().optional(),
})

export async function assignTeacher(formData: FormData): Promise<void> {
  const { schoolId, actor } = await getSchoolId()

  // Optional return target so the matrix view can return to itself with its
  // selected year. Allowlisted to two known paths to prevent open redirects.
  const rt = String(formData.get('redirect_to') ?? '')
  const base = rt === '/school/academics/assignments/matrix' ? rt : '/school/academics/assignments'
  const yearRaw = formData.get('year')
  const yq = (typeof yearRaw === 'string' && /^[0-9a-fA-F-]{36}$/.test(yearRaw)) ? `year=${yearRaw}` : ''
  const back = (err?: string): never => {
    const qs = [yq, err ? `error=${err}` : ''].filter(Boolean).join('&')
    redirect(qs ? `${base}?${qs}` : base)
  }

  const parsed = AssignTeacherSchema.safeParse({
    class_subject_id: formData.get('class_subject_id'),
    teacher_id:       formData.get('teacher_id') || undefined,
  })

  // Direct redirect here (not via back()) so TS narrows parsed.success below.
  if (!parsed.success) redirect(yq ? `${base}?${yq}&error=invalid` : `${base}?error=invalid`)

  const { class_subject_id, teacher_id } = parsed.data
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) back('readonly')

  // Verify class_subject belongs to this school
  const { data: cs } = await supabase
    .from('class_subjects')
    .select('id')
    .eq('id', class_subject_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!cs) back('invalid')

  let opError: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null = null
  if (!teacher_id) {
    // Remove assignment
    const { error } = await supabase
      .from('teacher_subject_assignments')
      .delete()
      .eq('class_subject_id', class_subject_id)
      .eq('school_id', schoolId)
    opError = error
  } else {
    // Verify teacher belongs to this school
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id')
      .eq('id', teacher_id)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!teacher) back('invalid')

    const { error } = await supabase.from('teacher_subject_assignments').upsert(
      { school_id: schoolId, teacher_id, class_subject_id },
      { onConflict: 'class_subject_id' },
    )
    opError = error
  }

  if (opError) {
    logSupabaseError(opError, { action: 'assignTeacher', schoolId, entityIds: { class_subject_id, teacher_id: teacher_id ?? null } })
    back('server')
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_assigned_to_subject', resourceType: 'class_subject', resourceId: class_subject_id,
    metadata: { class_subject_id, teacher_id: teacher_id ?? null, unassigned: !teacher_id },
  })

  back()
}

// ── Remove subject from class ─────────────────────────────────────────────────

const RemoveSubjectSchema = z.object({
  class_subject_id: z.string().uuid('Attribution invalide.'),
})

export async function removeSubjectFromClass(formData: FormData): Promise<void> {
  const { schoolId, actor } = await getSchoolId()

  const parsed = RemoveSubjectSchema.safeParse({
    class_subject_id: formData.get('class_subject_id'),
  })

  if (!parsed.success) redirect('/school/academics/assignments?error=invalid')

  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect('/school/academics/assignments?error=readonly')
  }

  const { error } = await supabase
    .from('class_subjects')
    .delete()
    .eq('id', parsed.data.class_subject_id)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'removeSubjectFromClass', schoolId, entityIds: { class_subject_id: parsed.data.class_subject_id } })
    redirect('/school/academics/assignments?error=server')
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_removed_from_class', resourceType: 'class_subject', resourceId: parsed.data.class_subject_id,
    metadata: { class_subject_id: parsed.data.class_subject_id },
  })

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
  const { schoolId, actor } = await getSchoolId()

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  // Verify academic_year belongs to this school
  const { data: year } = await supabase
    .from('academic_years')
    .select('id')
    .eq('id', academic_year_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!year) return { errors: { academic_year_id: ['Année scolaire invalide.'] } }

  const { data: period, error } = await supabase.from('academic_periods').insert({
    school_id:        schoolId,
    academic_year_id,
    name:             name.trim(),
    starts_on:        starts_on || null,
    ends_on:          ends_on   || null,
    is_active,
  })
    .select('id')
    .single()

  if (error || !period) {
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

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'academic_period_created', resourceType: 'academic_period', resourceId: (period as { id: string }).id,
    metadata: { academic_year_id, name: name.trim(), starts_on: starts_on || null, ends_on: ends_on || null, is_active },
  })

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
  exam_session_id: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().uuid('Session d\'examen invalide.').optional()),
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
  const { schoolId, actor } = await getSchoolId()

  const parsed = AssessmentSchema.safeParse({
    class_subject_id:   formData.get('class_subject_id'),
    academic_period_id: formData.get('academic_period_id'),
    title:              formData.get('title'),
    assessment_type:    formData.get('assessment_type'),
    coefficient:        formData.get('coefficient'),
    max_score:          formData.get('max_score'),
    assessment_date:    formData.get('assessment_date') || '',
    exam_session_id:    formData.get('exam_session_id'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { class_subject_id, academic_period_id, title, assessment_type, coefficient, max_score, assessment_date, exam_session_id } = parsed.data
  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  // Verify class_subject and period both belong to this school
  const [csRes, periodRes] = await Promise.all([
    supabase.from('class_subjects').select('id, academic_year_id').eq('id', class_subject_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('academic_periods').select('id').eq('id', academic_period_id).eq('school_id', schoolId).maybeSingle(),
  ])

  if (!csRes.data)     return { errors: { class_subject_id:   ['Attribution invalide.'] } }
  if (!periodRes.data) return { errors: { academic_period_id: ['Période invalide.']     } }

  // Optional exam session — validate ownership, status (draft/active) + year match.
  const sessionCheck = await validateExamSessionForAssessment(
    supabase, schoolId, exam_session_id ?? null,
    (csRes.data as { academic_year_id: string }).academic_year_id,
  )
  if (!sessionCheck.ok) return { errors: { _form: [sessionCheck.message] } }

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
      exam_session_id:    sessionCheck.id,
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

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'assessment_created', resourceType: 'assessment', resourceId: newAssessment.id,
    metadata: { class_subject_id, academic_period_id, title: title.trim(), assessment_type, coefficient, max_score, exam_session_id: sessionCheck.id },
  })

  // Best-effort: notify enrolled students + their parents.
  await notifyAssessmentCreated(supabase, {
    schoolId,
    assessmentId:     newAssessment.id,
    classSubjectId:   class_subject_id,
    academicPeriodId: academic_period_id,
    assessmentDate:   assessment_date || null,
  })

  redirect(`/school/academics/assessments/${newAssessment.id}`)
}

// ── Save grades ───────────────────────────────────────────────────────────────

export async function saveGrades(formData: FormData): Promise<void> {
  const { schoolId, actor } = await getSchoolId()

  const assessmentId = z.string().uuid().safeParse(formData.get('assessment_id'))
  if (!assessmentId.success) redirect('/school/academics/assessments?error=invalid')

  const supabase = createClient()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect('/school/academics/assessments?error=readonly')
  }

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

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'grades_saved', resourceType: 'assessment', resourceId: assessmentId.data,
    metadata: { assessment_id: assessmentId.data, class_id: classId, saved_count: toUpsert.length, cleared_count: toDelete.length, changed_count: toUpsert.length + toDelete.length },
  })

  redirect(`/school/academics/assessments/${assessmentId.data}?saved=1`)
}
