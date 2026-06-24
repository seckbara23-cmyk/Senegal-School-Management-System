'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logAuditEvent } from '@/lib/audit'

const CATEGORIES = ['finance', 'attendance', 'academic', 'announcements', 'marketing']
const CHANNELS = ['email', 'sms', 'whatsapp']
const SAFE = /^\/(parent|teacher|student)\//

export async function saveCommPreferences(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: m } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/dashboard')
  const schoolId = (m as { school_id: string }).school_id

  const rows = CATEGORIES.flatMap((category) => CHANNELS.map((channel) => ({
    school_id: schoolId, user_id: user.id, category, channel, opted_in: formData.get(`${category}_${channel}`) === 'on',
  })))
  await supabase.from('communication_preferences').upsert(rows, { onConflict: 'school_id,user_id,category,channel' })

  await logAuditEvent(supabase, { actorId: user.id, actorEmail: user.email, schoolId, action: 'comms_preferences_updated', resourceType: 'communication', resourceId: user.id, metadata: {} })

  const redirectToRaw = String(formData.get('redirect_to') ?? '')
  const redirectTo = SAFE.test(redirectToRaw) ? redirectToRaw : '/dashboard'
  redirect(`${redirectTo}?prefs=1`)
}
