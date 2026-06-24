// ─── Orange Money (Sonatel, Senegal) Web Payment adapter ─────────────────────
//
// Orange Money WebPayment: OAuth bearer token, then create a webpayment session
// (returns pay_token + payment_url). The notification webhook is NOT signed, so
// verifyTransaction (transactionstatus) is the AUTHORITATIVE check — the webhook
// route always re-polls before recording money.
//
// config.apiKey      = the Basic auth credential (base64 client:secret) from the
//                      Orange developer portal ("Authorization header").
// config.merchantId  = merchant_key.
// Sandbox uses currency 'OUV'; live uses 'XOF'.

import type { OnlinePaymentProvider, ChargeContext, ChargeResult, WebhookVerification, TransactionStatus, NormalizedStatus } from './types'
import type { SchoolProviderConfig } from '../config'

const OAUTH = 'https://api.orange.com/oauth/v3/token'
const WEBPAY = 'https://api.orange.com/orange-money-webpay/v1'

function currencyFor(mode: string): string { return mode === 'live' ? 'XOF' : 'OUV' }

function mapStatus(s: string | null | undefined): NormalizedStatus {
  const u = (s ?? '').toUpperCase()
  if (u === 'SUCCESS') return 'paid'
  if (u === 'PENDING' || u === 'INITIATED') return 'pending'
  if (u === 'FAILED' || u === 'EXPIRED' || u === 'CANCELLED') return 'failed'
  return 'unknown'
}

async function getToken(config: SchoolProviderConfig): Promise<string | null> {
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { Authorization: `Basic ${config.apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) return null
  const d = (await res.json()) as { access_token?: string }
  return d.access_token ?? null
}

export const orangeMoneyProvider: OnlinePaymentProvider = {
  code: 'orange_money',

  async createCharge(ctx: ChargeContext): Promise<ChargeResult> {
    const token = await getToken(ctx.config)
    if (!token) throw new Error('orange_oauth_failed')
    const res = await fetch(`${WEBPAY}/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_key: ctx.config.merchantId,
        currency: currencyFor(ctx.config.mode),
        order_id: ctx.reference,
        amount: ctx.amount,
        return_url: ctx.successUrl,
        cancel_url: ctx.cancelUrl,
        notif_url: ctx.webhookUrl,
        lang: 'fr',
        reference: ctx.description ?? 'ScolaTech',
      }),
    })
    if (!res.ok) throw new Error(`orange_create_failed_${res.status}`)
    const d = (await res.json()) as { pay_token?: string; payment_url?: string }
    if (!d.pay_token || !d.payment_url) throw new Error('orange_create_invalid_response')
    return { providerSessionId: d.pay_token, checkoutUrl: d.payment_url }
  },

  // Orange's notif is unsigned → mark structurally-valid only; the route MUST
  // re-confirm via verifyTransaction before recording any money.
  async verifyWebhook(rawBody: string): Promise<WebhookVerification> {
    let body: { status?: string; txnid?: string; order_id?: string; amount?: number } = {}
    try { body = JSON.parse(rawBody) } catch { /* keep empty */ }
    return {
      valid: !!(body.order_id),
      eventId: `${body.order_id ?? ''}:${body.txnid ?? ''}`,
      clientReference: body.order_id ?? null,
      providerSessionId: null,
      providerReference: body.txnid ?? null,
      status: mapStatus(body.status),
      amount: typeof body.amount === 'number' ? body.amount : null,
      currency: null,
    }
  },

  async verifyTransaction(config: SchoolProviderConfig, providerSessionId: string, ctx?: { orderId?: string; amount?: number }): Promise<TransactionStatus> {
    const token = await getToken(config)
    if (!token) return { status: 'unknown', amount: null, currency: null, providerReference: null }
    const res = await fetch(`${WEBPAY}/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ order_id: ctx?.orderId, amount: ctx?.amount, pay_token: providerSessionId }),
    })
    if (!res.ok) return { status: 'unknown', amount: null, currency: null, providerReference: null }
    const d = (await res.json()) as { status?: string; txnid?: string; amount?: number | string }
    // Prefer the settled amount reported by the provider (enables the
    // amount-mismatch guard in reconcile); fall back to the order amount.
    const settled = d.amount != null && d.amount !== '' ? Number(d.amount) : null
    const amount = settled !== null && !Number.isNaN(settled) ? settled : (ctx?.amount ?? null)
    return { status: mapStatus(d.status), amount, currency: null, providerReference: d.txnid ?? null }
  },
}
