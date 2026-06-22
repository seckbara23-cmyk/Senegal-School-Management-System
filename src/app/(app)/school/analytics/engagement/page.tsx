import { requireAnalyticsCtx } from '../_auth'
import { loadEngagementAnalytics } from '@/lib/analytics/engagement'
import { KpiCard, HBar, Panel } from '@/components/charts'

export const dynamic = 'force-dynamic'

const LEVEL_META: Record<string, { label: string; badge: string }> = {
  engaged:  { label: 'Engagé',  badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  moderate: { label: 'Modéré',  badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  low:      { label: 'Faible',  badge: 'border-red-200 bg-red-50 text-red-700' },
}

export default async function EngagementAnalyticsPage() {
  const { supabase, schoolId } = await requireAnalyticsCtx()
  const a = await loadEngagementAnalytics(supabase, schoolId)
  const maxLevel = Math.max(1, a.totals.engaged, a.totals.moderate, a.totals.low)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/analytics" className="text-primary-300 hover:text-white text-sm">← Analyses</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Engagement des parents</h1>
        <p className="text-primary-300 text-sm mt-0.5">Dérivé de l’activité in-app (lecture, messagerie, ponctualité) — sans suivi de connexion</p>
      </div>

      {a.totals.parents === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune famille</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Familles" value={a.totals.parents} tone="primary" />
            <KpiCard label="Taux de lecture" value={a.totals.avgReadRate !== null ? `${a.totals.avgReadRate}%` : '—'} sub="notifications" tone={a.totals.avgReadRate !== null && a.totals.avgReadRate < 50 ? 'amber' : 'emerald'} />
            <KpiCard label="Familles engagées" value={a.totals.engaged} sub={`sur ${a.totals.parents}`} tone="emerald" />
            <KpiCard label="Peu engagées" value={a.totals.low} sub="à solliciter" tone={a.totals.low > 0 ? 'red' : 'emerald'} />
          </div>

          <Panel title="Répartition de l’engagement">
            <div className="space-y-3">
              <HBar label="Engagé" value={a.totals.engaged} max={maxLevel} barClass="bg-emerald-500" />
              <HBar label="Modéré" value={a.totals.moderate} max={maxLevel} barClass="bg-amber-500" />
              <HBar label="Faible" value={a.totals.low} max={maxLevel} barClass="bg-red-500" />
            </div>
            <p className="mt-3 text-xs text-gray-400">Score dérivé : lecture des notifications (40), messagerie active (30), frais à jour (30). {a.totals.responders} famille{a.totals.responders !== 1 ? 's' : ''} a/ont déjà écrit à un enseignant.</p>
          </Panel>

          <Panel title="Familles à solliciter en priorité">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left">
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Famille</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Lecture</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Messagerie</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Frais</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Niveau</th>
                  </tr>
                </thead>
                <tbody>
                  {a.families.slice(0, 25).map((f, idx) => (
                    <tr key={f.parentId} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-3 py-2.5">
                        <a href={`/school/finance/families/${f.parentId}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{f.name}</a>
                        <span className="ml-1 text-xs text-gray-400">· {f.childCount} enf.</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{f.readRate !== null ? `${f.readRate}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-center">{f.sentMessage ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-center">{f.hasOverdue ? <span className="text-red-600">en retard</span> : <span className="text-emerald-600">à jour</span>}</td>
                      <td className="px-3 py-2.5 text-right"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LEVEL_META[f.level].badge}`}>{LEVEL_META[f.level].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
