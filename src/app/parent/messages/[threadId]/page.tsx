import { requireParentCtx } from '../../_auth'
import { notFound } from 'next/navigation'
import { loadThreadHeader, loadMessages } from '@/lib/messaging'
import { isSchoolWritable } from '@/lib/tenant'
import { Conversation } from '@/components/messaging/Conversation'
import { replyParent, markReadParent } from '../actions'

export const dynamic = 'force-dynamic'

export default async function ParentThreadPage({ params }: { params: { threadId: string } }) {
  const { supabase, schoolId, parent } = await requireParentCtx()
  const header = await loadThreadHeader(supabase, schoolId, params.threadId)
  if (!header || header.parentId !== parent.id) notFound()

  const messages = await loadMessages(supabase, schoolId, params.threadId, 'parent')
  const locked = !(await isSchoolWritable(supabase, schoolId))

  return (
    <Conversation header={header} messages={messages} otherName={header.teacherName} otherRole="Enseignant"
      backHref="/parent/messages" replyAction={replyParent} markRead={markReadParent} threadId={params.threadId} locked={locked} />
  )
}
