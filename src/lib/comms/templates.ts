// ─── Template rendering (locale-aware; school override → platform → fr fallback) ─

import { createAdminClient } from '@/lib/supabase/admin'
import type { CommChannel } from './types'
import { DEFAULT_LOCALE, parseLocale } from '@/lib/i18n/locale'

function interpolate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

// Phase 10F: `locale` selects the language. Resolution priority:
//   school override (locale) > school override (fr) > platform (locale) > platform (fr).
// French remains the canonical fallback so a missing translation never blocks a send.
export async function renderTemplate(schoolId: string, key: string, channel: CommChannel, vars: Record<string, string>, locale: string = DEFAULT_LOCALE): Promise<{ subject: string | null; body: string } | null> {
  const loc = parseLocale(locale)
  const admin = createAdminClient()
  const { data } = await admin.from('communication_templates')
    .select('school_id, subject, body, locale')
    .eq('key', key).eq('channel', channel).eq('is_active', true)
    .in('locale', loc === 'fr' ? ['fr'] : [loc, 'fr'])
    .or(`school_id.eq.${schoolId},school_id.is.null`)
  const rows = (data ?? []) as { school_id: string | null; subject: string | null; body: string; locale: string }[]
  if (rows.length === 0) return null

  const score = (r: { school_id: string | null; locale: string }) =>
    (r.school_id === schoolId ? 2 : 0) + (r.locale === loc ? 1 : 0)
  const tpl = rows.slice().sort((a, b) => score(b) - score(a))[0]
  return { subject: tpl.subject ? interpolate(tpl.subject, vars) : null, body: interpolate(tpl.body, vars) }
}
