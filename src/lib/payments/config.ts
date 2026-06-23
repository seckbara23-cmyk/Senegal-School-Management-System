// ─── Per-school payment provider config (server-only, service-role) ───────────

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from './crypto'

export type OnlineProvider = 'wave' | 'orange_money'

export type SchoolProviderConfig = {
  schoolId: string
  provider: OnlineProvider
  isEnabled: boolean
  mode: 'sandbox' | 'live'
  merchantId: string | null
  apiKey: string
  webhookSecret: string
}

type Row = {
  school_id: string; provider: OnlineProvider; is_enabled: boolean; mode: 'sandbox' | 'live'
  merchant_id: string | null; api_key_enc: string | null; webhook_secret_enc: string | null
}

// Decrypted config for a school+provider — only when enabled. Never call from a
// client component (decrypts secrets via the service-role client).
export async function loadProviderConfig(schoolId: string, provider: OnlineProvider): Promise<SchoolProviderConfig | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('school_payment_config').select('school_id, provider, is_enabled, mode, merchant_id, api_key_enc, webhook_secret_enc').eq('school_id', schoolId).eq('provider', provider).maybeSingle()
  const row = data as Row | null
  if (!row || !row.is_enabled) return null
  return {
    schoolId, provider, isEnabled: row.is_enabled, mode: row.mode, merchantId: row.merchant_id,
    apiKey: row.api_key_enc ? decryptSecret(row.api_key_enc) : '',
    webhookSecret: row.webhook_secret_enc ? decryptSecret(row.webhook_secret_enc) : '',
  }
}

// The set of providers a school has enabled for online checkout (for the parent
// UI). Uses the service-role client — config is admin-only under RLS.
export async function enabledProvidersForSchool(schoolId: string): Promise<OnlineProvider[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('school_payment_config').select('provider, is_enabled').eq('school_id', schoolId)
  return ((data ?? []) as { provider: OnlineProvider; is_enabled: boolean }[]).filter((r) => r.is_enabled).map((r) => r.provider)
}
