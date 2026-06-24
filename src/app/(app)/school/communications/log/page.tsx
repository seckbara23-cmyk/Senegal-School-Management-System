import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const CH_LABEL: Record<string, string> = { in_app: 'In-app', email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' }
const STATUS: Record<string, { label: string; cls: string }> = {
  queued:    { label: 'En file', cls: 'border-gray-200 bg-gray-50 text-gray-600' },
  sent:      { label: 'Envoyé', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  delivered: { label: 'Distribué', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  read:      { label: 'Lu', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed:    { label: 'Échec', cls: 'border-red-200 bg-red-50 text-red-700' },
  bounced:   { label: 'Rejeté', cls: 'border-red-200 bg-red-50 text-red-700' },
  skipped:   { label: 'Ignoré', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
}
const FILTERS = [{ v: '', l: 'Tous' }, { v: 'sent', l: 'Envoyés' }, { v: 'delivered', l: 'Distribués' }, { v: 'failed', l: 'Échecs' }, { v: 'skipped', l: 'Ignorés' }]

export default async function DeliveryLogPage({ searchParams }: { searchParams: { status?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id
  const status = searchParams.status && STATUS[searchParams.status] ? searchParams.status : ''

  const base = () => supabase.from('communication_messages').select('*', { count: 'exact', head: true }).eq('school_id', schoolId)
  const [{ count: total }, { count: delivered }, { count: failed }] = await Promise.all([
    base(), base().eq('status', 'delivered'), base().in('status', ['failed', 'bounced']),
  ])

  let q = supabase.from('communication_messages').select('id, channel, to_address, status, category, template_key, subject, error, created_at')
    .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  const { data } = await q
  type Row = { id: string; channel: string; to_address: string | null; status: string; category: string | null; template_key: string | null; subject: string | null; error: string | null; created_at: string }
  const rows = (data ?? []) as Row[]

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/communications" className="text-primary-300 hover:text-white text-sm">← Communication</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Journal des envois</h1>
        <p className="text-primary-300 text-sm mt-0.5">Suivi des messages e-mail, SMS et WhatsApp.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white p-4 text-center shadow-sm"><p className="text-2xl font-bold text-gray-900">{total ?? 0}</p><p className="text-xs text-gray-500">Total</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 text-center shadow-sm"><p className="text-2xl font-bold text-emerald-600">{delivered ?? 0}</p><p className="text-xs text-gray-500">Distribués</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 text-center shadow-sm"><p className="text-2xl font-bold text-red-600">{failed ?? 0}</p><p className="text-xs text-gray-500">Échecs</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a key={f.v} href={f.v ? `/school/communications/log?status=${f.v}` : '/school/communications/log'} className={`rounded-full border px-3 py-1 text-sm font-medium ${status === f.v ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-600 hover:bg-sand-50'}`}>{f.l}</a>
        ))}
      </div>

      <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun message.</p>}
        {rows.map((r) => {
          const s = STATUS[r.status] ?? { label: r.status, cls: 'border-gray-200 bg-gray-50 text-gray-600' }
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{r.subject || r.template_key || '—'}</p>
                <p className="truncate text-xs text-gray-400">{CH_LABEL[r.channel] ?? r.channel} · {r.to_address ?? '—'}{r.error ? ` · ${r.error}` : ''}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
