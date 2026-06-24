import { requireSuperAdmin } from '../../_auth'
import { loadPilotTracker } from '@/lib/platform/pilot-execution'
import { FEATURES } from '@/lib/platform/ops'
import { KpiCard, HBar, Panel } from '@/components/charts'
import { PilotNav } from '../_nav'

export const dynamic = 'force-dynamic'

function activity(d: number | null): string { return d === null ? 'jamais' : d === 0 ? "auj." : `${d} j` }

export default async function PilotAdoptionPage() {
  await requireSuperAdmin()
  const { cohort, summary } = await loadPilotTracker()
  const n = cohort.length

  const adoption = FEATURES.map((f) => {
    const count = cohort.filter((s) => s.features.includes(f.key)).length
    return { key: f.key, label: f.label, count, rate: n ? Math.round((count / n) * 100) : 0 }
  }).sort((a, b) => b.count - a.count)
  const maxCount = Math.max(1, ...adoption.map((a) => a.count))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/pilots" className="text-primary-300 hover:text-white text-sm">← Exécution des pilotes</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Adoption du cohort</h1>
        <p className="text-primary-300 text-sm mt-0.5">Usage des modules par les {n} école(s) pilote(s).</p>
      </div>

      <PilotNav active="adoption" />

      {n === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center"><p className="text-sm font-medium text-gray-900">Aucune école pilote</p></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Modules / école" value={summary.avgFeatures} sub={`sur ${summary.featureTotal}`} tone="primary" />
            <KpiCard label="Actives (7 j)" value={`${summary.engagementRate}%`} sub={`${summary.engaged7d}/${n}`} tone={summary.engagementRate >= 50 ? 'emerald' : 'amber'} />
            <KpiCard label="Activation" value={`${summary.activationRate}%`} sub={`${summary.activated}/${n}`} tone={summary.activationRate >= 60 ? 'emerald' : 'amber'} />
            <KpiCard label="Saines / à surveiller" value={summary.health.healthy + summary.health.watch} sub={`sur ${n}`} tone="emerald" />
          </div>

          <Panel title="Taux d’adoption par module">
            <div className="space-y-2.5">
              {adoption.map((a) => <HBar key={a.key} label={a.label} value={a.count} max={maxCount} display={`${a.rate}% (${a.count})`} barClass={a.rate >= 50 ? 'bg-emerald-500' : a.rate >= 20 ? 'bg-amber-500' : 'bg-red-500'} />)}
            </div>
          </Panel>

          <Panel title="Matrice d’usage par école pilote">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left">
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">Activité</th>
                    {FEATURES.map((f) => <th key={f.key} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohort.map((s, idx) => (
                    <tr key={s.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-3 py-2"><a href={`/super-admin/pilots/${s.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{s.name}</a></td>
                      <td className="px-2 py-2 text-center text-[11px] text-gray-400">{activity(s.daysSinceActivity)}</td>
                      {FEATURES.map((f) => <td key={f.key} className="px-2 py-2 text-center">{s.features.includes(f.key) ? <span className="text-emerald-600">✓</span> : <span className="text-gray-200">·</span>}</td>)}
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
