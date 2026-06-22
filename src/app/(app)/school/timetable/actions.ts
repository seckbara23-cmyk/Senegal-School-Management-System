'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { notifyTimetableCreated, notifyTimetableUpdated, notifyTimetableDeleted } from '@/lib/notification-events'

// ─── Shared types ─────────────────────────────────────────────────────────────

export type TimetableSlotState = {
  errors?: {
    academic_year_id?: string[]
    class_id?:         string[]
    class_subject_id?: string[]
    teacher_id?:       string[]
    day_of_week?:      string[]
    start_time?:       string[]
    end_time?:         string[]
    room?:             string[]
    notes?:            string[]
    _form?:            string[]
  }
}

const SlotSchema = z.object({
  class_id:         z.string().uuid('Classe invalide.'),
  class_subject_id: z.string().uuid('Matière invalide.'),
  teacher_id:       z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().uuid('Enseignant invalide.').optional()),
  day_of_week:      z.preprocess((v) => parseInt(String(v), 10),
    z.number().int().min(1, 'Jour invalide.').max(7, 'Jour invalide.')),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/, 'Heure de début invalide (HH:MM).'),
  end_time:         z.string().regex(/^\d{2}:\d{2}$/, 'Heure de fin invalide (HH:MM).'),
  room:             z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(100, 'Salle trop longue.').optional()),
  notes:            z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(500, 'Notes trop longues.').optional()),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSchoolAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', userId)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { school_id: string } | null)?.school_id ?? null
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

type SlotTimeRow = { id: string; start_time: string; end_time: string }
function overlaps(rows: SlotTimeRow[], startMin: number, endMin: number, excludeId: string | null): boolean {
  return rows.some((r) => {
    if (excludeId && r.id === excludeId) return false
    // overlap: existing.start < new.end AND existing.end > new.start
    return toMinutes(r.start_time) < endMin && toMinutes(r.end_time) > startMin
  })
}

// Core validation shared by create + update. Returns either an error state or
// the resolved values ready to persist. `slotId` is the row being edited
// (excluded from conflict checks), or null on create.
async function validateSlot(
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  formData: FormData,
  slotId: string | null,
): Promise<
  | { ok: false; state: TimetableSlotState }
  | { ok: true; values: {
      academic_year_id: string; class_id: string; class_subject_id: string
      teacher_id: string | null; day_of_week: number; start_time: string; end_time: string
      room: string | null; notes: string | null
    } }
> {
  const parsed = SlotSchema.safeParse({
    class_id:         formData.get('class_id'),
    class_subject_id: formData.get('class_subject_id'),
    teacher_id:       formData.get('teacher_id'),
    day_of_week:      formData.get('day_of_week'),
    start_time:       formData.get('start_time'),
    end_time:         formData.get('end_time'),
    room:             formData.get('room'),
    notes:            formData.get('notes'),
  })
  if (!parsed.success) {
    return { ok: false, state: { errors: parsed.error.flatten().fieldErrors as TimetableSlotState['errors'] } }
  }
  const d = parsed.data

  const startMin = toMinutes(d.start_time)
  const endMin   = toMinutes(d.end_time)
  if (endMin <= startMin) {
    return { ok: false, state: { errors: { end_time: ["L'heure de fin doit être après l'heure de début."] } } }
  }

  // Class must belong to the school; academic_year is taken from the class.
  const { data: cls } = await supabase
    .from('classes')
    .select('id, academic_year_id')
    .eq('id', d.class_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!cls) return { ok: false, state: { errors: { class_id: ['Classe introuvable.'] } } }
  const academic_year_id = (cls as { academic_year_id: string }).academic_year_id

  // class_subject must belong to this class + school.
  const { data: cs } = await supabase
    .from('class_subjects')
    .select('id, class_id')
    .eq('id', d.class_subject_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!cs || (cs as { class_id: string }).class_id !== d.class_id) {
    return { ok: false, state: { errors: { class_subject_id: ['La matière sélectionnée ne correspond pas à cette classe.'] } } }
  }

  // Teacher: must belong to the school; if the class_subject has an assigned
  // teacher, the chosen teacher must match it.
  let teacher_id: string | null = d.teacher_id ?? null
  if (teacher_id) {
    const { data: teacher } = await supabase
      .from('teachers').select('id').eq('id', teacher_id).eq('school_id', schoolId).maybeSingle()
    if (!teacher) return { ok: false, state: { errors: { teacher_id: ['Enseignant introuvable.'] } } }

    const { data: tsa } = await supabase
      .from('teacher_subject_assignments')
      .select('teacher_id')
      .eq('class_subject_id', d.class_subject_id)
      .eq('school_id', schoolId)
      .maybeSingle()
    const assignedTeacher = (tsa as { teacher_id: string } | null)?.teacher_id ?? null
    if (assignedTeacher && assignedTeacher !== teacher_id) {
      return { ok: false, state: { errors: { teacher_id: ["L'enseignant sélectionné n'est pas affecté à cette matière."] } } }
    }
  }

  // Class conflict: same class, same day, overlapping time.
  const { data: classSlots } = await supabase
    .from('timetable_slots')
    .select('id, start_time, end_time')
    .eq('school_id', schoolId)
    .eq('class_id', d.class_id)
    .eq('day_of_week', d.day_of_week)
  if (overlaps((classSlots ?? []) as SlotTimeRow[], startMin, endMin, slotId)) {
    return { ok: false, state: { errors: { _form: ['Cette classe a déjà un cours sur ce créneau.'] } } }
  }

  // Teacher conflict: same teacher, same day, overlapping time — scoped to the
  // academic year (like the room check below). Different years are not
  // concurrent, so a teacher's slot in another year is never a real conflict.
  if (teacher_id) {
    const { data: teacherSlots } = await supabase
      .from('timetable_slots')
      .select('id, start_time, end_time')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academic_year_id)
      .eq('teacher_id', teacher_id)
      .eq('day_of_week', d.day_of_week)
    if (overlaps((teacherSlots ?? []) as SlotTimeRow[], startMin, endMin, slotId)) {
      return { ok: false, state: { errors: { _form: ['Cet enseignant est déjà occupé sur ce créneau.'] } } }
    }
  }

  // Room conflict: same room (case-insensitive), same day, overlapping time —
  // scoped to the school + academic year. Blank rooms are never in conflict.
  const room = d.room?.trim() ?? ''
  if (room) {
    const { data: roomSlots } = await supabase
      .from('timetable_slots')
      .select('id, start_time, end_time, room')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academic_year_id)
      .eq('day_of_week', d.day_of_week)
      .not('room', 'is', null)
    const sameRoom = ((roomSlots ?? []) as (SlotTimeRow & { room: string | null })[])
      .filter((r) => (r.room ?? '').trim().toLowerCase() === room.toLowerCase())
    if (overlaps(sameRoom, startMin, endMin, slotId)) {
      return { ok: false, state: { errors: { _form: ['Cette salle est déjà occupée sur ce créneau.'] } } }
    }
  }

  return {
    ok: true,
    values: {
      academic_year_id,
      class_id:         d.class_id,
      class_subject_id: d.class_subject_id,
      teacher_id,
      day_of_week:      d.day_of_week,
      start_time:       d.start_time,
      end_time:         d.end_time,
      room:             room || null,
      notes:            d.notes ?? null,
    },
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createTimetableSlot(
  _prevState: TimetableSlotState,
  formData: FormData,
): Promise<TimetableSlotState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const v = await validateSlot(supabase, schoolId, formData, null)
  if (!v.ok) return v.state

  const { data: row, error } = await supabase
    .from('timetable_slots')
    .insert({ school_id: schoolId, ...v.values })
    .select('id')
    .single()

  if (error || !row) {
    logSupabaseError(error, { action: 'createTimetableSlot', schoolId, userId: user.id, entityIds: { class_id: v.values.class_id } })
    return { errors: { _form: ['Erreur lors de la création du créneau. Veuillez réessayer.'] } }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'timetable_slot_created', resourceType: 'timetable_slot', resourceId: (row as { id: string }).id,
    metadata: { class_id: v.values.class_id, class_subject_id: v.values.class_subject_id, day_of_week: v.values.day_of_week, start_time: v.values.start_time, end_time: v.values.end_time },
  })

  // Best-effort: notify the assigned teacher + class students + their parents.
  await notifyTimetableCreated(supabase, {
    schoolId, slotId: (row as { id: string }).id, classId: v.values.class_id, classSubjectId: v.values.class_subject_id,
    teacherId: v.values.teacher_id, dayOfWeek: v.values.day_of_week, startTime: v.values.start_time, endTime: v.values.end_time,
  })

  redirect(`/school/timetable?year=${v.values.academic_year_id}&class=${v.values.class_id}`)
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateTimetableSlot(
  _prevState: TimetableSlotState,
  formData: FormData,
): Promise<TimetableSlotState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const slotId = z.string().uuid().safeParse(formData.get('slot_id'))
  if (!slotId.success) return { errors: { _form: ['Créneau invalide.'] } }

  // Ensure the slot belongs to this school before editing.
  const { data: existing } = await supabase
    .from('timetable_slots').select('id').eq('id', slotId.data).eq('school_id', schoolId).maybeSingle()
  if (!existing) return { errors: { _form: ['Créneau introuvable.'] } }

  const v = await validateSlot(supabase, schoolId, formData, slotId.data)
  if (!v.ok) return v.state

  const { error } = await supabase
    .from('timetable_slots')
    .update(v.values)
    .eq('id', slotId.data)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'updateTimetableSlot', schoolId, userId: user.id, entityIds: { slotId: slotId.data } })
    return { errors: { _form: ['Erreur lors de la mise à jour du créneau. Veuillez réessayer.'] } }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'timetable_slot_updated', resourceType: 'timetable_slot', resourceId: slotId.data,
    metadata: { class_id: v.values.class_id, class_subject_id: v.values.class_subject_id, day_of_week: v.values.day_of_week, start_time: v.values.start_time, end_time: v.values.end_time },
  })

  // Best-effort: notify the assigned teacher + class students + their parents.
  await notifyTimetableUpdated(supabase, {
    schoolId, slotId: slotId.data, classId: v.values.class_id, classSubjectId: v.values.class_subject_id,
    teacherId: v.values.teacher_id, dayOfWeek: v.values.day_of_week, startTime: v.values.start_time, endTime: v.values.end_time,
  })

  redirect(`/school/timetable?year=${v.values.academic_year_id}&class=${v.values.class_id}`)
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTimetableSlot(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const schoolId = await getSchoolAdmin(supabase, user.id)
  if (!schoolId) redirect('/school')

  const slotId = z.string().uuid().safeParse(formData.get('slot_id'))
  if (!slotId.success) redirect('/school/timetable')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect('/school/timetable?error=readonly')
  }

  // Capture context for the redirect + audit + notification before deleting.
  const { data: slot } = await supabase
    .from('timetable_slots')
    .select('id, class_id, academic_year_id, class_subject_id, teacher_id, day_of_week, start_time, end_time')
    .eq('id', slotId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!slot) redirect('/school/timetable')
  const s = slot as {
    id: string; class_id: string; academic_year_id: string; class_subject_id: string
    teacher_id: string | null; day_of_week: number; start_time: string; end_time: string
  }

  const { error } = await supabase
    .from('timetable_slots').delete().eq('id', s.id).eq('school_id', schoolId)
  if (error) {
    logSupabaseError(error, { action: 'deleteTimetableSlot', schoolId, userId: user.id, entityIds: { slotId: s.id } })
    redirect(`/school/timetable?year=${s.academic_year_id}&class=${s.class_id}&error=delete`)
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'timetable_slot_deleted', resourceType: 'timetable_slot', resourceId: s.id,
    metadata: { class_id: s.class_id },
  })

  // Best-effort: notify the assigned teacher + class students + their parents.
  await notifyTimetableDeleted(supabase, {
    schoolId, slotId: s.id, classId: s.class_id, classSubjectId: s.class_subject_id,
    teacherId: s.teacher_id, dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time,
  })

  redirect(`/school/timetable?year=${s.academic_year_id}&class=${s.class_id}`)
}
