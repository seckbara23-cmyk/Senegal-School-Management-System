'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { generateTimetable, buildPeriods } from '@/lib/timetable/generator'
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

const toInt = (v: unknown) => (v === '' || v == null ? null : parseInt(String(v), 10))

const ConfigSchema = z.object({
  year_id:        z.string().uuid(),
  days:           z.string(),
  start_time:     z.string().regex(/^\d{2}:\d{2}$/),
  period_minutes: z.preprocess((v) => toInt(v), z.number().int().min(15).max(240)),
  periods_per_day: z.preprocess((v) => toInt(v), z.number().int().min(1).max(14)),
  break_after:    z.preprocess((v) => toInt(v), z.number().int().min(0).max(14).nullable()),
  break_minutes:  z.preprocess((v) => toInt(v), z.number().int().min(0).max(120).nullable()),
})

export type GenerateState = { errors?: { _form?: string[] } }

export async function generateAndSaveTimetable(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const { supabase, schoolId, actor } = await resolveAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = ConfigSchema.safeParse({
    year_id:         formData.get('year_id'),
    days:            formData.get('days'),
    start_time:      formData.get('start_time'),
    period_minutes:  formData.get('period_minutes'),
    periods_per_day: formData.get('periods_per_day'),
    break_after:     formData.get('break_after'),
    break_minutes:   formData.get('break_minutes'),
  })
  if (!parsed.success) return { errors: { _form: ['Configuration invalide.'] } }
  const c = parsed.data

  const days = c.days.split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 7)
  if (days.length === 0) return { errors: { _form: ['Sélectionnez au moins un jour.'] } }

  // Year must belong to this school.
  const { data: year } = await supabase
    .from('academic_years').select('id').eq('id', c.year_id).eq('school_id', schoolId).maybeSingle()
  if (!year) return { errors: { _form: ['Année scolaire introuvable.'] } }

  // Re-run the SAME deterministic generator server-side on fresh data — what the
  // admin previewed is reproduced here (nothing is trusted from the client).
  const data = await loadGenerationData(supabase, schoolId, c.year_id)
  const periods = buildPeriods({
    startTime: c.start_time, periodMinutes: c.period_minutes, periodsPerDay: c.periods_per_day,
    breakAfter: c.break_after, breakMinutes: c.break_minutes,
  })
  const result = generateTimetable({
    grid: { days, periods },
    classSubjects: data.classSubjects,
    availability: data.availability,
    existing: data.existing,
  })

  if (result.slots.length === 0) {
    redirect(`/school/timetable?year=${c.year_id}&generated=0`)
  }

  const insertRows = result.slots.map((s) => ({
    school_id:        schoolId,
    academic_year_id: c.year_id,
    class_id:         s.classId,
    class_subject_id: s.classSubjectId,
    teacher_id:       s.teacherId,
    day_of_week:      s.day,
    start_time:       s.start,
    end_time:         s.end,
  }))

  const { error } = await supabase.from('timetable_slots').insert(insertRows)
  if (error) {
    logSupabaseError(error, { action: 'generateAndSaveTimetable', schoolId, userId: actor.id, entityIds: { year_id: c.year_id, count: insertRows.length } })
    return { errors: { _form: ["Erreur lors de l'enregistrement de l'emploi du temps. Veuillez réessayer."] } }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'timetable_generated', resourceType: 'timetable_slot', resourceId: c.year_id,
    metadata: { year_id: c.year_id, placed: result.stats.placed, unplaced: result.stats.unplaced, days, periods_per_day: c.periods_per_day },
  })

  redirect(`/school/timetable?year=${c.year_id}&generated=${result.slots.length}`)
}
