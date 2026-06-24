'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'

const empty = (v: unknown) => (v === '' || v == null ? undefined : v)

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  return { supabase, schoolId: (m as { school_id: string }).school_id, actor: user }
}

export type TemplateState = { error?: string }

const SaveSchema = z.object({
  key:     z.string().min(1).max(100),
  channel: z.enum(['in_app', 'email', 'sms', 'whatsapp']),
  subject: z.preprocess(empty, z.string().max(300).optional()),
  body:    z.string().trim().min(1, 'Le contenu est obligatoire.').max(4000),
})

export async function saveTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = SaveSchema.safeParse({ key: formData.get('key'), channel: formData.get('channel'), subject: formData.get('subject'), body: formData.get('body') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const d = parsed.data

  const { data: existing } = await supabase.from('communication_templates').select('id, version')
    .eq('school_id', schoolId).eq('key', d.key).eq('channel', d.channel).eq('locale', 'fr').maybeSingle()
  const ex = existing as { id: string; version: number } | null

  if (ex) {
    await supabase.from('communication_templates').update({ subject: d.subject ?? null, body: d.body, version: ex.version + 1, is_active: true, updated_by: actor.id }).eq('id', ex.id)
  } else {
    await supabase.from('communication_templates').insert({ school_id: schoolId, key: d.key, channel: d.channel, locale: 'fr', subject: d.subject ?? null, body: d.body, updated_by: actor.id })
  }

  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'comms_template_updated', resourceType: 'communication', resourceId: schoolId, metadata: { key: d.key, channel: d.channel } })
  redirect(`/school/communications/templates/${encodeURIComponent(d.key)}?saved=1`)
}

export async function resetTemplate(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  const key = z.string().min(1).safeParse(formData.get('key'))
  const channel = z.enum(['in_app', 'email', 'sms', 'whatsapp']).safeParse(formData.get('channel'))
  if (!key.success || !channel.success) redirect('/school/communications/templates')
  await supabase.from('communication_templates').delete().eq('school_id', schoolId).eq('key', key.data).eq('channel', channel.data).eq('locale', 'fr')
  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'comms_template_updated', resourceType: 'communication', resourceId: schoolId, metadata: { key: key.data, channel: channel.data, reset: true } })
  redirect(`/school/communications/templates/${encodeURIComponent(key.data)}?reset=1`)
}
