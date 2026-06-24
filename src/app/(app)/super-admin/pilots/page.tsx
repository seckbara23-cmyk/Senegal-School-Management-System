import { requireSuperAdmin } from '../_auth'
import { loadPilotDashboard } from '@/lib/platform/pilots'
import { togglePilot } from './actions'
import { KpiCard, HBar, Panel } from '@/components/charts'
import { HEALTH_BAND_LABEL } from '@/lib/platform/health'
import { PilotNav } from './_nav'

export const dynamic = 'force-dynamic'

export default async function PilotsPage() {
  await requireSuperAdmin()
  const d = await loadPilotDashboard()
  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.reached), d.cohort.length)
  const maxAdopt = Math.max(1, ...d.adoption.map((a) => a.count))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/command-center" className="text-primary-300 hover:text-white text-sm">← Centre de commande</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Exécution des pilotes</h1>
        <p className="text-primary-300 text-sm mt-0.5">Cohorte de {d.cohort.length} école(s) pilote(s).</p>
      </div>

      <PilotNav active="dashboard" />

      {d.cohort.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune école pilote</p>
          <p className="mt-1 text-sm text-gray-500">Marquez des écoles comme pilotes ci-dessous pour suivre leur activation.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Activées" value={`${d.activated}/${d.cohort.length}`} sub={`${d.activationRate}%`} tone={d.activationRate < 50 ? 'amber' : 'emerald'} />
            <KpiCard label="Délai médian d’activation" value={d.medianActivationDays !== null ? `${d.medianActivationDays} j` : '—'} sub="au 1er élève" tone="primary" />
            <KpiCard label="Écoles saines" value={d.health.healthy} sub={`sur ${d.cohort.length}`} tone="emerald" />
            <KpiCard label="À risque / dormantes" value={d.health.risk + d.health.dormant} tone={d.health.risk + d.health.dormant > 0 ? 'red' : 'emerald'} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Funnel d’onboarding">
              <div className="space-y-2.5">
                {d.funnel.map((f) => <HBar key={f.key} label={f.label} value={f.reached} max={maxFunnel} display={`${f.reached}/${d.cohort.length}`} barClass="bg-primary-500" />)}
              </div>
            </Panel>

            <Panel title="Time-to-first-value (jours médians)">
              <ul className="divide-y divide-sand-100">
                {d.milestones.map((m) => (
                  <li key={m.key} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-600">{m.label}</span>
                    <span className="font-semibold text-gray-900">{m.medianDays !== null ? `${m.medianDays} j` : '—'} <span className="font-normal text-gray-400">({m.count})</span></span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Adoption du cohort">
            <div className="space-y-2.5">
              {d.adoption.map((a) => <HBar key={a.key} label={a.label} value={a.count} max={maxAdopt} display={`${a.rate}%`} barClass={a.rate >= 50 ? 'bg-emerald-500' : 'bg-amber-500'} />)}
            </div>
          </Panel>

          <Panel title="Écoles pilotes">
            <ul className="divide-y divide-sand-100">
              {d.cohort.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <a href={`/super-admin/schools/${s.id}`} className="min-w-0 truncate text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline">{s.name}</a>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-gray-400">{d.setupBySchool[s.id] ?? 0}% · {HEALTH_BAND_LABEL[s.health.band]}</span>
                    <form action={togglePilot}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="value" value="false" /><button type="submit" className="text-xs font-medium text-red-600 hover:underline">Retirer</button></form>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      {d.nonPilots.length > 0 && (
        <Panel title="Ajouter au cohort pilote">
          <div className="flex flex-wrap gap-2">
            {d.nonPilots.map((s) => (
              <form key={s.id} action={togglePilot}>
                <input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="value" value="true" />
                <button type="submit" className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-primary-300 hover:bg-primary-50">+ {s.name}</button>
              </form>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
