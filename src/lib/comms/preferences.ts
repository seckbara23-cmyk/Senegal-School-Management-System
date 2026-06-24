// ─── Communication preferences (opt-out model + category defaults) ───────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { CommCategory, CommChannel } from './types'

type Admin = ReturnType<typeof createAdminClient>

// Channels that are ON by default per category. Transactional finance/attendance
// default to every channel; academic + announcements to in-app + email; marketing
// is in-app only (extra channels require explicit opt-in).
export const DEFAULT_CHANNELS: Record<CommCategory, CommChannel[]> = {
  finance:       ['in_app', 'email', 'sms', 'whatsapp'],
  attendance:    ['in_app', 'email', 'sms', 'whatsapp'],
  academic:      ['in_app', 'email'],
  announcements: ['in_app', 'email'],
  marketing:     ['in_app'],
}

// Filter `candidate` channels to those allowed for this recipient+category:
// an explicit preference row wins; otherwise the category default applies.
export async function allowedChannels(admin: Admin, schoolId: string, userId: string, category: CommCategory, candidate: CommChannel[]): Promise<CommChannel[]> {
  const defaults = DEFAULT_CHANNELS[category] ?? ['in_app']
  const { data } = await admin.from('communication_preferences').select('channel, opted_in')
    .eq('school_id', schoolId).eq('user_id', userId).eq('category', category)
  const pref = new Map(((data ?? []) as { channel: CommChannel; opted_in: boolean }[]).map((r) => [r.channel, r.opted_in]))
  return candidate.filter((ch) => (pref.has(ch) ? pref.get(ch)! : defaults.includes(ch)))
}
