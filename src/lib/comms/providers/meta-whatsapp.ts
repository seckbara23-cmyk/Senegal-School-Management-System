// ─── WhatsApp provider: Meta Cloud API adapter ───────────────────────────────
//
// POST /{phone_number_id}/messages (Bearer access token). Per-school override
// (config.config.phone_number_id + apiKey=access_token) → platform env fallback
// (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN). Webhooks are signed with
// X-Hub-Signature-256 (HMAC-SHA256, app secret).
//
// NOTE (go-live): business-initiated WhatsApp messages outside a 24h customer
// window require PRE-APPROVED templates. This adapter sends a text body (works in
// session / opt-in); template-message support is a go-live item.

import { createHmac, timingSafeEqual } from 'crypto'
import type { CommunicationChannelProvider, OutboundMessage, SendResult } from '../types'

function mapStatus(s: string | undefined): string {
  if (s === 'delivered') return 'delivered'
  if (s === 'read') return 'read'
  if (s === 'failed') return 'failed'
  return 'sent'
}

export const metaWhatsappProvider: CommunicationChannelProvider = {
  channel: 'whatsapp',
  enabled: true,

  async send(msg: OutboundMessage): Promise<SendResult> {
    const token = msg.config.apiKey || process.env.WHATSAPP_ACCESS_TOKEN || ''
    const phoneId = (msg.config.config.phone_number_id as string) || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
    if (!token || !phoneId) return { providerMessageId: null, status: 'failed', error: 'whatsapp_not_configured' }

    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: msg.to.replace(/[^0-9]/g, ''), type: 'text', text: { body: msg.body } }),
    })
    if (!res.ok) return { providerMessageId: null, status: 'failed', error: `whatsapp_${res.status}` }
    const d = (await res.json()) as { messages?: { id?: string }[] }
    return { providerMessageId: d.messages?.[0]?.id ?? null, status: 'sent', cost: null }
  },

  verifyWebhook(raw: string, headers: Headers, secret: string) {
    const sig = headers.get('x-hub-signature-256') ?? ''
    let valid = false
    if (secret && sig.startsWith('sha256=')) {
      const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
      try { valid = expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) } catch { valid = false }
    }
    let body: { entry?: { changes?: { value?: { statuses?: { id?: string; status?: string }[] } }[] }[] } = {}
    try { body = JSON.parse(raw) } catch { /* ignore */ }
    const st = body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]
    return { eventId: st?.id ? `${st.id}:${st.status ?? ''}` : '', providerMessageId: st?.id ?? null, status: mapStatus(st?.status), valid }
  },
}
