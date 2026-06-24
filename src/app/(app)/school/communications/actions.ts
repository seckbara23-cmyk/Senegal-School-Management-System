'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import { logSupabaseError } from '@/lib/errors'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { encryptSecret } from '@/lib/payments/crypto'
import { loadChannelConfig } from '@/lib/comms/config'
import { getCommProvider } from '@/lib/comms/registry'

const empty = (v: unknown) => (v === '' || v == null ? undefined : v)

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  return { supabase, schoolId: (m as { school_id: string }).school_id, actor: user }
}

export type ChannelConfigState = { error?: string }

const ConfigSchema = z.object({
  channel:        z.enum(['email', 'sms', 'whatsapp']),
  provider_code:  z.preprocess(empty, z.string().max(50).optional()),
  is_enabled:     z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  mode:           z.enum(['sandbox', 'live']),
  sender_id:      z.preprocess(empty, z.string().max(200).optional()),
  api_key:        z.preprocess(empty, z.string().max(500).optional()),
  webhook_secret: z.preprocess(empty, z.string().max(500).optional()),
})

export async function saveChannelConfig(_prev: ChannelConfigState, formData: FormData): Promise<ChannelConfigState> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = ConfigSchema.safeParse({
    channel: formData.get('channel'), provider_code: formData.get('provider_code'), is_enabled: formData.get('is_enabled'),
    mode: formData.get('mode'), sender_id: formData.get('sender_id'), api_key: formData.get('api_key'), webhook_secret: formData.get('webhook_secret'),
  })
  if (!parsed.success) return { error: 'Données invalides.' }
  const d = parsed.data

  const { data: existing } = await supabase.from('school_communication_config').select('api_key_enc, webhook_secret_enc').eq('school_id', schoolId).eq('channel', d.channel).maybeSingle()
  const ex = existing as { api_key_enc: string | null; webhook_secret_enc: string | null } | null
  const apiKeyEnc = d.api_key ? encryptSecret(d.api_key) : (ex?.api_key_enc ?? null)
  const secretEnc = d.webhook_secret ? encryptSecret(d.webhook_secret) : (ex?.webhook_secret_enc ?? null)

  const { error } = await supabase.from('school_communication_config').upsert({
    school_id: schoolId, channel: d.channel, provider_code: d.provider_code ?? null, is_enabled: d.is_enabled, mode: d.mode,
    sender_id: d.sender_id ?? null, api_key_enc: apiKeyEnc, webhook_secret_enc: secretEnc, updated_by: actor.id,
  }, { onConflict: 'school_id,channel' })
  if (error) {
    logSupabaseError(error, { action: 'saveChannelConfig', schoolId, userId: actor.id, entityIds: { channel: d.channel } })
    return { error: 'Erreur lors de l’enregistrement.' }
  }

  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'comms_config_updated', resourceType: 'communication', resourceId: schoolId, metadata: { channel: d.channel, enabled: d.is_enabled, mode: d.mode } })
  redirect(`/school/communications?saved=${d.channel}`)
}

const TestSchema = z.object({ channel: z.enum(['email', 'sms', 'whatsapp']), to: z.string().min(3).max(200) })

export async function sendTestMessage(formData: FormData): Promise<void> {
  const { schoolId, actor } = await resolveAdmin()
  const parsed = TestSchema.safeParse({ channel: formData.get('channel'), to: formData.get('to') })
  if (!parsed.success) redirect('/school/communications')
  const { channel, to } = parsed.data

  const config = await loadChannelConfig(schoolId, channel)
  const provider = getCommProvider(channel)
  const admin = createAdminClient()

  if (!config || !provider || !provider.enabled) {
    await admin.from('communication_messages').insert({ school_id: schoolId, channel, recipient_user_id: actor.id, to_address: to, category: 'marketing', template_key: 'test', status: 'skipped', error: !config ? 'channel_not_enabled' : 'provider_not_active', created_by: actor.id })
    redirect('/school/communications?tested=fail')
  }

  const subject = 'Test ScolaTech'
  const body = 'Ceci est un message de test envoyé depuis ScolaTech. Si vous le recevez, le canal est correctement configuré.'
  const { data: msg } = await admin.from('communication_messages').insert({ school_id: schoolId, channel, provider_code: config!.providerCode, recipient_user_id: actor.id, to_address: to, category: 'marketing', template_key: 'test', subject, body_preview: body.slice(0, 200), status: 'queued', created_by: actor.id }).select('id').single()
  const msgId = (msg as { id: string } | null)?.id
  try {
    const res = await provider!.send({ config: config!, to, subject, body, templateKey: 'test', category: 'marketing' })
    if (msgId) await admin.from('communication_messages').update({ status: res.status === 'failed' ? 'failed' : 'sent', provider_message_id: res.providerMessageId, error: res.error ?? null }).eq('id', msgId)
    redirect(`/school/communications?tested=${res.status === 'failed' ? 'fail' : 'ok'}`)
  } catch {
    if (msgId) await admin.from('communication_messages').update({ status: 'failed', error: 'send_exception' }).eq('id', msgId)
    redirect('/school/communications?tested=fail')
  }
}
