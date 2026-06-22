'use server'

import { requireTeacherCtx } from '../_auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { sendThreadMessage, markThreadRead, getOrCreateThread } from '@/lib/messaging'

export type MsgState = { error?: string }

export async function markReadTeacher(threadId: string): Promise<void> {
  const { supabase, schoolId, teacher } = await requireTeacherCtx()
  const { data: t } = await supabase.from('message_threads').select('id').eq('school_id', schoolId).eq('id', threadId).eq('teacher_id', teacher.id).maybeSingle()
  if (!t) return
  await markThreadRead(supabase, schoolId, threadId, 'teacher')
}

const StartSchema = z.object({
  pair:    z.string().regex(/^[0-9a-f-]{36}\|[0-9a-f-]{36}$/i, 'Sélection invalide.'),
  subject: z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(150)),
  body:    z.string().trim().min(1, 'Le message ne peut pas être vide.').max(4000),
})

export async function startThreadTeacher(_prev: MsgState, formData: FormData): Promise<MsgState> {
  const { supabase, schoolId, userId, teacher, assignedClassSubjectIds } = await requireTeacherCtx()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = StartSchema.safeParse({ pair: formData.get('pair'), subject: formData.get('subject'), body: formData.get('body') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const [studentId, parentId] = parsed.data.pair.split('|')

  if (!(await teacherTeachesStudent(supabase, schoolId, assignedClassSubjectIds, studentId))) {
    return { error: "Vous n'enseignez pas à cet élève." }
  }
  const { data: link } = await supabase
    .from('parent_student_links').select('id').eq('school_id', schoolId).eq('parent_id', parentId).eq('student_id', studentId).maybeSingle()
  if (!link) return { error: "Ce parent n'est pas rattaché à cet élève." }

  const threadId = await getOrCreateThread(supabase, { schoolId, actorId: userId, parentId, teacherId: teacher.id, studentId, subject: parsed.data.subject || null })
  if (!threadId) return { error: 'Impossible de démarrer la conversation.' }

  const res = await sendThreadMessage(supabase, { schoolId, threadId, senderRole: 'teacher', senderUserId: userId, body: parsed.data.body })
  if (res.error) return { error: res.error }

  revalidatePath('/teacher/messages')
  redirect(`/teacher/messages/${threadId}`)
}

const ReplySchema = z.object({ thread_id: z.string().uuid(), body: z.string().trim().min(1).max(4000) })

export async function replyTeacher(formData: FormData): Promise<void> {
  const { supabase, schoolId, userId, teacher } = await requireTeacherCtx()
  if (!(await isSchoolWritable(supabase, schoolId))) redirect('/teacher/messages?error=locked')

  const parsed = ReplySchema.safeParse({ thread_id: formData.get('thread_id'), body: formData.get('body') })
  if (!parsed.success) redirect('/teacher/messages')

  const { data: thread } = await supabase
    .from('message_threads').select('id').eq('school_id', schoolId).eq('id', parsed.data.thread_id).eq('teacher_id', teacher.id).maybeSingle()
  if (!thread) redirect('/teacher/messages')

  await sendThreadMessage(supabase, { schoolId, threadId: parsed.data.thread_id, senderRole: 'teacher', senderUserId: userId, body: parsed.data.body })
  revalidatePath(`/teacher/messages/${parsed.data.thread_id}`)
  redirect(`/teacher/messages/${parsed.data.thread_id}`)
}

async function teacherTeachesStudent(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createClient>,
  schoolId: string, assignedClassSubjectIds: string[], studentId: string,
): Promise<boolean> {
  if (assignedClassSubjectIds.length === 0) return false
  const { data: enr } = await supabase
    .from('student_class_enrollments').select('class_id')
    .eq('school_id', schoolId).eq('student_id', studentId).eq('status', 'active').limit(1).maybeSingle()
  const classId = (enr as { class_id: string } | null)?.class_id
  if (!classId) return false
  const { data: cs } = await supabase.from('class_subjects').select('id').eq('school_id', schoolId).eq('class_id', classId)
  const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id)
  return ids.some((id) => assignedClassSubjectIds.includes(id))
}
