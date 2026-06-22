'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable } from '@/lib/tenant'

// Class-centric management of class_subjects + their (optional) teacher. Mirrors
// the academics/assignments actions but scopes everything to one class and
// returns to /school/classes/[classId]/subjects. Reuses the same audit action
// names so the audit viewer labels them. Tenant isolation: every read/write is
// filtered by the server-resolved school_id; ids from the form are verified to
// belong to the school before use.

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  return { supabase, schoolId: (membership as { school_id: string }).school_id, actor: user }
}

function subjectsPath(classId: string, param?: string): string {
  return `/school/classes/${classId}/subjects${param ? `?${param}` : ''}`
}

// ── Add a subject to the class ────────────────────────────────────────────────

const AddSchema = z.object({
  class_id:   z.string().uuid(),
  subject_id: z.string().uuid(),
})

export async function addClassSubject(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()

  const parsed = AddSchema.safeParse({
    class_id:   formData.get('class_id'),
    subject_id: formData.get('subject_id'),
  })
  if (!parsed.success) redirect('/school/classes')
  const { class_id, subject_id } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) redirect(subjectsPath(class_id, 'error=readonly'))

  // Class + subject must belong to this school. The class carries the year.
  const [classRes, subjectRes] = await Promise.all([
    supabase.from('classes').select('id, academic_year_id').eq('id', class_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('subjects').select('id').eq('id', subject_id).eq('school_id', schoolId).maybeSingle(),
  ])
  if (!classRes.data) redirect('/school/classes')
  if (!subjectRes.data) redirect(subjectsPath(class_id, 'error=invalid'))

  const academic_year_id = (classRes.data as { academic_year_id: string }).academic_year_id

  const { data: newLink, error } = await supabase
    .from('class_subjects')
    .insert({ school_id: schoolId, class_id, subject_id, academic_year_id })
    .select('id').single()

  if (error || !newLink) {
    if (error?.code === '23505') redirect(subjectsPath(class_id, 'error=duplicate'))  // UNIQUE(class_id, subject_id)
    logSupabaseError(error, { action: 'addClassSubject', schoolId, entityIds: { class_id, subject_id } })
    redirect(subjectsPath(class_id, 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_assigned_to_class', resourceType: 'class_subject', resourceId: (newLink as { id: string }).id,
    metadata: { class_id, subject_id, academic_year_id },
  })

  redirect(subjectsPath(class_id, 'ok=added'))
}

// ── Assign / unassign the teacher for a class-subject ─────────────────────────

const TeacherSchema = z.object({
  class_id:         z.string().uuid(),
  class_subject_id: z.string().uuid(),
  teacher_id:       z.string().uuid().optional(),
})

export async function setClassSubjectTeacher(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()

  const parsed = TeacherSchema.safeParse({
    class_id:         formData.get('class_id'),
    class_subject_id: formData.get('class_subject_id'),
    teacher_id:       formData.get('teacher_id') || undefined,
  })
  if (!parsed.success) {
    const cid = z.string().uuid().safeParse(formData.get('class_id'))
    redirect(cid.success ? subjectsPath(cid.data, 'error=invalid') : '/school/classes')
  }
  const { class_id, class_subject_id, teacher_id } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) redirect(subjectsPath(class_id, 'error=readonly'))

  // The class_subject must belong to this school AND this class.
  const { data: cs } = await supabase
    .from('class_subjects').select('id')
    .eq('id', class_subject_id).eq('school_id', schoolId).eq('class_id', class_id).maybeSingle()
  if (!cs) redirect(subjectsPath(class_id, 'error=invalid'))

  let opError: { code?: string | null } | null = null
  if (!teacher_id) {
    const { error } = await supabase
      .from('teacher_subject_assignments').delete()
      .eq('class_subject_id', class_subject_id).eq('school_id', schoolId)
    opError = error
  } else {
    const { data: teacher } = await supabase
      .from('teachers').select('id').eq('id', teacher_id).eq('school_id', schoolId).maybeSingle()
    if (!teacher) redirect(subjectsPath(class_id, 'error=invalid'))
    // UNIQUE(class_subject_id) → one teacher per class-subject.
    const { error } = await supabase
      .from('teacher_subject_assignments')
      .upsert({ school_id: schoolId, teacher_id, class_subject_id }, { onConflict: 'class_subject_id' })
    opError = error
  }

  if (opError) {
    logSupabaseError(opError, { action: 'setClassSubjectTeacher', schoolId, entityIds: { class_subject_id, teacher_id: teacher_id ?? null } })
    redirect(subjectsPath(class_id, 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_assigned_to_subject', resourceType: 'class_subject', resourceId: class_subject_id,
    metadata: { class_subject_id, teacher_id: teacher_id ?? null, unassigned: !teacher_id },
  })

  redirect(subjectsPath(class_id, 'ok=teacher'))
}

// ── Remove a subject from the class ───────────────────────────────────────────

const RemoveSchema = z.object({
  class_id:         z.string().uuid(),
  class_subject_id: z.string().uuid(),
})

export async function removeClassSubject(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()

  const parsed = RemoveSchema.safeParse({
    class_id:         formData.get('class_id'),
    class_subject_id: formData.get('class_subject_id'),
  })
  if (!parsed.success) redirect('/school/classes')
  const { class_id, class_subject_id } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) redirect(subjectsPath(class_id, 'error=readonly'))

  // Guard against destructive cascades: class_subjects is referenced ON DELETE
  // CASCADE by timetable_slots AND assessments (→ grades). Refuse removal while
  // either exists so grades/report cards are never silently destroyed.
  const [slotRes, assessRes] = await Promise.all([
    supabase.from('timetable_slots').select('id', { count: 'exact', head: true }).eq('class_subject_id', class_subject_id).eq('school_id', schoolId),
    supabase.from('assessments').select('id', { count: 'exact', head: true }).eq('class_subject_id', class_subject_id).eq('school_id', schoolId),
  ])
  if ((slotRes.count ?? 0) > 0 || (assessRes.count ?? 0) > 0) {
    redirect(subjectsPath(class_id, 'error=in_use'))
  }

  const { error } = await supabase
    .from('class_subjects').delete()
    .eq('id', class_subject_id).eq('school_id', schoolId).eq('class_id', class_id)

  if (error) {
    logSupabaseError(error, { action: 'removeClassSubject', schoolId, entityIds: { class_subject_id } })
    redirect(subjectsPath(class_id, error.code === '23503' ? 'error=in_use' : 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'subject_removed_from_class', resourceType: 'class_subject', resourceId: class_subject_id,
    metadata: { class_subject_id, class_id },
  })

  redirect(subjectsPath(class_id, 'ok=removed'))
}

// ── Set weekly hours for a class-subject (used by the timetable generator) ─────

const HoursSchema = z.object({
  class_id:         z.string().uuid(),
  class_subject_id: z.string().uuid(),
  hours_per_week:   z.preprocess((v) => parseInt(String(v), 10), z.number().int().min(0).max(40)),
})

export async function setClassSubjectHours(formData: FormData): Promise<void> {
  const { supabase, schoolId } = await resolveAdmin()

  const parsed = HoursSchema.safeParse({
    class_id:         formData.get('class_id'),
    class_subject_id: formData.get('class_subject_id'),
    hours_per_week:   formData.get('hours_per_week'),
  })
  if (!parsed.success) {
    const cid = z.string().uuid().safeParse(formData.get('class_id'))
    redirect(cid.success ? subjectsPath(cid.data, 'error=invalid') : '/school/classes')
  }
  const { class_id, class_subject_id, hours_per_week } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) redirect(subjectsPath(class_id, 'error=readonly'))

  const { error } = await supabase
    .from('class_subjects').update({ hours_per_week })
    .eq('id', class_subject_id).eq('school_id', schoolId).eq('class_id', class_id)

  if (error) {
    logSupabaseError(error, { action: 'setClassSubjectHours', schoolId, entityIds: { class_subject_id } })
    redirect(subjectsPath(class_id, 'error=server'))
  }

  redirect(subjectsPath(class_id, 'ok=hours'))
}
