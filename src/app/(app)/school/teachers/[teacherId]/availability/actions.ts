'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable } from '@/lib/tenant'

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

function path(teacherId: string, q?: string): string {
  return `/school/teachers/${teacherId}/availability${q ? `?${q}` : ''}`
}

const AddSchema = z.object({
  teacher_id:  z.string().uuid(),
  day_of_week: z.preprocess((v) => parseInt(String(v), 10), z.number().int().min(1).max(7)),
  start_time:  z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
  end_time:    z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
})

export async function addTeacherAvailability(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  const parsed = AddSchema.safeParse({
    teacher_id:  formData.get('teacher_id'),
    day_of_week: formData.get('day_of_week'),
    start_time:  formData.get('start_time'),
    end_time:    formData.get('end_time'),
  })
  if (!parsed.success) {
    const tid = z.string().uuid().safeParse(formData.get('teacher_id'))
    redirect(tid.success ? path(tid.data, 'error=invalid') : '/school/teachers')
  }
  const d = parsed.data
  if (d.end_time <= d.start_time) redirect(path(d.teacher_id, 'error=order'))
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(path(d.teacher_id, 'error=readonly'))

  // Teacher must belong to this school.
  const { data: teacher } = await supabase
    .from('teachers').select('id').eq('id', d.teacher_id).eq('school_id', schoolId).maybeSingle()
  if (!teacher) redirect('/school/teachers')

  const { error } = await supabase.from('teacher_availability').insert({
    school_id: schoolId, teacher_id: d.teacher_id, day_of_week: d.day_of_week, start_time: d.start_time, end_time: d.end_time,
  })
  if (error) {
    logSupabaseError(error, { action: 'addTeacherAvailability', schoolId, entityIds: { teacher_id: d.teacher_id } })
    redirect(path(d.teacher_id, 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_availability_updated', resourceType: 'teacher', resourceId: d.teacher_id,
    metadata: { op: 'add', day_of_week: d.day_of_week, start_time: d.start_time, end_time: d.end_time },
  })
  redirect(path(d.teacher_id, 'ok=added'))
}

export async function removeTeacherAvailability(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  const availId   = z.string().uuid().safeParse(formData.get('availability_id'))
  const teacherId = z.string().uuid().safeParse(formData.get('teacher_id'))
  if (!availId.success || !teacherId.success) redirect('/school/teachers')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(path(teacherId.data, 'error=readonly'))

  const { error } = await supabase
    .from('teacher_availability').delete()
    .eq('id', availId.data).eq('school_id', schoolId).eq('teacher_id', teacherId.data)
  if (error) {
    logSupabaseError(error, { action: 'removeTeacherAvailability', schoolId, entityIds: { availability_id: availId.data } })
    redirect(path(teacherId.data, 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_availability_updated', resourceType: 'teacher', resourceId: teacherId.data,
    metadata: { op: 'remove', availability_id: availId.data },
  })
  redirect(path(teacherId.data, 'ok=removed'))
}
