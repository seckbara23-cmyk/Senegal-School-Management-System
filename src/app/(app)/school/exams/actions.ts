'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { computeExamResults } from '@/lib/exam-results'
import { notifyExamResultsPublished } from '@/lib/notification-events'

export type ExamSessionState = {
  errors?: {
    academic_year_id?: string[]
    name?:             string[]
    description?:      string[]
    starts_on?:        string[]
    ends_on?:          string[]
    _form?:            string[]
  }
}

const SessionSchema = z.object({
  academic_year_id: z.string().uuid('Année scolaire invalide.'),
  name:             z.string().min(1, 'Le nom est requis.').max(200, 'Nom trop long.'),
  description:      z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(1000, 'Description trop longue.').optional()),
  starts_on:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début invalide (AAAA-MM-JJ).'),
  ends_on:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de fin invalide (AAAA-MM-JJ).'),
})

async function getSchoolAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', userId)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  return (data as { school_id: string } | null)?.school_id ?? null
}

// Returns true if another ACTIVE session in the school overlaps [startsOn, endsOn].
async function hasActiveOverlap(
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  startsOn: string,
  endsOn: string,
  excludeId: string | null,
): Promise<boolean> {
  const { data } = await supabase
    .from('exam_sessions')
    .select('id, starts_on, ends_on')
    .eq('school_id', schoolId)
    .eq('status', 'active')
  type Row = { id: string; starts_on: string; ends_on: string }
  return ((data ?? []) as Row[]).some((r) => {
    if (excludeId && r.id === excludeId) return false
    // inclusive date overlap
    return r.starts_on <= endsOn && r.ends_on >= startsOn
  })
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createExamSession(
  _prevState: ExamSessionState,
  formData: FormData,
): Promise<ExamSessionState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = SessionSchema.safeParse({
    academic_year_id: formData.get('academic_year_id'),
    name:             formData.get('name'),
    description:      formData.get('description'),
    starts_on:        formData.get('starts_on'),
    ends_on:          formData.get('ends_on'),
  })
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as ExamSessionState['errors'] }
  const d = parsed.data

  if (d.ends_on < d.starts_on) {
    return { errors: { ends_on: ['La date de fin doit être après la date de début.'] } }
  }

  // Academic year must belong to this school.
  const { data: year } = await supabase
    .from('academic_years').select('id').eq('id', d.academic_year_id).eq('school_id', schoolId).maybeSingle()
  if (!year) return { errors: { academic_year_id: ['Année scolaire introuvable.'] } }

  const { data: row, error } = await supabase
    .from('exam_sessions')
    .insert({
      school_id:        schoolId,
      academic_year_id: d.academic_year_id,
      name:             d.name.trim(),
      description:      d.description ?? null,
      starts_on:        d.starts_on,
      ends_on:          d.ends_on,
      status:           'draft',
    })
    .select('id')
    .single()

  if (error || !row) {
    logSupabaseError(error, { action: 'createExamSession', schoolId, userId: user.id, entityIds: { name: d.name } })
    return { errors: { _form: ['Erreur lors de la création de la session. Veuillez réessayer.'] } }
  }
  const sessionId = (row as { id: string }).id

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'exam_session_created', resourceType: 'exam_session', resourceId: sessionId,
    metadata: { name: d.name.trim(), academic_year_id: d.academic_year_id, starts_on: d.starts_on, ends_on: d.ends_on },
  })

  redirect(`/school/exams/${sessionId}`)
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateExamSession(
  _prevState: ExamSessionState,
  formData: FormData,
): Promise<ExamSessionState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const sessionId = z.string().uuid().safeParse(formData.get('session_id'))
  if (!sessionId.success) return { errors: { _form: ['Session invalide.'] } }

  const { data: existing } = await supabase
    .from('exam_sessions').select('id, status').eq('id', sessionId.data).eq('school_id', schoolId).maybeSingle()
  if (!existing) return { errors: { _form: ['Session introuvable.'] } }
  const ex = existing as { id: string; status: string }
  if (ex.status === 'archived') return { errors: { _form: ['Une session archivée ne peut pas être modifiée.'] } }

  const parsed = SessionSchema.safeParse({
    academic_year_id: formData.get('academic_year_id'),
    name:             formData.get('name'),
    description:      formData.get('description'),
    starts_on:        formData.get('starts_on'),
    ends_on:          formData.get('ends_on'),
  })
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as ExamSessionState['errors'] }
  const d = parsed.data

  if (d.ends_on < d.starts_on) {
    return { errors: { ends_on: ['La date de fin doit être après la date de début.'] } }
  }

  const { data: year } = await supabase
    .from('academic_years').select('id').eq('id', d.academic_year_id).eq('school_id', schoolId).maybeSingle()
  if (!year) return { errors: { academic_year_id: ['Année scolaire introuvable.'] } }

  // If this session is active, its new dates must not overlap another active one.
  if (ex.status === 'active' && await hasActiveOverlap(supabase, schoolId, d.starts_on, d.ends_on, ex.id)) {
    return { errors: { _form: ["Une session d'examen active existe déjà sur cette période."] } }
  }

  const { error } = await supabase
    .from('exam_sessions')
    .update({
      academic_year_id: d.academic_year_id,
      name:             d.name.trim(),
      description:      d.description ?? null,
      starts_on:        d.starts_on,
      ends_on:          d.ends_on,
    })
    .eq('id', ex.id)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'updateExamSession', schoolId, userId: user.id, entityIds: { sessionId: ex.id } })
    return { errors: { _form: ['Erreur lors de la mise à jour. Veuillez réessayer.'] } }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'exam_session_updated', resourceType: 'exam_session', resourceId: ex.id,
    metadata: { name: d.name.trim(), starts_on: d.starts_on, ends_on: d.ends_on },
  })

  redirect(`/school/exams/${ex.id}`)
}

// ─── Lifecycle transitions (activate / complete / archive) ──────────────────────

export async function setExamSessionStatus(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) redirect('/school')

  const sessionId = z.string().uuid().safeParse(formData.get('session_id'))
  const newStatus = z.enum(['active', 'completed', 'archived']).safeParse(formData.get('new_status'))
  if (!sessionId.success || !newStatus.success) redirect('/school/exams')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/exams/${sessionId.data}?error=readonly`)
  }

  const { data: existing } = await supabase
    .from('exam_sessions').select('id, status, starts_on, ends_on').eq('id', sessionId.data).eq('school_id', schoolId).maybeSingle()
  if (!existing) redirect('/school/exams')
  const ex = existing as { id: string; status: string; starts_on: string; ends_on: string }

  // Validate the transition.
  const target = newStatus.data
  const allowed =
    target === 'active'    ? (ex.status === 'draft' || ex.status === 'completed')
    : target === 'completed' ? (ex.status === 'active')
    : /* archived */          (ex.status !== 'archived')
  if (!allowed) redirect(`/school/exams/${ex.id}?error=transition`)

  // Activating must not overlap another active session.
  if (target === 'active' && await hasActiveOverlap(supabase, schoolId, ex.starts_on, ex.ends_on, ex.id)) {
    redirect(`/school/exams/${ex.id}?error=overlap`)
  }

  const { error } = await supabase
    .from('exam_sessions').update({ status: target }).eq('id', ex.id).eq('school_id', schoolId)
  if (error) {
    logSupabaseError(error, { action: 'setExamSessionStatus', schoolId, userId: user.id, entityIds: { sessionId: ex.id, target } })
    redirect(`/school/exams/${ex.id}?error=server`)
  }

  const action =
    target === 'active'    ? 'exam_session_activated'
    : target === 'completed' ? 'exam_session_completed'
    : 'exam_session_archived'

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action, resourceType: 'exam_session', resourceId: ex.id,
    metadata: { old_status: ex.status, new_status: target },
  })

  redirect(`/school/exams/${ex.id}`)
}

// ─── Result publication (publish / unpublish to parent & student portals) ───────

// Only allow redirecting back to an exam page; otherwise fall back to the
// session results page. Guards against open-redirect via the return_to field.
function safeReturnTo(value: FormDataEntryValue | null, sessionId: string): string {
  const v = typeof value === 'string' ? value : ''
  if (/^\/school\/exams\/[^?#]*(\?[^#]*)?$/.test(v) && !v.includes('//')) return v
  return `/school/exams/${sessionId}/results`
}

function withParam(path: string, key: string, val: string): string {
  return path + (path.includes('?') ? '&' : '?') + `${key}=${val}`
}

export async function publishExamResults(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) redirect('/school')

  const sessionId = z.string().uuid().safeParse(formData.get('session_id'))
  const scope     = z.enum(['session', 'class']).safeParse(formData.get('scope'))
  if (!sessionId.success || !scope.success) redirect('/school/exams')

  const returnTo = safeReturnTo(formData.get('return_to'), sessionId.data)

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(withParam(returnTo, 'error', 'readonly'))
  }

  // Session must exist, be completed, and not archived.
  const { data: sessionData } = await supabase
    .from('exam_sessions')
    .select('id, name, status, academic_year_id')
    .eq('id', sessionId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!sessionData) redirect('/school/exams')
  const session = sessionData as { id: string; name: string; status: string; academic_year_id: string }

  if (session.status === 'archived') redirect(withParam(returnTo, 'error', 'archived'))
  if (session.status !== 'completed') redirect(withParam(returnTo, 'error', 'not_completed'))

  // Resolve scope → class filter.
  let classFilter: string | null = null
  if (scope.data === 'class') {
    const classId = z.string().uuid().safeParse(formData.get('class_id'))
    if (!classId.success) redirect(withParam(returnTo, 'error', 'bad_class'))
    const { data: cls } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId.data)
      .eq('school_id', schoolId)
      .eq('academic_year_id', session.academic_year_id)
      .maybeSingle()
    if (!cls) redirect(withParam(returnTo, 'error', 'bad_class'))
    classFilter = classId.data
  }

  // Compute results for the scope; enforce 100% completion (block on missing).
  const results = await computeExamResults(supabase, schoolId, session.academic_year_id, session.id, classFilter)
  if (results.classes.length === 0) redirect(withParam(returnTo, 'error', 'no_results'))
  if (results.summary.missingGrades > 0) redirect(withParam(returnTo, 'error', 'incomplete'))

  const affectedClassIds = results.classes.map((c) => c.classId)
  const publishedAt = new Date().toISOString()

  // Upsert the publication row (manual select-then-write: the unique guarantee
  // is via two partial indexes, which supabase-js .upsert can't target).
  const existingQuery = supabase
    .from('exam_result_publications')
    .select('id')
    .eq('school_id', schoolId)
    .eq('exam_session_id', session.id)
  const { data: existing } = await (classFilter === null
    ? existingQuery.is('class_id', null)
    : existingQuery.eq('class_id', classFilter)
  ).maybeSingle()

  const writePayload = {
    status:       'published' as const,
    published_at: publishedAt,
    published_by: user.id,
  }

  let writeError = null
  if (existing) {
    const { error } = await supabase
      .from('exam_result_publications')
      .update(writePayload)
      .eq('id', (existing as { id: string }).id)
      .eq('school_id', schoolId)
    writeError = error
  } else {
    const { error } = await supabase
      .from('exam_result_publications')
      .insert({
        school_id:       schoolId,
        exam_session_id: session.id,
        class_id:        classFilter,
        ...writePayload,
      })
    writeError = error
  }

  if (writeError) {
    logSupabaseError(writeError, { action: 'publishExamResults', schoolId, userId: user.id, entityIds: { sessionId: session.id, classFilter } })
    redirect(withParam(returnTo, 'error', 'server'))
  }

  await notifyExamResultsPublished(supabase, {
    schoolId,
    examSessionId: session.id,
    sessionName:   session.name,
    classIds:      affectedClassIds,
    scopeClassId:  classFilter,
    publishedAt,
  })

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'exam_results_published', resourceType: 'exam_session', resourceId: session.id,
    metadata: { scope: scope.data, class_id: classFilter, class_count: affectedClassIds.length, published_at: publishedAt },
  })

  redirect(withParam(returnTo, 'published', '1'))
}

export async function unpublishExamResults(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) redirect('/school')

  const sessionId = z.string().uuid().safeParse(formData.get('session_id'))
  const scope     = z.enum(['session', 'class']).safeParse(formData.get('scope'))
  if (!sessionId.success || !scope.success) redirect('/school/exams')

  const returnTo = safeReturnTo(formData.get('return_to'), sessionId.data)

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(withParam(returnTo, 'error', 'readonly'))
  }

  const { data: sessionData } = await supabase
    .from('exam_sessions')
    .select('id, status')
    .eq('id', sessionId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!sessionData) redirect('/school/exams')
  const session = sessionData as { id: string; status: string }
  if (session.status === 'archived') redirect(withParam(returnTo, 'error', 'archived'))

  let classFilter: string | null = null
  if (scope.data === 'class') {
    const classId = z.string().uuid().safeParse(formData.get('class_id'))
    if (!classId.success) redirect(withParam(returnTo, 'error', 'bad_class'))
    classFilter = classId.data
  }

  const existingQuery = supabase
    .from('exam_result_publications')
    .select('id, status')
    .eq('school_id', schoolId)
    .eq('exam_session_id', session.id)
  const { data: existing } = await (classFilter === null
    ? existingQuery.is('class_id', null)
    : existingQuery.eq('class_id', classFilter)
  ).maybeSingle()

  // Nothing published for this scope → idempotent no-op.
  if (!existing) redirect(withParam(returnTo, 'unpublished', '1'))

  const { error } = await supabase
    .from('exam_result_publications')
    .update({ status: 'unpublished', published_at: null })
    .eq('id', (existing as { id: string }).id)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'unpublishExamResults', schoolId, userId: user.id, entityIds: { sessionId: session.id, classFilter } })
    redirect(withParam(returnTo, 'error', 'server'))
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'exam_results_unpublished', resourceType: 'exam_session', resourceId: session.id,
    metadata: { scope: scope.data, class_id: classFilter },
  })

  redirect(withParam(returnTo, 'unpublished', '1'))
}
