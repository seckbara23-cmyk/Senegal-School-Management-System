import { requireTeacherCtx } from '../../_auth'
import { notFound } from 'next/navigation'
import { loadThreadHeader, loadMessages } from '@/lib/messaging'
import { isSchoolWritable } from '@/lib/tenant'
import { Conversation } from '@/components/messaging/Conversation'
import { replyTeacher, markReadTeacher } from '../actions'

export const dynamic = 'force-dynamic'

export default async function TeacherThreadPage({ params }: { params: { threadId: string } }) {
  const { supabase, schoolId, teacher } = await requireTeacherCtx()
  const header = await loadThreadHeader(supabase, schoolId, params.threadId)
  if (!header || header.teacherId !== teacher.id) notFound()

  const messages = await loadMessages(supabase, schoolId, params.threadId, 'teacher')
  const locked = !(await isSchoolWritable(supabase, schoolId))

  return (
    <Conversation header={header} messages={messages} otherName={header.parentName} otherRole="Parent"
      backHref="/teacher/messages" replyAction={replyTeacher} markRead={markReadTeacher} threadId={params.threadId} locked={locked} />
  )
}
