import { requireSuperAdmin } from '../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NewTicketForm } from './_new'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { open: 'Ouvert', in_progress: 'En cours', waiting: 'En attente', resolved: 'Résolu', closed: 'Fermé' }
const STATUS_CLASS: Record<string, string> = {
  open: 'border-sky-200 bg-sky-50 text-sky-700', in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  waiting: 'border-gray-200 bg-gray-100 text-gray-500', resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700', closed: 'border-gray-200 bg-gray-100 text-gray-400',
}
const PRIORITY_CLASS: Record<string, string> = { low: 'text-gray-400', normal: 'text-gray-600', high: 'text-amber-600', urgent: 'text-red-600' }
const FILTERS = ['open', 'in_progress', 'waiting', 'resolved', 'closed']

function one<T>(v: T | T[] | null | undefined): T | null { return v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v) }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) }

type Props = { searchParams: { status?: string } }

export default async function SupportPage({ searchParams }: Props) {
  await requireSuperAdmin()
  const admin = createAdminClient()

  const filter = FILTERS.includes(searchParams.status ?? '') ? searchParams.status! : null
  let q = admin.from('support_tickets').select('id, subject, priority, status, created_at, schools!school_id(name)').order('created_at', { ascending: false }).limit(200)
  if (filter) q = q.eq('status', filter)
  const { data } = await q
  type Row = { id: string; subject: string; priority: string; status: string; created_at: string; schools: unknown }
  const tickets = ((data ?? []) as Row[]).map((t) => ({ ...t, schoolName: one<{ name: string }>(t.schools as never)?.name ?? '—' }))

  const { data: schoolsData } = await admin.from('schools').select('id, name').neq('subscription_status', 'archived').order('name')
  const schools = (schoolsData ?? []) as { id: string; name: string }[]

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/command-center" className="text-primary-300 hover:text-white text-sm">← Centre de commande</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Support</h1>
        <p className="text-primary-300 text-sm mt-0.5">Tickets et suivi par école.</p>
      </div>

      <NewTicketForm schools={schools} />

      <div className="flex flex-wrap gap-2">
        <a href="/super-admin/support" className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!filter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Tous</a>
        {FILTERS.map((f) => <a key={f} href={`/super-admin/support?status=${f}`} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === f ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>{STATUS_LABEL[f]}</a>)}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center"><p className="text-sm font-medium text-gray-900">Aucun ticket</p></div>
      ) : (
        <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          {tickets.map((t) => (
            <a key={t.id} href={`/super-admin/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{t.subject}</p>
                <p className="text-xs text-gray-400">{t.schoolName} · {fmtDate(t.created_at)} · <span className={PRIORITY_CLASS[t.priority]}>{t.priority}</span></p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[t.status] ?? STATUS_CLASS.open}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
