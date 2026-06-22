// ─── Payment provider abstraction (Phase 4.6) ────────────────────────────────
//
// One contract for every way a school can take money. Today all providers are
// MANUAL: the cashier records a payment that already happened (the existing
// record_student_payment flow). The abstraction exists so Wave / Orange Money
// can plug in later as `mode: 'online'` providers implementing createCharge /
// verifyWebhook — callers (the payment form, the record action) keep using the
// same `code` (which equals student_payments.payment_method), so nothing else
// changes. No external API calls live here.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

export type PaymentMode = 'manual' | 'online'

export type PaymentProviderRecord = {
  code: string         // == student_payments.payment_method
  label: string
  provider: string     // family: cash/bank/cheque/wave/orange/other
  mode: PaymentMode
  isEnabled: boolean
  sortOrder: number
  config: Record<string, unknown>
}

// The runtime contract. Manual providers need nothing beyond identity — the
// payment is recorded through the existing atomic RPC. Online providers will
// implement the optional hooks when integrated (kept optional so adding them is
// non-breaking).
export interface PaymentProvider {
  code: string
  label: string
  mode: PaymentMode
  // Future online hooks (Wave / Orange Money), intentionally unused today:
  //   createCharge?(input: { amount: number; reference: string }): Promise<{ redirectUrl: string }>
  //   verifyWebhook?(payload: unknown): Promise<{ ok: boolean; providerReference: string; amount: number }>
}

// Static catalogue — mirrors the migration 052 seed. Used as a safe fallback if
// the payment_providers table hasn't been created yet (additive migration).
export const PROVIDER_CATALOGUE: PaymentProviderRecord[] = [
  { code: 'cash',                label: 'Espèces',           provider: 'cash',   mode: 'manual', isEnabled: true, sortOrder: 1, config: {} },
  { code: 'wave_manual',         label: 'Wave',              provider: 'wave',   mode: 'manual', isEnabled: true, sortOrder: 2, config: {} },
  { code: 'orange_money_manual', label: 'Orange Money',      provider: 'orange', mode: 'manual', isEnabled: true, sortOrder: 3, config: {} },
  { code: 'bank_transfer',       label: 'Virement bancaire', provider: 'bank',   mode: 'manual', isEnabled: true, sortOrder: 4, config: {} },
  { code: 'cheque',              label: 'Chèque',            provider: 'cheque', mode: 'manual', isEnabled: true, sortOrder: 5, config: {} },
  { code: 'other',               label: 'Autre',             provider: 'other',  mode: 'manual', isEnabled: true, sortOrder: 6, config: {} },
]

// Enabled providers, DB-driven with a static fallback. Never throws.
export async function getPaymentProviders(client: Client): Promise<PaymentProviderRecord[]> {
  try {
    const { data, error } = await client
      .from('payment_providers')
      .select('code, label, provider, mode, is_enabled, sort_order, config')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true })
    if (error || !data || data.length === 0) return PROVIDER_CATALOGUE.filter((p) => p.isEnabled)
    return (data as { code: string; label: string; provider: string; mode: PaymentMode; is_enabled: boolean; sort_order: number; config: Record<string, unknown> | null }[])
      .map((r) => ({ code: r.code, label: r.label, provider: r.provider, mode: r.mode, isEnabled: r.is_enabled, sortOrder: r.sort_order, config: r.config ?? {} }))
  } catch {
    return PROVIDER_CATALOGUE.filter((p) => p.isEnabled)
  }
}

export function getPaymentMethodOptions(records: PaymentProviderRecord[]): { value: string; label: string }[] {
  return records.map((r) => ({ value: r.code, label: r.label }))
}
