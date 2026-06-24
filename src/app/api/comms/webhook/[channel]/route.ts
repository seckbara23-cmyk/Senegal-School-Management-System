import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCommProvider } from '@/lib/comms/registry'
import { rateLimit, clientIpFrom } from '@/lib/rate-limit'
import type { ExternalChannel } from '@/lib/comms/types'

export const dynamic = 'force-dynamic'

const CHANNELS: ExternalChannel[] = ['email', 'sms', 'whatsapp']

function platformSecret(channel: ExternalChannel): string {
  if (channel === 'email') return process.env.RESEND_WEBHOOK_SECRET ?? ''
  if (channel === 'whatsapp') return process.env.WHATSAPP_APP_SECRET ?? ''
  return process.env.TWILIO_AUTH_TOKEN ?? ''
}

// Meta (WhatsApp) webhook verification challenge.
export async function GET(req: NextRequest, { params }: { params: { channel: string } }) {
  if (params.channel !== 'whatsapp') return new NextResponse('ok', { status: 200 })
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse(challenge ?? '', { status: 200 })
  return new NextResponse('forbidden', { status: 403 })
}

export async function POST(req: NextRequest, { params }: { params: { channel: string } }) {
  const channel = params.channel as ExternalChannel
  if (!CHANNELS.includes(channel)) return new NextResponse('not found', { status: 404 })

  const ip = clientIpFrom(req.headers)
  if (!rateLimit(`comms-webhook:${channel}:${ip}`, 120, 60_000)) return new NextResponse('rate limited', { status: 429 })

  const raw = await req.text()
  const provider = getCommProvider(channel)
  if (!provider?.verifyWebhook) return new NextResponse('ok', { status: 200 })

  const secret = platformSecret(channel)
  const result = provider.verifyWebhook(raw, req.headers, secret)

  // Signature-capable channels: reject forged callbacks when a secret is configured.
  if ((channel === 'email' || channel === 'whatsapp') && secret && !result.valid) return new NextResponse('invalid signature', { status: 401 })
  if (!result.providerMessageId) return new NextResponse('ok', { status: 200 })

  const admin = createAdminClient()
  const eventId = result.eventId || result.providerMessageId

  const { data: msg } = await admin.from('communication_messages').select('id, school_id').eq('provider_message_id', result.providerMessageId).maybeSingle()
  const messageId = (msg as { id: string } | null)?.id ?? null

  // Idempotency gate — unique (channel, event_id).
  const { error: dupErr } = await admin.from('communication_webhook_events').insert({ channel, event_id: eventId, message_id: messageId, status_reported: result.status })
  if (dupErr) { if ((dupErr as { code?: string }).code === '23505') return new NextResponse('ok', { status: 200 }); return new NextResponse('ok', { status: 200 }) }

  if (messageId) {
    const patch: Record<string, unknown> = { status: result.status }
    if (result.status === 'delivered' || result.status === 'read') patch.delivered_at = new Date().toISOString()
    if (result.status === 'failed' || result.status === 'bounced') patch.error = `delivery_${result.status}`
    await admin.from('communication_messages').update(patch).eq('id', messageId)
  }

  return new NextResponse('ok', { status: 200 })
}
