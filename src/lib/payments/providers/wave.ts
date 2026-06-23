// ─── Wave (Senegal) Checkout adapter ─────────────────────────────────────────
//
// https://docs.wave.com — Checkout Sessions API. Bearer api key. Webhooks are
// signed (Wave-Signature: t=<ts>, v1=<hmac>) with HMAC-SHA256 over `${t}${body}`.
// All amounts are XOF integers.

import { createHmac, timingSafeEqual } from 'crypto'
import type { OnlinePaymentProvider, ChargeContext, ChargeResult, WebhookVerification, TransactionStatus, NormalizedStatus } from './types'
import type { SchoolProviderConfig } from '../config'

const BASE = 'https://api.wave.com'

function mapPaymentStatus(s: string | null | undefined): NormalizedStatus {
  if (s === 'succeeded') return 'paid'
  if (s === 'processing' || s === 'pending') return 'pending'
  if (s === 'cancelled' || s === 'failed' || s === 'expired') return 'failed'
  return 'unknown'
}

export const waveProvider: OnlinePaymentProvider = {
  code: 'wave',

  async createCharge(ctx: ChargeContext): Promise<ChargeResult> {
    const res = await fetch(`${BASE}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: String(ctx.amount),
        currency: 'XOF',
        success_url: ctx.successUrl,
        error_url: ctx.cancelUrl,
        client_reference: ctx.reference,
      }),
    })
    if (!res.ok) throw new Error(`wave_create_failed_${res.status}`)
    const data = (await res.json()) as { id: string; wave_launch_url: string }
    if (!data.id || !data.wave_launch_url) throw new Error('wave_create_invalid_response')
    return { providerSessionId: data.id, checkoutUrl: data.wave_launch_url }
  },

  async verifyWebhook(rawBody: string, headers: Headers, secret: string): Promise<WebhookVerification> {
    const sigHeader = headers.get('wave-signature') ?? ''
    const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.trim().split('=').map((x) => x.trim())).filter((kv) => kv.length === 2))
    const t = parts['t']
    const v1 = parts['v1']
    let valid = false
    if (t && v1 && secret) {
      const expected = createHmac('sha256', secret).update(`${t}${rawBody}`).digest('hex')
      try { valid = timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) } catch { valid = false }
    }

    let body: { id?: string; type?: string; data?: { id?: string; client_reference?: string; payment_status?: string; amount?: string; currency?: string } } = {}
    try { body = JSON.parse(rawBody) } catch { /* keep empty */ }
    const d = body.data ?? {}

    return {
      valid,
      eventId: body.id ?? d.id ?? '',
      providerSessionId: d.id ?? null,
      providerReference: d.id ?? null,
      status: body.type === 'checkout.session.completed' ? mapPaymentStatus(d.payment_status) : mapPaymentStatus(d.payment_status),
      amount: d.amount ? parseInt(d.amount, 10) : null,
      currency: d.currency ?? null,
    }
  },

  async verifyTransaction(config: SchoolProviderConfig, providerSessionId: string, _ctx?: { orderId?: string; amount?: number }): Promise<TransactionStatus> {
    const res = await fetch(`${BASE}/v1/checkout/sessions/${encodeURIComponent(providerSessionId)}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    })
    if (!res.ok) return { status: 'unknown', amount: null, currency: null, providerReference: null }
    const d = (await res.json()) as { id: string; payment_status?: string; amount?: string; currency?: string }
    return {
      status: mapPaymentStatus(d.payment_status),
      amount: d.amount ? parseInt(d.amount, 10) : null,
      currency: d.currency ?? null,
      providerReference: d.id ?? null,
    }
  },
}
