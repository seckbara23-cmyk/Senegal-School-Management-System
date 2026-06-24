import { requireSuperAdmin } from '../../_auth'
import { loadPilotTracker } from '@/lib/platform/pilot-execution'
import { KpiCard, Panel } from '@/components/charts'
import { HEALTH_BAND_LABEL, HEALTH_BAND_CLASS } from '@/lib/platform/health'
import { PilotNav } from '../_nav'

export const dynamic = 'force-dynamic'

function activity(d: number | null): string { return d === null ? 'jamais' : d === 0 ? "aujourd'hui" : `${d} j` }

export default async function PilotTrackerPage() {
  await requireSuperAdmin()
  const { rows, summary } = await loadPilotTracker()

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/pilots" className="text-primary-300 hover:text-white text-sm">← Exécution des pilotes</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Suivi des écoles pilotes</h1>
        <p className="text-primary-300 text-sm mt-0.5">Onboarding, jalons et activité par établissement.</p>
      </div>

      <PilotNav active="tracker" />

      {summary.cohortSize === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune école pilote</p>
          <p className="mt-1 text-sm text-gray-500">Ajoutez des écoles au cohort depuis le tableau de bord.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Onboarding moyen" value={`${summary.avgOnboarding}%`} sub={`${summary.readyCount}/${summary.cohortSize} prêtes`} tone={summary.avgOnboarding >= 80 ? 'emerald' : 'amber'} />
            <KpiCard label="Activées" value={`${summary.activated}/${summary.cohortSize}`} sub={`${summary.activationRate}%`} tone={summary.activationRate >= 60 ? 'emerald' : 'amber'} />
            <KpiCard label="Actives (7 j)" value={`${summary.engaged7d}/${summary.cohortSize}`} sub={`${summary.engagementRate}%`} tone={summary.engagementRate >= 50 ? 'emerald' : 'amber'} />
            <KpiCard label="Tickets ouverts" value={summary.openTickets} sub={`${summary.feedbackCount} retour(s)`} tone={summary.openTickets > 0 ? 'amber' : 'emerald'} />
          </div>

          <Panel title="Écoles pilotes">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left">
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                    <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Onboarding</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Jalons</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Activation</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Activité</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Santé</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.school.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-3 py-2">
                        <a href={`/super-admin/pilots/${r.school.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{r.school.name}</a>
                        {r.stepsRemaining.length > 0 && <p className="truncate text-[11px] text-gray-400" title={r.stepsRemaining.join(', ')}>Reste : {r.stepsRemaining.slice(0, 2).join(', ')}{r.stepsRemaining.length > 2 ? '…' : ''}</p>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sand-100"><div className={`h-full rounded-full ${r.ready ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${r.onboardingPercent}%` }} /></div>
                          <span className="text-xs font-medium text-gray-600">{r.onboardingPercent}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-gray-600">{r.milestonesReached}/{r.milestonesTotal}</td>
                      <td className="px-2 py-2 text-center text-xs">{r.ttvDays !== null ? <span className="font-medium text-emerald-600">{r.ttvDays} j</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-2 py-2 text-center text-xs text-gray-500">{activity(r.daysSinceActivity)}</td>
                      <td className="px-2 py-2 text-center"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${HEALTH_BAND_CLASS[r.school.health.band]}`}>{HEALTH_BAND_LABEL[r.school.health.band]}</span></td>
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
