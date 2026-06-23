// ─── Online payment provider contract (server-only) ──────────────────────────

import type { SchoolProviderConfig } from '../config'

export type ChargeContext = {
  config: SchoolProviderConfig
  amount: number        // XOF, integer (no decimals)
  reference: string     // payment_request id → client_reference / order_id
  successUrl: string
  cancelUrl: string
  webhookUrl: string
  description?: string
}

export type ChargeResult = { providerSessionId: string; checkoutUrl: string }

export type NormalizedStatus = 'paid' | 'failed' | 'pending' | 'unknown'

export type WebhookVerification = {
  valid: boolean              // signature / authenticity check passed
  eventId: string             // dedupe key (UNIQUE per provider)
  clientReference: string | null  // our payment_request id (client_reference / order_id)
  providerSessionId: string | null
  providerReference: string | null
  status: NormalizedStatus
  amount: number | null
  currency: string | null
}

export type TransactionStatus = {
  status: NormalizedStatus
  amount: number | null
  currency: string | null
  providerReference: string | null
}

export interface OnlinePaymentProvider {
  code: 'wave' | 'orange_money'
  // Server → provider: open a hosted checkout.
  createCharge(ctx: ChargeContext): Promise<ChargeResult>
  // Verify an inbound webhook's authenticity + extract a normalized result.
  verifyWebhook(rawBody: string, headers: Headers, secret: string): Promise<WebhookVerification>
  // Source-of-truth poll used by reconciliation fallbacks. `ctx` carries the
  // original order id + amount that some providers (Orange) require to look up.
  verifyTransaction(config: SchoolProviderConfig, providerSessionId: string, ctx?: { orderId?: string; amount?: number }): Promise<TransactionStatus>
}
