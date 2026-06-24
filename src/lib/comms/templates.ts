// ─── Template rendering (school override → platform default → interpolate) ────

import { createAdminClient } from '@/lib/supabase/admin'
import type { CommChannel } from './types'

function interpolate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

export async function renderTemplate(schoolId: string, key: string, channel: CommChannel, vars: Record<string, string>): Promise<{ subject: string | null; body: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('communication_templates')
    .select('school_id, subject, body')
    .eq('key', key).eq('channel', channel).eq('locale', 'fr').eq('is_active', true)
    .or(`school_id.eq.${schoolId},school_id.is.null`)
  const rows = (data ?? []) as { school_id: string | null; subject: string | null; body: string }[]
  if (rows.length === 0) return null
  const tpl = rows.find((r) => r.school_id === schoolId) ?? rows.find((r) => r.school_id === null) ?? rows[0]
  return { subject: tpl.subject ? interpolate(tpl.subject, vars) : null, body: interpolate(tpl.body, vars) }
}
