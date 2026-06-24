import { requireSuperAdmin } from '../../_auth'
import { loadCommercialReadiness } from '@/lib/platform/pilot-execution'
import { Panel, HBar, ProgressRing } from '@/components/charts'
import { PilotNav } from '../_nav'

export const dynamic = 'force-dynamic'

const BAND: Record<string, { label: string; cls: string; ring: string }> = {
  ready:       { label: 'Prêt au lancement commercial', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', ring: 'text-emerald-500' },
  approaching: { label: 'En approche', cls: 'border-amber-200 bg-amber-50 text-amber-700', ring: 'text-amber-500' },
  not_ready:   { label: 'Pas encore prêt', cls: 'border-red-200 bg-red-50 text-red-700', ring: 'text-red-500' },
}

function barClass(score: number): string { return score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500' }

export default async function ReadinessPage() {
  await requireSuperAdmin()
  const r = await loadCommercialReadiness()
  const band = BAND[r.band]
  const passed = r.gates.filter((g) => g.pass).length

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/pilots" className="text-primary-300 hover:text-white text-sm">← Exécution des pilotes</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Préparation commerciale</h1>
        <p className="text-primary-300 text-sm mt-0.5">Indice dérivé de la maturité du programme pilote.</p>
      </div>

      <PilotNav active="readiness" />

      {r.summary.cohortSize === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center"><p className="text-sm font-medium text-gray-900">Aucune école pilote</p><p className="mt-1 text-sm text-gray-500">L’indice se calcule sur la cohorte pilote.</p></div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4 rounded-xl border border-sand-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:gap-8">
            <ProgressRing value={r.overall} label="indice" className={band.ring} size={120} />
            <div>
              <span className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${band.cls}`}>{band.label}</span>
              <p className="mt-2 text-sm text-gray-600">{passed}/{r.gates.length} critères de lancement validés sur {r.summary.cohortSize} pilote(s).</p>
              <p className="mt-1 text-xs text-gray-400">Pondéré sur activation, engagement et santé du cohort.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Dimensions">
              <div className="space-y-3">
                {r.dimensions.map((d) => (
                  <div key={d.key}>
                    <HBar label={d.label} value={d.score} max={100} display={`${d.score}/100`} barClass={barClass(d.score)} />
                    <p className="mt-0.5 text-[11px] text-gray-400">{d.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Critères de lancement (go / no-go)">
              <ul className="divide-y divide-sand-100">
                {r.gates.map((g, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={g.pass ? 'text-emerald-600' : 'text-red-500'}>{g.pass ? '✓' : '✗'}</span>
                      <span className={g.pass ? 'text-gray-700' : 'text-gray-900 font-medium'}>{g.label}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${g.pass ? 'text-emerald-600' : 'text-red-500'}`}>{g.detail}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <p className="text-center text-xs text-gray-400">Indicateurs dérivés en temps réel — aucune donnée n’est figée ni stockée.</p>
        </>
      )}
    </div>
  )
}
