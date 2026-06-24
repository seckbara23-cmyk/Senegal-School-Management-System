'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logAuditEvent } from '@/lib/audit'
import { routeIntent } from '@/lib/copilot/intent-router'
import { canAccess } from '@/lib/copilot/permissions'
import { buildContext } from '@/lib/copilot/context-builder'
import { getCopilotProvider } from '@/lib/copilot/registry'
import { resolveLocale } from '@/lib/i18n/server'
import type { CopilotAnswer } from '@/lib/copilot/types'

// Read-only. Pipeline preserved end-to-end:
//   Intent Router → Permissions → Context Builder → Provider → Response.
// The Context Builder is the ONLY component that touches the database; the
// provider receives the built context and never accesses data directly. No
// writes, no automation, no notifications.
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
  const locale = resolveLocale()

  // 1) Intent Router
  const routed = routeIntent(trimmed)

  // 2) Permissions
  if (!canAccess('school_admin', routed.intent)) {
    return {
      intent: routed.intent, title: 'Accès restreint',
      summary: 'Vous n’êtes pas autorisé à consulter ces informations.', sections: [], links: [],
      meta: { provider: 'deterministic', locale, sources: [], confidence: 'low', generatedAt: new Date().toISOString() },
    }
  }

  // 3) Context Builder (sole database access, tenant-scoped under RLS)
  const ctx = await buildContext(supabase, schoolId, routed, locale)

  // 4) Provider (no DB access — consumes the built context only)
  const provider = getCopilotProvider()
  const answer = await provider.generate({ query: trimmed, routed, context: ctx, locale })

  // 5) Response (audited)
  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'copilot_query', resourceType: 'school', resourceId: schoolId,
    metadata: { intent: routed.intent, query: trimmed, provider: provider.id, confidence: answer.meta?.confidence ?? null },
  })

  return answer
}
