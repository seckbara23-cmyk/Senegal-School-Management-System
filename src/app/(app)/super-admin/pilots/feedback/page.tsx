import { requireSuperAdmin } from '../../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { KpiCard, Panel } from '@/components/charts'
import { PilotNav } from '../_nav'
import { FeedbackCapture } from './_capture'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = { bug: 'Bug', usability: 'Ergonomie', feature: 'Suggestion', praise: 'Point positif' }
const TYPE_CLASS: Record<string, string> = {
  bug: 'border-red-200 bg-red-50 text-red-700', usability: 'border-amber-200 bg-amber-50 text-amber-700',
  feature: 'border-sky-200 bg-sky-50 text-sky-700', praise: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}
const STATUS_LABEL: Record<string, string> = { open: 'Ouvert', in_progress: 'En cours', waiting: 'En attente', resolved: 'Résolu', closed: 'Fermé' }
const TYPES = ['bug', 'usability', 'feature', 'praise']

function one<T>(v: T | T[] | null | undefined): T | null { return v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v) }
function fmt(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }

export default async function FeedbackPage({ searchParams }: { searchParams: { type?: string; created?: string } }) {
  await requireSuperAdmin()
  const admin = createAdminClient()
  const filterType = TYPES.includes(searchParams.type ?? '') ? searchParams.type! : null

  let q = admin.from('support_tickets').select('id, subject, category, status, priority, created_at, schools!school_id(name, is_pilot)').like('category', 'feedback_%').order('created_at', { ascending: false }).limit(200)
  if (filterType) q = q.eq('category', `feedback_${filterType}`)
  const { data } = await q
  type Row = { id: string; subject: string; category: string; status: string; priority: string; created_at: string; schools: unknown }
  const rows = ((data ?? []) as Row[]).map((t) => {
    const sc = one<{ name: string; is_pilot: boolean }>(t.schools as never)
    return { ...t, type: t.category.replace('feedback_', ''), schoolName: sc?.name ?? '—', isPilot: !!sc?.is_pilot }
  })

  // Sentiment summary (computed from the full feedback set, unfiltered).
  const { data: allFb } = await admin.from('support_tickets').select('category').like('category', 'feedback_%')
  const counts: Record<string, number> = { bug: 0, usability: 0, feature: 0, praise: 0 }
  for (const r of (allFb ?? []) as { category: string }[]) { const t = r.category.replace('feedback_', ''); if (t in counts) counts[t]++ }
  const total = counts.bug + counts.usability + counts.feature + counts.praise
  const issues = counts.bug + counts.usability

  const { data: schoolsData } = await admin.from('schools').select('id, name, is_pilot').neq('subscription_status', 'archived').order('is_pilot', { ascending: false }).order('name')
  const schools = (schoolsData ?? []) as { id: string; name: string; is_pilot: boolean }[]

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/pilots" className="text-primary-300 hover:text-white text-sm">← Exécution des pilotes</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Gestion des retours</h1>
        <p className="text-primary-300 text-sm mt-0.5">Retours pilotes — suivis dans le CRM de support.</p>
      </div>

      <PilotNav active="feedback" />

      {searchParams.created && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Retour enregistré.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Retours" value={total} tone="primary" />
        <KpiCard label="Points positifs" value={counts.praise} tone="emerald" />
        <KpiCard label="Problèmes" value={issues} sub="bug + ergonomie" tone={issues > 0 ? 'amber' : 'emerald'} />
        <KpiCard label="Suggestions" value={counts.feature} tone="sky" />
      </div>

      <FeedbackCapture schools={schools} />

      <div className="flex flex-wrap gap-2">
        <a href="/super-admin/pilots/feedback" className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!filterType ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Tous</a>
        {TYPES.map((t) => <a key={t} href={`/super-admin/pilots/feedback?type=${t}`} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filterType === t ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>{TYPE_LABEL[t]} ({counts[t]})</a>)}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center"><p className="text-sm font-medium text-gray-900">Aucun retour</p><p className="mt-1 text-sm text-gray-500">Enregistrez le premier retour ci-dessus.</p></div>
      ) : (
        <Panel title="Retours récents">
          <div className="divide-y divide-sand-100">
            {rows.map((t) => (
              <a key={t.id} href={`/super-admin/support/${t.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-sand-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{t.subject}</p>
                  <p className="text-xs text-gray-400">{t.isPilot ? '★ ' : ''}{t.schoolName} · {fmt(t.created_at)} · {STATUS_LABEL[t.status] ?? t.status}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TYPE_CLASS[t.type] ?? 'border-gray-200 bg-gray-50 text-gray-600'}`}>{TYPE_LABEL[t.type] ?? t.type}</span>
              </a>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
