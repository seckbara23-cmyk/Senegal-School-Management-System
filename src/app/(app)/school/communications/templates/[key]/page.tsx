import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TemplateEditor } from './_editor'

export const dynamic = 'force-dynamic'

const KEY_LABEL: Record<string, string> = {
  invoice_reminder: 'Rappel de paiement', invoice_created: 'Nouvelle facture', payment_recorded: 'Paiement reçu', attendance_alert: 'Alerte présence',
}
const CHANNEL_ORDER = ['in_app', 'email', 'sms', 'whatsapp']

export default async function TemplateEditPage({ params, searchParams }: { params: { key: string }; searchParams: { saved?: string; reset?: string } }) {
  const key = decodeURIComponent(params.key)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data } = await supabase.from('communication_templates').select('channel, subject, body, school_id')
    .eq('key', key).eq('locale', 'fr').or(`school_id.eq.${schoolId},school_id.is.null`)
  type Row = { channel: string; subject: string | null; body: string; school_id: string | null }
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) redirect('/school/communications/templates')

  const channels = Array.from(new Set(rows.map((r) => r.channel))).sort((a, b) => CHANNEL_ORDER.indexOf(a) - CHANNEL_ORDER.indexOf(b))
  const perChannel = channels.map((ch) => {
    const platform = rows.find((r) => r.channel === ch && r.school_id === null)
    const override = rows.find((r) => r.channel === ch && r.school_id === schoolId)
    return { channel: ch, platformSubject: platform?.subject ?? null, platformBody: platform?.body ?? '', overrideSubject: override?.subject ?? null, overrideBody: override?.body ?? null, hasOverride: !!override }
  })

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/communications/templates" className="text-primary-300 hover:text-white text-sm">← Modèles</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{KEY_LABEL[key] ?? key}</h1>
        <p className="text-primary-300 text-sm mt-0.5">Variables : entourez-les de doubles accolades, ex. {'{{student_name}}'}.</p>
      </div>

      {searchParams.saved && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Modèle enregistré.</div>}
      {searchParams.reset && <div role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">Modèle réinitialisé au modèle par défaut.</div>}

      {perChannel.map((c) => <TemplateEditor key={c.channel} templateKey={key} {...c} />)}
    </div>
  )
}
