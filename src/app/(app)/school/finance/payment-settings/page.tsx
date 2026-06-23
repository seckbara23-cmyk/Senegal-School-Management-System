import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { ProviderConfigForm } from './_form'

export const dynamic = 'force-dynamic'

const PROVIDERS: { code: 'wave' | 'orange_money'; label: string }[] = [
  { code: 'wave', label: 'Wave' },
  { code: 'orange_money', label: 'Orange Money' },
]

type Props = { searchParams: { saved?: string } }

export default async function PaymentSettingsPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rows } = await supabase
    .from('school_payment_config').select('provider, is_enabled, mode, merchant_id, api_key_enc, webhook_secret_enc').eq('school_id', schoolId)
  type Row = { provider: string; is_enabled: boolean; mode: string; merchant_id: string | null; api_key_enc: string | null; webhook_secret_enc: string | null }
  const byProvider = new Map((rows ?? []).map((r) => [(r as Row).provider, r as Row]))

  const h = headers()
  const origin = h.get('host') ? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}` : ''

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finance</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Paiements en ligne</h1>
        <p className="text-primary-300 text-sm mt-0.5">Connectez vos comptes Wave et Orange Money pour encaisser en ligne.</p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Les clés sont chiffrées et ne sont jamais réaffichées. Renseignez l’URL du webhook ci-dessous dans le tableau de bord de chaque opérateur. Testez d’abord en mode sandbox.
      </div>

      {PROVIDERS.map((p) => {
        const r = byProvider.get(p.code)
        return (
          <ProviderConfigForm
            key={p.code}
            provider={p.code}
            providerLabel={p.label}
            config={{ isEnabled: !!r?.is_enabled, mode: r?.mode ?? 'sandbox', merchantId: r?.merchant_id ?? null, hasApiKey: !!r?.api_key_enc, hasSecret: !!r?.webhook_secret_enc }}
            webhookUrl={`${origin}/api/payments/webhook/${p.code}`}
            saved={searchParams.saved === p.code}
          />
        )
      })}
    </div>
  )
}
