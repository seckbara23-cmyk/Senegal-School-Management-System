// ─── Communication dispatcher (server-only, service-role) ─────────────────────
//
// One entry point used by event helpers and the broadcast composer. In-app is the
// DEFAULT channel and always fires (via the existing notifications); email/SMS/
// WhatsApp fan out only when the channel is enabled for the school AND the
// recipient's preferences allow it. Best-effort: never throws, never blocks the
// triggering action. Every external send is logged to communication_messages.

import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { loadChannelConfig } from './config'
import { renderTemplate } from './templates'
import { allowedChannels } from './preferences'
import { getCommProvider } from './registry'
import type { DispatchInput, ExternalChannel, RecipientContact } from './types'

type Admin = ReturnType<typeof createAdminClient>

async function logMessage(admin: Admin, input: DispatchInput, channel: ExternalChannel, providerCode: string, r: RecipientContact, to: string, fields: { status: string; subject?: string | null; bodyPreview?: string | null; providerMessageId?: string | null; error?: string | null; cost?: number | null }): Promise<string | null> {
  const { data } = await admin.from('communication_messages').insert({
    school_id: input.schoolId, channel, provider_code: providerCode, recipient_user_id: r.userId, to_address: to,
    category: input.category, template_key: input.templateKey, subject: fields.subject ?? null, body_preview: fields.bodyPreview ?? null,
    status: fields.status, provider_message_id: fields.providerMessageId ?? null, error: fields.error ?? null, cost_estimate: fields.cost ?? null,
    related_type: input.related?.type ?? null, related_id: input.related?.id ?? null, created_by: input.actorId ?? null,
  }).select('id').single()
  return (data as { id: string } | null)?.id ?? null
}

export async function dispatch(input: DispatchInput): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1) In-app (default channel) — via the existing notifications table.
    if (input.inApp) {
      const ids = Array.from(new Set(input.recipients.map((r) => r.userId).filter((x): x is string => !!x)))
      await Promise.all(ids.map((userId) => createNotification(admin, { userId, type: input.inApp!.type, title: input.inApp!.title, body: input.inApp!.body, schoolId: input.schoolId, metadata: input.inApp!.metadata })))
    }

    // 2) External channels — email → SMS → WhatsApp.
    const channels: ExternalChannel[] = ['email', 'sms', 'whatsapp']
    for (const ch of channels) {
      const config = await loadChannelConfig(input.schoolId, ch)
      if (!config) continue // channel not enabled for this school
      const provider = getCommProvider(ch)

      for (const r of input.recipients) {
        if (!r.userId) continue
        const to = ch === 'email' ? r.email : r.phone
        if (!to) continue

        const allowed = await allowedChannels(admin, input.schoolId, r.userId, input.category, [ch])
        if (allowed.length === 0) { await logMessage(admin, input, ch, config.providerCode, r, to, { status: 'skipped', error: 'opted_out' }); continue }

        const tpl = await renderTemplate(input.schoolId, input.templateKey, ch, { ...input.vars, name: r.name })
        if (!tpl) { await logMessage(admin, input, ch, config.providerCode, r, to, { status: 'skipped', error: 'no_template' }); continue }

        if (!provider || !provider.enabled) { await logMessage(admin, input, ch, config.providerCode, r, to, { status: 'skipped', subject: tpl.subject, bodyPreview: tpl.body.slice(0, 200), error: 'channel_not_configured' }); continue }

        const msgId = await logMessage(admin, input, ch, config.providerCode, r, to, { status: 'queued', subject: tpl.subject, bodyPreview: tpl.body.slice(0, 200) })
        try {
          const res = await provider.send({ config, to, subject: tpl.subject, body: tpl.body, templateKey: input.templateKey, category: input.category })
          if (msgId) await admin.from('communication_messages').update({ status: res.status === 'failed' ? 'failed' : 'sent', provider_message_id: res.providerMessageId, error: res.error ?? null, cost_estimate: res.cost ?? null }).eq('id', msgId)
        } catch (e) {
          if (msgId) await admin.from('communication_messages').update({ status: 'failed', error: String((e as Error).message ?? e).slice(0, 200) }).eq('id', msgId)
        }
      }
    }
  } catch (err) {
    console.error('[comms] dispatch failed', err)
  }
}
