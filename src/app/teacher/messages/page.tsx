import { requireTeacherCtx } from '../_auth'
import { loadTeacherThreads } from '@/lib/messaging'
import { ThreadList } from '@/components/messaging/ThreadList'

export const dynamic = 'force-dynamic'

export default async function TeacherMessagesPage() {
  const { supabase, schoolId, teacher } = await requireTeacherCtx()
  const threads = await loadTeacherThreads(supabase, schoolId, teacher.id)
  return (
    <ThreadList threads={threads} basePath="/teacher/messages" otherRole="Parent"
      title="Messages" subtitle="Échangez avec les parents de vos élèves." newHref="/teacher/messages/new" />
  )
}
