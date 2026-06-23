import { requireSuperAdmin } from '../../_auth'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { setTicketStatus, addTicketNote } from '../actions'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { open: 'Ouvert', in_progress: 'En cours', waiting: 'En attente', resolved: 'Résolu', closed: 'Fermé' }
const STATUS_CLASS: Record<string, string> = {
  open: 'border-sky-200 bg-sky-50 text-sky-700', in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  waiting: 'border-gray-200 bg-gray-100 text-gray-500', resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700', closed: 'border-gray-200 bg-gray-100 text-gray-400',
}
const EVENT_LABEL: Record<string, string> = { created: 'Ticket créé', note: 'Note', status_change: 'Statut modifié', assignment: 'Assignation' }
const NEXT: { status: string; label: string; tone: string }[] = [
  { status: 'in_progress', label: 'Prendre en charge', tone: 'bg-amber-500 hover:bg-amber-600 text-white' },
  { status: 'waiting', label: 'En attente', tone: 'bg-gray-500 hover:bg-gray-600 text-white' },
  { status: 'resolved', label: 'Résoudre', tone: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  { status: 'closed', label: 'Fermer', tone: 'bg-gray-700 hover:bg-gray-800 text-white' },
  { status: 'open', label: 'Rouvrir', tone: 'border border-sand-300 bg-white text-gray-700 hover:bg-sand-50' },
]

function one<T>(v: T | T[] | null | undefined): T | null { return v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v) }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
const field = 'block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600'

export default async function TicketDetailPage({ params }: { params: { ticketId: string } }) {
  await requireSuperAdmin()
  const admin = createAdminClient()

  const { data } = await admin.from('support_tickets').select('id, subject, body, priority, status, category, created_at, school_id, schools!school_id(name)').eq('id', params.ticketId).maybeSingle()
  if (!data) notFound()
  const t = data as unknown as { id: string; subject: string; body: string | null; priority: string; status: string; category: string | null; created_at: string; school_id: string; schools: { name: string } | null }
  const schoolName = one<{ name: string }>(t.schools as never)?.name ?? '—'

  const { data: evData } = await admin.from('support_ticket_events').select('id, type, message, status_from, status_to, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false })
  const events = (evData ?? []) as { id: string; type: string; message: string | null; status_from: string | null; status_to: string | null; created_at: string }[]

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/support" className="text-primary-300 hover:text-white text-sm">← Support</a></div>
        <div className="mb-1"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[t.status] ?? STATUS_CLASS.open}`}>{STATUS_LABEL[t.status] ?? t.status}</span></div>
        <h1 className="text-xl font-bold text-white tracking-tight">{t.subject}</h1>
        <p className="text-primary-300 text-sm mt-0.5"><a href={`/super-admin/schools/${t.school_id}`} className="hover:text-white hover:underline">{schoolName}</a> · {t.priority}{t.category ? ` · ${t.category}` : ''}</p>
      </div>

      {t.body && <div className="rounded-xl border border-sand-200 bg-white p-5 text-sm text-gray-700 whitespace-pre-wrap shadow-sm">{t.body}</div>}

      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Changer le statut</p>
        <div className="flex flex-wrap gap-2">
          {NEXT.filter((n) => n.status !== t.status).map((n) => (
            <form key={n.status} action={setTicketStatus}>
              <input type="hidden" name="ticket_id" value={t.id} /><input type="hidden" name="status" value={n.status} />
              <button type="submit" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${n.tone}`}>{n.label}</button>
            </form>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Suivi</p>
        <form action={addTicketNote} className="mb-4 space-y-2">
          <input type="hidden" name="ticket_id" value={t.id} />
          <textarea name="message" required rows={2} maxLength={4000} placeholder="Ajouter une note…" className={field} />
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700">Ajouter</button>
        </form>
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
              <div className="min-w-0">
                <p className="text-sm text-gray-800"><span className="font-semibold">{EVENT_LABEL[e.type] ?? e.type}</span>{e.status_to ? ` · ${STATUS_LABEL[e.status_to] ?? e.status_to}` : ''}</p>
                {e.message && <p className="text-sm text-gray-600 whitespace-pre-wrap">{e.message}</p>}
                <p className="text-[11px] text-gray-400">{fmtDateTime(e.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
