import { requireAnalyticsCtx } from '../_auth'
import { loadInsights } from '@/lib/analytics/insights'
import { KpiCard } from '@/components/charts'

export const dynamic = 'force-dynamic'

const LEVEL_META: Record<string, { label: string; badge: string; dot: string }> = {
  high:   { label: 'Risque élevé', badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
  medium: { label: 'Risque moyen', badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
}

type Props = { searchParams: { level?: string } }

export default async function InsightsPage({ searchParams }: Props) {
  const { supabase, schoolId } = await requireAnalyticsCtx()
  const { summary, watch, factors } = await loadInsights(supabase, schoolId)

  const levelFilter = searchParams.level === 'high' || searchParams.level === 'medium' ? searchParams.level : ''
  const list = levelFilter ? watch.filter((w) => w.level === levelFilter) : watch

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/analytics" className="text-primary-300 hover:text-white text-sm">← Analyses</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Signaux & alertes précoces</h1>
        <p className="text-primary-300 text-sm mt-0.5">Liste de vigilance dérivée en temps réel — aucun score n’est enregistré</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Élèves à risque" value={summary.total} tone={summary.high > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Risque élevé" value={summary.high} tone="red" />
        <KpiCard label="Signal académique" value={factors.academic} sub="moyenne / échecs" tone="amber" />
        <KpiCard label="Signal assiduité" value={factors.attendance} sub="absences / retards" tone="amber" />
        <KpiCard label="Signal financier" value={factors.finance} sub="impayés" tone="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a href="/school/analytics/insights" className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${!levelFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Tous</a>
        <a href="/school/analytics/insights?level=high" className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${levelFilter === 'high' ? 'border-red-300 bg-red-50 text-red-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Élevé</a>
        <a href="/school/analytics/insights?level=medium" className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${levelFilter === 'medium' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Moyen</a>
        <a href="/school/academic-support" className="ml-auto text-xs text-primary-600 hover:underline">Cellule de soutien →</a>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun élève à risque {levelFilter ? 'pour ce filtre' : ''}</p>
          <p className="mt-1 text-sm text-gray-500">Les indicateurs sont au vert, ou les données sont insuffisantes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const meta = LEVEL_META[r.level]
            return (
              <div key={r.studentId} className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a href={`/school/students/${r.studentId}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline">{r.lastName} {r.firstName}</a>
                    <p className="text-xs text-gray-400">{r.className}{r.average !== null ? ` · moyenne ${r.average}/20` : ''}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Motifs</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.reasons.map((x, i) => <li key={i} className="text-xs text-gray-700">{x}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions recommandées</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.actions.map((x, i) => <li key={i} className="text-xs text-primary-700">{x}</li>)}</ul>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
