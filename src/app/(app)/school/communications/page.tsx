import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { ChannelConfigForm } from './_channel_form'
import { getCommProvider } from '@/lib/comms/registry'

export const dynamic = 'force-dynamic'

const CHANNELS: { code: 'email' | 'sms' | 'whatsapp'; label: string }[] = [
  { code: 'email', label: 'E-mail' },
  { code: 'sms', label: 'SMS' },
  { code: 'whatsapp', label: 'WhatsApp' },
]

type Props = { searchParams: { saved?: string; tested?: string } }

export default async function CommunicationsPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const [{ data: configs }, { data: provs }] = await Promise.all([
    supabase.from('school_communication_config').select('channel, provider_code, is_enabled, mode, sender_id, api_key_enc, webhook_secret_enc').eq('school_id', schoolId),
    supabase.from('communication_providers').select('code, channel, label, is_enabled').eq('is_enabled', true).order('sort_order'),
  ])
  type Cfg = { channel: string; provider_code: string | null; is_enabled: boolean; mode: string; sender_id: string | null; api_key_enc: string | null; webhook_secret_enc: string | null }
  const cfgByChannel = new Map(((configs ?? []) as Cfg[]).map((c) => [c.channel, c]))
  const providersByChannel = new Map<string, { code: string; label: string }[]>()
  for (const p of (provs ?? []) as { code: string; channel: string; label: string }[]) {
    const l = providersByChannel.get(p.channel) ?? []; l.push({ code: p.code, label: p.label }); providersByChannel.set(p.channel, l)
  }

  const h = headers()
  const origin = h.get('host') ? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}` : ''

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Communication</h1>
        <p className="text-primary-300 text-sm mt-0.5">Canaux multi-supports — l’in-app reste le canal par défaut.</p>
      </div>

      {searchParams.tested === 'ok' && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Message de test envoyé.</div>}
      {searchParams.tested === 'fail' && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Échec de l’envoi du test — vérifiez la configuration.</div>}

      <div className="flex flex-wrap gap-2">
        <a href="/school/communications/broadcast" className="rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">Diffuser un message</a>
        <a href="/school/communications/templates" className="rounded-lg border border-sand-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50">Modèles de messages</a>
        <a href="/school/communications/log" className="rounded-lg border border-sand-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50">Journal des envois</a>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Les notifications in-app sont toujours actives. Activez un canal pour relayer aussi par e-mail, SMS ou WhatsApp, selon les préférences des destinataires. Ordre de déploiement : e-mail, puis SMS, puis WhatsApp.
      </div>

      {CHANNELS.map((c) => {
        const cfg = cfgByChannel.get(c.code)
        return (
          <ChannelConfigForm
            key={c.code}
            channel={c.code}
            channelLabel={c.label}
            providers={providersByChannel.get(c.code) ?? []}
            config={{ isEnabled: !!cfg?.is_enabled, mode: cfg?.mode ?? 'sandbox', providerCode: cfg?.provider_code ?? null, senderId: cfg?.sender_id ?? null, hasApiKey: !!cfg?.api_key_enc, hasSecret: !!cfg?.webhook_secret_enc }}
            webhookUrl={`${origin}/api/comms/webhook/${c.code}`}
            active={!!getCommProvider(c.code)?.enabled}
            saved={searchParams.saved === c.code}
          />
        )
      })}
    </div>
  )
}
