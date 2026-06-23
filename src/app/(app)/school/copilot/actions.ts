'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logAuditEvent } from '@/lib/audit'
import { routeIntent } from '@/lib/copilot/intent-router'
import { canAccess } from '@/lib/copilot/permissions'
import { buildContext } from '@/lib/copilot/context-builder'
import { generateAnswer } from '@/lib/copilot/answer-generator'
import type { CopilotAnswer } from '@/lib/copilot/types'

// Read-only. Route → permission check → tenant-scoped context → deterministic
// answer → audit. No writes, no automation, no notifications.
export async function askCopilot(query: string): Promise<CopilotAnswer> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const trimmed = (query ?? '').slice(0, 300)
  const routed = routeIntent(trimmed)

  if (!canAccess('school_admin', routed.intent)) {
    return { intent: routed.intent, title: 'Accès restreint', summary: 'Vous n’êtes pas autorisé à consulter ces informations.', sections: [], links: [] }
  }

  const ctx = await buildContext(supabase, schoolId, routed)
  const answer = generateAnswer(ctx)

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'copilot_query', resourceType: 'school', resourceId: schoolId,
    metadata: { intent: routed.intent, query: trimmed },
  })

  return answer
}
