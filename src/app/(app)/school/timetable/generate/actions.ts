'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { validateTimetable, type CheckSlot } from '@/lib/timetable/validator'
import { loadGenerationData } from './_data'

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  return { supabase, schoolId: (m as { school_id: string }).school_id, actor: user }
}

export type GenerateState = { errors?: { _form?: string[] } }

// ─── Save the (possibly hand-edited) proposed timetable ────────────────────────
// The generator runs only in the browser to seed the editor; the admin can then
// drag/move/delete lessons. This action accepts the FINAL slots and re-validates
// them authoritatively — ownership (every class-subject/teacher belongs to the
// school) AND conflict-free (reuses validator.ts) — before inserting. Nothing is
// trusted from the client. Refuses to write when the timetable is locked.

const SlotSchema = z.object({
  classSubjectId: z.string().uuid(),
  classId:        z.string().uuid(),
  teacherId:      z.string().uuid().nullable(),
  day:            z.number().int().min(1).max(7),
  start:          z.string().regex(/^\d{2}:\d{2}$/),
  end:            z.string().regex(/^\d{2}:\d{2}$/),
})

export async function saveTimetableSlots(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const yearId = z.string().uuid().safeParse(formData.get('year_id'))
  if (!yearId.success) return { errors: { _form: ['Année invalide.'] } }

  let raw: unknown
  try { raw = JSON.parse(String(formData.get('slots') ?? '[]')) } catch { return { errors: { _form: ['Données invalides.'] } } }
  const parsed = z.array(SlotSchema).max(3000).safeParse(raw)
  if (!parsed.success) return { errors: { _form: ['Créneaux invalides.'] } }
  const slots = parsed.data
  if (slots.length === 0) return { errors: { _form: ['Aucun créneau à enregistrer.'] } }

  // Year must belong to this school.
  const { data: year } = await supabase
    .from('academic_years').select('id').eq('id', yearId.data).eq('school_id', schoolId).maybeSingle()
  if (!year) return { errors: { _form: ['Année scolaire introuvable.'] } }

  // Lock check.
  const { data: statusRow } = await supabase
    .from('timetable_status').select('status').eq('school_id', schoolId).eq('academic_year_id', yearId.data).maybeSingle()
  if ((statusRow as { status: string } | null)?.status === 'locked') {
    return { errors: { _form: ['Cet emploi du temps est verrouillé. Déverrouillez-le pour le modifier.'] } }
  }

  // Ownership: each class-subject must belong to this school+year+class; each
  // teacher (if set) must belong to this school.
  const data = await loadGenerationData(supabase, schoolId, yearId.data)
  const csById = new Map(data.classSubjects.map((cs) => [cs.classSubjectId, cs]))
  const teacherIds = new Set(data.teachers.map((t) => t.id))
  for (const s of slots) {
    const cs = csById.get(s.classSubjectId)
    if (!cs || cs.classId !== s.classId) return { errors: { _form: ['Une matière ne correspond pas à sa classe.'] } }
    if (s.teacherId && !teacherIds.has(s.teacherId)) return { errors: { _form: ['Un enseignant est introuvable.'] } }
    if (s.end <= s.start) return { errors: { _form: ['Heures de créneau invalides.'] } }
  }

  // Conflict re-validation against EXISTING slots + the proposed set.
  const existingChecks: CheckSlot[] = data.existing.map((e) => ({ classId: e.classId, classSubjectId: e.classSubjectId, teacherId: e.teacherId, day: e.day, start: e.start, end: e.end }))
  const proposed: CheckSlot[] = slots.map((s) => ({ classId: s.classId, classSubjectId: s.classSubjectId, teacherId: s.teacherId, day: s.day, start: s.start, end: s.end }))
  const v = validateTimetable([...existingChecks, ...proposed], data.availability)
  if (v.counts.total > 0) {
    return { errors: { _form: ["L'emploi du temps contient des conflits. Corrigez-les avant d'enregistrer."] } }
  }

  const insertRows = slots.map((s) => ({
    school_id: schoolId, academic_year_id: yearId.data, class_id: s.classId, class_subject_id: s.classSubjectId,
    teacher_id: s.teacherId, day_of_week: s.day, start_time: s.start, end_time: s.end,
  }))
  const { error } = await supabase.from('timetable_slots').insert(insertRows)
  if (error) {
    logSupabaseError(error, { action: 'saveTimetableSlots', schoolId, userId: actor.id, entityIds: { year_id: yearId.data, count: insertRows.length } })
    return { errors: { _form: ["Erreur lors de l'enregistrement. Veuillez réessayer."] } }
  }

  // Ensure a status row exists (defaults to draft); never downgrade an existing one.
  await supabase.from('timetable_status')
    .upsert({ school_id: schoolId, academic_year_id: yearId.data, updated_by: actor.id }, { onConflict: 'school_id,academic_year_id', ignoreDuplicates: true })

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'timetable_generated', resourceType: 'timetable_slot', resourceId: yearId.data,
    metadata: { year_id: yearId.data, saved: insertRows.length, edited: true },
  })

  redirect(`/school/timetable?year=${yearId.data}&generated=${insertRows.length}`)
}

// ─── Status transitions (draft / published / locked) ───────────────────────────

export async function setTimetableStatus(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()

  const yearId = z.string().uuid().safeParse(formData.get('year_id'))
  const status = z.enum(['draft', 'published', 'locked']).safeParse(formData.get('status'))
  if (!yearId.success || !status.success) redirect('/school/timetable')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/timetable?year=${yearId.data}&error=readonly`)

  const { data: year } = await supabase
    .from('academic_years').select('id').eq('id', yearId.data).eq('school_id', schoolId).maybeSingle()
  if (!year) redirect('/school/timetable')

  const { error } = await supabase.from('timetable_status').upsert(
    { school_id: schoolId, academic_year_id: yearId.data, status: status.data, updated_by: actor.id },
    { onConflict: 'school_id,academic_year_id' },
  )
  if (error) {
    logSupabaseError(error, { action: 'setTimetableStatus', schoolId, entityIds: { year_id: yearId.data, status: status.data } })
    redirect(`/school/timetable?year=${yearId.data}&error=status`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'timetable_status_changed', resourceType: 'timetable_slot', resourceId: yearId.data,
    metadata: { year_id: yearId.data, status: status.data },
  })

  redirect(`/school/timetable?year=${yearId.data}&status_ok=${status.data}`)
}
