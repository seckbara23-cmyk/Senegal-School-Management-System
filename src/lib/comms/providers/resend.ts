// ─── Email provider: Resend adapter ──────────────────────────────────────────
//
// https://resend.com/docs — POST /emails. Per-school override key/from, else the
// platform env (RESEND_API_KEY / COMMS_EMAIL_FROM). Delivery webhooks are Svix-
// signed; verifyWebhook validates and normalizes the status.

import { createHmac, timingSafeEqual } from 'crypto'
import type { CommunicationChannelProvider, OutboundMessage, SendResult } from '../types'

const BASE = 'https://api.resend.com'

function platformFrom(): string { return process.env.COMMS_EMAIL_FROM ?? 'ScolaTech <no-reply@scolatech.app>' }

function mapStatus(type: string | undefined): string {
  switch (type) {
    case 'email.delivered': return 'delivered'
    case 'email.bounced': return 'bounced'
    case 'email.complained': return 'failed'
    case 'email.opened': return 'read'
    case 'email.delivery_delayed': return 'sent'
    default: return 'sent'
  }
}

export const resendProvider: CommunicationChannelProvider = {
  channel: 'email',
  enabled: true,

  async send(msg: OutboundMessage): Promise<SendResult> {
    const apiKey = msg.config.apiKey || process.env.RESEND_API_KEY || ''
    if (!apiKey) return { providerMessageId: null, status: 'failed', error: 'email_not_configured' }
    const from = msg.config.senderId || platformFrom()

    const res = await fetch(`${BASE}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject ?? 'ScolaTech', text: msg.body }),
    })
    if (!res.ok) return { providerMessageId: null, status: 'failed', error: `resend_${res.status}` }
    const d = (await res.json()) as { id?: string }
    return { providerMessageId: d.id ?? null, status: 'sent', cost: 0 }
  },

  // Svix-signed webhook: HMAC-SHA256 over `${id}.${timestamp}.${body}` with the
  // base64 secret (after the whsec_ prefix), compared to the v1 signatures.
  verifyWebhook(raw: string, headers: Headers, secret: string) {
    const id = headers.get('svix-id') ?? ''
    const ts = headers.get('svix-timestamp') ?? ''
    const sigHeader = headers.get('svix-signature') ?? ''
    let valid = false
    if (id && ts && secret) {
      try {
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
        const expected = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64')
        for (const part of sigHeader.split(' ')) {
          const sig = part.startsWith('v1,') ? part.slice(3) : part
          if (sig && expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) { valid = true; break }
        }
      } catch { valid = false }
    }
    let body: { type?: string; data?: { email_id?: string } } = {}
    try { body = JSON.parse(raw) } catch { /* ignore */ }
    return { eventId: id || (body.data?.email_id ?? ''), providerMessageId: body.data?.email_id ?? null, status: mapStatus(body.type), valid }
  },
}
