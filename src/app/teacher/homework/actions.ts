'use server'

import { requireTeacherCtx } from '../_auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { notifyHomeworkAssigned } from '@/lib/notification-events'

export type HomeworkState = { error?: string }

const CreateSchema = z.object({
  class_subject_id: z.string().uuid('Matière invalide.'),
  title:            z.string().trim().min(1, 'Le titre est obligatoire.').max(200, 'Titre trop long.'),
  description:      z.preprocess((v) => (v == null ? '' : v), z.string().max(4000, 'Description trop longue.')),
  due_date:         z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.').nullable()),
})

export async function createHomework(_prev: HomeworkState, formData: FormData): Promise<HomeworkState> {
  const { supabase, schoolId, teacher, userId, assignedClassSubjectIds } = await requireTeacherCtx()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = CreateSchema.safeParse({
    class_subject_id: formData.get('class_subject_id'),
    title:            formData.get('title'),
    description:      formData.get('description'),
    due_date:         formData.get('due_date'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const d = parsed.data

  if (!assignedClassSubjectIds.includes(d.class_subject_id)) {
    return { error: "Vous n'êtes pas assigné à cette matière." }
  }

  // Derive class + academic year from the class-subject (tenant-scoped).
  const { data: cs } = await supabase
    .from('class_subjects').select('class_id, academic_year_id')
    .eq('id', d.class_subject_id).eq('school_id', schoolId).maybeSingle()
  const csRow = cs as { class_id: string; academic_year_id: string } | null
  if (!csRow) return { error: 'Matière introuvable.' }

  const { data: inserted, error } = await supabase.from('homework').insert({
    school_id: schoolId, class_id: csRow.class_id, class_subject_id: d.class_subject_id,
    teacher_id: teacher.id, academic_year_id: csRow.academic_year_id,
    title: d.title, description: d.description || null, due_date: d.due_date,
  }).select('id').single()

  if (error || !inserted) {
    logSupabaseError(error, { action: 'createHomework', schoolId, userId })
    return { error: "Erreur lors de l'enregistrement du devoir. Veuillez réessayer." }
  }

  const homeworkId = (inserted as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: userId, schoolId, action: 'homework_created', resourceType: 'homework', resourceId: homeworkId,
    metadata: { class_id: csRow.class_id, class_subject_id: d.class_subject_id, title: d.title, due_date: d.due_date },
  })
  await notifyHomeworkAssigned(supabase, {
    schoolId, homeworkId, classId: csRow.class_id, classSubjectId: d.class_subject_id, title: d.title, dueDate: d.due_date,
  })

  revalidatePath('/teacher/homework')
  redirect('/teacher/homework?created=1')
}

export async function deleteHomework(formData: FormData): Promise<void> {
  const { supabase, schoolId, userId, assignedClassSubjectIds } = await requireTeacherCtx()
  if (!(await isSchoolWritable(supabase, schoolId))) redirect('/teacher/homework?error=locked')

  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success || assignedClassSubjectIds.length === 0) redirect('/teacher/homework')

  const { error } = await supabase.from('homework').delete()
    .eq('id', id.data).eq('school_id', schoolId).in('class_subject_id', assignedClassSubjectIds)
  if (error) {
    logSupabaseError(error, { action: 'deleteHomework', schoolId, userId, entityIds: { id: id.data } })
    redirect('/teacher/homework?error=delete')
  }

  await logAuditEvent(supabase, { actorId: userId, schoolId, action: 'homework_deleted', resourceType: 'homework', resourceId: id.data })
  revalidatePath('/teacher/homework')
  redirect('/teacher/homework?deleted=1')
}
