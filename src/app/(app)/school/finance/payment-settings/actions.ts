'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import { logSupabaseError } from '@/lib/errors'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { encryptSecret } from '@/lib/payments/crypto'

const empty = (v: unknown) => (v === '' || v == null ? undefined : v)

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  return { supabase, schoolId: (m as { school_id: string }).school_id, actor: user }
}

export type PaymentConfigState = { error?: string }

const Schema = z.object({
  provider:       z.enum(['wave', 'orange_money']),
  is_enabled:     z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  mode:           z.enum(['sandbox', 'live']),
  merchant_id:    z.preprocess(empty, z.string().max(200).optional()),
  api_key:        z.preprocess(empty, z.string().max(500).optional()),
  webhook_secret: z.preprocess(empty, z.string().max(500).optional()),
})

export async function savePaymentConfig(_prev: PaymentConfigState, formData: FormData): Promise<PaymentConfigState> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = Schema.safeParse({
    provider: formData.get('provider'), is_enabled: formData.get('is_enabled'), mode: formData.get('mode'),
    merchant_id: formData.get('merchant_id'), api_key: formData.get('api_key'), webhook_secret: formData.get('webhook_secret'),
  })
  if (!parsed.success) return { error: 'Données invalides.' }
  const d = parsed.data

  const { data: existing } = await supabase
    .from('school_payment_config').select('api_key_enc, webhook_secret_enc').eq('school_id', schoolId).eq('provider', d.provider).maybeSingle()
  const ex = existing as { api_key_enc: string | null; webhook_secret_enc: string | null } | null

  // New secret wins; otherwise keep the stored ciphertext (write-only fields).
  const apiKeyEnc = d.api_key ? encryptSecret(d.api_key) : (ex?.api_key_enc ?? null)
  const secretEnc = d.webhook_secret ? encryptSecret(d.webhook_secret) : (ex?.webhook_secret_enc ?? null)

  if (d.is_enabled && (!d.merchant_id || !apiKeyEnc || !secretEnc)) {
    return { error: 'Pour activer, renseignez l’identifiant marchand, la clé API et le secret du webhook.' }
  }

  const { error } = await supabase.from('school_payment_config').upsert({
    school_id: schoolId, provider: d.provider, is_enabled: d.is_enabled, mode: d.mode,
    merchant_id: d.merchant_id ?? null, api_key_enc: apiKeyEnc, webhook_secret_enc: secretEnc, updated_by: actor.id,
  }, { onConflict: 'school_id,provider' })

  if (error) {
    logSupabaseError(error, { action: 'savePaymentConfig', schoolId, userId: actor.id, entityIds: { provider: d.provider } })
    return { error: 'Erreur lors de l’enregistrement. Veuillez réessayer.' }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'payment_config_updated', resourceType: 'school', resourceId: schoolId,
    metadata: { provider: d.provider, enabled: d.is_enabled, mode: d.mode },
  })
  redirect(`/school/finance/payment-settings?saved=${d.provider}`)
}
