import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOnlineProvider } from '@/lib/payments/providers/index'
import { loadProviderConfig, type OnlineProvider } from '@/lib/payments/config'
import { reconcilePaymentRequest } from '@/lib/payments/service'
import { rateLimit, clientIpFrom } from '@/lib/rate-limit'

// Public, service-role. Rate-limit → verify signature → dedupe → reconcile (which
// re-polls the provider authoritatively before recording any money). Always
// responds quickly.
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const providerCode = params.provider as OnlineProvider
  const provider = getOnlineProvider(providerCode)
  if (!provider) return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })

  // Throttle a single source: caps cost of the authoritative re-poll + DB writes.
  const ip = clientIpFrom(req.headers)
  if (!rateLimit(`whk:${providerCode}:${ip}`, 60, 60_000) || !rateLimit(`whk:${providerCode}`, 600, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } })
  }

  const raw = await req.text()

  // First pass (no secret) just extracts our payment_request id (client_reference).
  const pre = await provider.verifyWebhook(raw, req.headers, '')
  const requestId = pre.clientReference
  if (!requestId) return NextResponse.json({ ok: true }, { status: 200 }) // nothing to match → ignore

  const admin = createAdminClient()
  const { data: reqRow } = await admin.from('payment_requests').select('id, school_id, status').eq('id', requestId).maybeSingle()
  const request = reqRow as { id: string; school_id: string; status: string } | null
  if (!request) return NextResponse.json({ ok: true }, { status: 200 }) // unknown request → ignore (no retry storm)

  // Re-verify with the school's secret.
  const config = await loadProviderConfig(request.school_id, providerCode)
  const verified = config ? await provider.verifyWebhook(raw, req.headers, config.webhookSecret) : pre

  let payload: unknown = null
  try { payload = JSON.parse(raw) } catch { payload = { raw: raw.slice(0, 2000) } }

  // Idempotency: a duplicate (provider,event_id) means we already saw this event.
  const eventId = verified.eventId || requestId
  const { error: dupeErr } = await admin.from('payment_webhook_events').insert({
    provider: providerCode, event_id: eventId, payment_request_id: request.id, school_id: request.school_id,
    signature_valid: verified.valid, status_reported: verified.status, amount_reported: verified.amount, payload, result: 'received',
  })
  if (dupeErr) {
    if ((dupeErr as { code?: string }).code === '23505') return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
    return NextResponse.json({ error: 'log_failed' }, { status: 500 })
  }

  // Wave webhooks are signed → require a valid signature. Orange's notif is
  // unsigned, so we proceed and rely on verifyTransaction inside reconcile.
  if (providerCode === 'wave' && !verified.valid) {
    await admin.from('payment_webhook_events').update({ result: 'invalid_signature' }).eq('provider', providerCode).eq('event_id', eventId)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // Authoritative reconciliation (re-polls the provider, records once).
  const result = await reconcilePaymentRequest(request.id)
  await admin.from('payment_webhook_events').update({ result: result.status }).eq('provider', providerCode).eq('event_id', eventId)

  return NextResponse.json({ ok: true, status: result.status }, { status: 200 })
}
