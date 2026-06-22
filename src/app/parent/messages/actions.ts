'use server'

import { requireParentCtx } from '../_auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { sendThreadMessage, markThreadRead, getOrCreateThread } from '@/lib/messaging'

export type MsgState = { error?: string }

export async function markReadParent(threadId: string): Promise<void> {
  const { supabase, schoolId, parent } = await requireParentCtx()
  const { data: t } = await supabase.from('message_threads').select('id').eq('school_id', schoolId).eq('id', threadId).eq('parent_id', parent.id).maybeSingle()
  if (!t) return
  await markThreadRead(supabase, schoolId, threadId, 'parent')
}

const StartSchema = z.object({
  pair:    z.string().regex(/^[0-9a-f-]{36}\|[0-9a-f-]{36}$/i, 'Sélection invalide.'),
  subject: z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(150)),
  body:    z.string().trim().min(1, 'Le message ne peut pas être vide.').max(4000),
})

export async function startThreadParent(_prev: MsgState, formData: FormData): Promise<MsgState> {
  const { supabase, schoolId, userId, parent } = await requireParentCtx()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = StartSchema.safeParse({ pair: formData.get('pair'), subject: formData.get('subject'), body: formData.get('body') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const [studentId, teacherId] = parsed.data.pair.split('|')

  // The student must be linked to this parent.
  const { data: link } = await supabase
    .from('parent_student_links').select('id').eq('school_id', schoolId).eq('parent_id', parent.id).eq('student_id', studentId).maybeSingle()
  if (!link) return { error: "Cet élève n'est pas rattaché à votre compte." }

  // The teacher must teach the student's class.
  if (!(await teacherTeachesStudent(supabase, schoolId, teacherId, studentId))) {
    return { error: "Cet enseignant n'enseigne pas à cet élève." }
  }

  const threadId = await getOrCreateThread(supabase, { schoolId, actorId: userId, parentId: parent.id, teacherId, studentId, subject: parsed.data.subject || null })
  if (!threadId) return { error: "Impossible de démarrer la conversation." }

  const res = await sendThreadMessage(supabase, { schoolId, threadId, senderRole: 'parent', senderUserId: userId, body: parsed.data.body })
  if (res.error) return { error: res.error }

  revalidatePath('/parent/messages')
  redirect(`/parent/messages/${threadId}`)
}

const ReplySchema = z.object({ thread_id: z.string().uuid(), body: z.string().trim().min(1).max(4000) })

export async function replyParent(formData: FormData): Promise<void> {
  const { supabase, schoolId, userId, parent } = await requireParentCtx()
  if (!(await isSchoolWritable(supabase, schoolId))) redirect('/parent/messages?error=locked')

  const parsed = ReplySchema.safeParse({ thread_id: formData.get('thread_id'), body: formData.get('body') })
  if (!parsed.success) redirect('/parent/messages')

  // Ownership: the thread must belong to this parent (defence in depth over RLS).
  const { data: thread } = await supabase
    .from('message_threads').select('id').eq('school_id', schoolId).eq('id', parsed.data.thread_id).eq('parent_id', parent.id).maybeSingle()
  if (!thread) redirect('/parent/messages')

  await sendThreadMessage(supabase, { schoolId, threadId: parsed.data.thread_id, senderRole: 'parent', senderUserId: userId, body: parsed.data.body })
  revalidatePath(`/parent/messages/${parsed.data.thread_id}`)
  redirect(`/parent/messages/${parsed.data.thread_id}`)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function teacherTeachesStudent(supabase: ReturnType<typeof import('@/lib/supabase/server').createClient>, schoolId: string, teacherId: string, studentId: string): Promise<boolean> {
  const { data: enr } = await supabase
    .from('student_class_enrollments').select('class_id')
    .eq('school_id', schoolId).eq('student_id', studentId).eq('status', 'active').limit(1).maybeSingle()
  const classId = (enr as { class_id: string } | null)?.class_id
  if (!classId) return false
  const { data: csIds } = await supabase.from('class_subjects').select('id').eq('school_id', schoolId).eq('class_id', classId)
  const ids = ((csIds ?? []) as { id: string }[]).map((c) => c.id)
  if (ids.length === 0) return false
  const { data: tsa } = await supabase
    .from('teacher_subject_assignments').select('id').eq('school_id', schoolId).eq('teacher_id', teacherId).in('class_subject_id', ids).limit(1).maybeSingle()
  return !!tsa
}
