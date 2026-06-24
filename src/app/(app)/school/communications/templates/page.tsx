import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const KEY_LABEL: Record<string, string> = {
  invoice_reminder: 'Rappel de paiement', invoice_created: 'Nouvelle facture', payment_recorded: 'Paiement reçu', attendance_alert: 'Alerte présence',
}
const CH_LABEL: Record<string, string> = { in_app: 'In-app', email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' }

export default async function TemplatesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data } = await supabase.from('communication_templates').select('key, channel, school_id')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
  type Row = { key: string; channel: string; school_id: string | null }
  const byKey = new Map<string, { channels: Set<string>; overrides: Set<string> }>()
  for (const r of (data ?? []) as Row[]) {
    const e = byKey.get(r.key) ?? { channels: new Set<string>(), overrides: new Set<string>() }
    e.channels.add(r.channel); if (r.school_id === schoolId) e.overrides.add(r.channel)
    byKey.set(r.key, e)
  }
  const keys = Array.from(byKey.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/communications" className="text-primary-300 hover:text-white text-sm">← Communication</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modèles de messages</h1>
        <p className="text-primary-300 text-sm mt-0.5">Modèles par défaut de la plateforme — personnalisez-les pour votre école.</p>
      </div>

      <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        {keys.map(([key, e]) => (
          <a key={key} href={`/school/communications/templates/${encodeURIComponent(key)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
            <div>
              <p className="text-sm font-semibold text-gray-900">{KEY_LABEL[key] ?? key}</p>
              <p className="text-xs text-gray-400">{Array.from(e.channels).map((c) => CH_LABEL[c] ?? c).join(' · ')}</p>
            </div>
            {e.overrides.size > 0 ? <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">Personnalisé</span> : <span className="text-xs text-gray-400">Par défaut</span>}
          </a>
        ))}
      </div>
    </div>
  )
}
