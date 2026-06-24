// ─── Per-school channel config (server-only, service-role) ────────────────────
//
// Platform-managed by default: a school enables a channel and (optionally) sets a
// sender id + override credentials. When override creds are absent the provider
// adapter falls back to platform env. Secrets reuse the payments AES-256-GCM box.

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/payments/crypto'
import type { ExternalChannel, ResolvedChannelConfig } from './types'

const DEFAULT_PROVIDER: Record<ExternalChannel, string> = { email: 'resend', sms: 'twilio_sms', whatsapp: 'meta_whatsapp' }

type Row = {
  channel: ExternalChannel; provider_code: string | null; is_enabled: boolean; mode: 'sandbox' | 'live'
  sender_id: string | null; api_key_enc: string | null; webhook_secret_enc: string | null; config: Record<string, unknown> | null
}

export async function loadChannelConfig(schoolId: string, channel: ExternalChannel): Promise<ResolvedChannelConfig | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('school_communication_config')
    .select('channel, provider_code, is_enabled, mode, sender_id, api_key_enc, webhook_secret_enc, config')
    .eq('school_id', schoolId).eq('channel', channel).maybeSingle()
  const row = data as Row | null
  if (!row || !row.is_enabled) return null
  return {
    schoolId, channel,
    providerCode: row.provider_code ?? DEFAULT_PROVIDER[channel],
    mode: row.mode, senderId: row.sender_id,
    apiKey: row.api_key_enc ? decryptSecret(row.api_key_enc) : '',
    webhookSecret: row.webhook_secret_enc ? decryptSecret(row.webhook_secret_enc) : '',
    config: row.config ?? {},
  }
}

// Enabled external channels for a school (for UIs / dispatch ordering).
export async function enabledChannelsForSchool(schoolId: string): Promise<ExternalChannel[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('school_communication_config').select('channel, is_enabled').eq('school_id', schoolId)
  const order: ExternalChannel[] = ['email', 'sms', 'whatsapp']
  const enabled = new Set(((data ?? []) as { channel: ExternalChannel; is_enabled: boolean }[]).filter((r) => r.is_enabled).map((r) => r.channel))
  return order.filter((c) => enabled.has(c))
}
