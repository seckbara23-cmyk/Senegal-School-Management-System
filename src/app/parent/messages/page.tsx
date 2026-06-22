import { requireParentCtx } from '../_auth'
import { loadParentThreads } from '@/lib/messaging'
import { ThreadList } from '@/components/messaging/ThreadList'

export const dynamic = 'force-dynamic'

export default async function ParentMessagesPage() {
  const { supabase, schoolId, parent } = await requireParentCtx()
  const threads = await loadParentThreads(supabase, schoolId, parent.id)
  return (
    <ThreadList threads={threads} basePath="/parent/messages" otherRole="Enseignant"
      title="Messages" subtitle="Échangez avec les enseignants de vos enfants." newHref="/parent/messages/new" />
  )
}
