// ─── SMS provider: Twilio adapter ────────────────────────────────────────────
//
// POST /Messages.json (Basic auth SID:token). Per-school override (config.config
// .account_sid + apiKey=token + senderId=from) → platform env fallback
// (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM). Delivery receipts
// arrive as form-encoded status callbacks (full X-Twilio-Signature verification
// is added in the 9D.8 webhook route, which has the request URL).

import type { CommunicationChannelProvider, OutboundMessage, SendResult } from '../types'

function mapStatus(s: string): string {
  if (s === 'delivered') return 'delivered'
  if (s === 'failed' || s === 'undelivered') return 'failed'
  if (s === 'read') return 'read'
  return 'sent'
}

export const twilioSmsProvider: CommunicationChannelProvider = {
  channel: 'sms',
  enabled: true,

  async send(msg: OutboundMessage): Promise<SendResult> {
    const sid = (msg.config.config.account_sid as string) || process.env.TWILIO_ACCOUNT_SID || ''
    const token = msg.config.apiKey || process.env.TWILIO_AUTH_TOKEN || ''
    const from = msg.config.senderId || process.env.TWILIO_SMS_FROM || ''
    if (!sid || !token || !from) return { providerMessageId: null, status: 'failed', error: 'sms_not_configured' }

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: msg.to, From: from, Body: msg.body }).toString(),
    })
    if (!res.ok) return { providerMessageId: null, status: 'failed', error: `twilio_${res.status}` }
    const d = (await res.json()) as { sid?: string }
    return { providerMessageId: d.sid ?? null, status: 'sent', cost: null }
  },

  verifyWebhook(raw: string) {
    const params = new URLSearchParams(raw)
    const sid = params.get('MessageSid') ?? params.get('SmsSid') ?? ''
    const status = params.get('MessageStatus') ?? params.get('SmsStatus') ?? ''
    return { eventId: `${sid}:${status}`, providerMessageId: sid || null, status: mapStatus(status), valid: !!sid }
  },
}
