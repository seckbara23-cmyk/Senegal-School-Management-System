import { requireSuperAdmin } from '../../_auth'
import { redirect } from 'next/navigation'
import { loadPilotWorkspace } from '@/lib/platform/pilot-execution'
import { resourcesForStep } from '@/lib/platform/resources'
import { Panel, KpiCard, ProgressRing } from '@/components/charts'
import { HEALTH_BAND_LABEL, HEALTH_BAND_CLASS } from '@/lib/platform/health'
import { actionLabel } from '@/lib/audit-labels'

export const dynamic = 'force-dynamic'

function fmt(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

export default async function PilotWorkspacePage({ params }: { params: { schoolId: string } }) {
  await requireSuperAdmin()
  const ws = await loadPilotWorkspace(params.schoolId)
  if (!ws) redirect('/super-admin/pilots/tracker')

  const { school, setup, milestones, recentActivity, openTickets } = ws
  const remaining = setup.steps.filter((s) => !s.optional && s.key !== 'review' && !s.done)
  const recommended = remaining.flatMap((s) => resourcesForStep(s.key)).slice(0, 6)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/pilots/tracker" className="text-primary-300 hover:text-white text-sm">← Suivi des pilotes</a></div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">{school.name}</h1>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${HEALTH_BAND_CLASS[school.health.band]}`}>{HEALTH_BAND_LABEL[school.health.band]}</span>
          {!school.isPilot && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Non pilote</span>}
        </div>
        <p className="text-primary-300 text-sm mt-0.5">Espace d’onboarding · <a href={`/super-admin/schools/${school.id}`} className="underline hover:text-white">fiche établissement</a></p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Élèves actifs" value={school.activeStudents} tone={school.activeStudents > 0 ? 'emerald' : 'amber'} />
        <KpiCard label="Enseignants" value={school.activeTeachers} tone="primary" />
        <KpiCard label="Recouvrement" value={school.collectionRate !== null ? `${school.collectionRate}%` : '—'} tone="primary" />
        <KpiCard label="Dernière activité" value={school.daysSinceActivity === null ? 'jamais' : school.daysSinceActivity === 0 ? "auj." : `${school.daysSinceActivity} j`} tone={school.daysSinceActivity !== null && school.daysSinceActivity <= 7 ? 'emerald' : 'amber'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Progression onboarding">
          <div className="flex items-center gap-4">
            <ProgressRing value={setup.percent} label="requis" className={setup.ready ? 'text-emerald-500' : 'text-primary-600'} />
            <div className="text-sm">
              <p className="font-semibold text-gray-900">{setup.requiredDone}/{setup.requiredTotal} étapes requises</p>
              <p className="text-gray-500">{setup.ready ? 'Prête à lancer ✓' : `${remaining.length} étape(s) restante(s)`}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5">
            {setup.steps.filter((s) => s.key !== 'review').map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className={s.done ? 'text-emerald-600' : 'text-gray-300'}>{s.done ? '✓' : '○'}</span>
                <span className={s.done ? 'text-gray-500' : 'text-gray-800'}>{s.title}</span>
                {s.optional && <span className="text-[10px] text-gray-400">(option)</span>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Jalons de valeur">
          <ul className="space-y-2">
            {milestones.map((m) => (
              <li key={m.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className={m.reached ? 'text-emerald-600' : 'text-gray-300'}>{m.reached ? '✓' : '○'}</span><span className={m.reached ? 'text-gray-800' : 'text-gray-400'}>{m.label}</span></span>
                <span className="text-xs text-gray-400">{m.reached ? (m.days !== null ? `J+${m.days}` : '✓') : '—'}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Support & retours" action={<a href="/super-admin/pilots/feedback" className="text-xs text-primary-600 hover:underline">Tous →</a>}>
          {openTickets.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun ticket ouvert.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {openTickets.map((t) => (
                <li key={t.id} className="py-2">
                  <a href={`/super-admin/support/${t.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-primary-600">
                    <span className="min-w-0 truncate text-gray-800">{t.subject}</span>
                    <span className={`shrink-0 text-[11px] ${t.isFeedback ? 'text-accent-600' : 'text-gray-400'}`}>{t.isFeedback ? 'retour' : t.priority}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Ressources recommandées">
          {recommended.length === 0 ? (
            <p className="text-sm text-gray-400">Onboarding complet — aucune action requise. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {recommended.map((r) => (
                <li key={r.key} className="rounded-lg border border-sand-200 p-3">
                  <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500">{r.desc}</p>
                </li>
              ))}
            </ul>
          )}
          <a href="/super-admin/pilots/resources" className="mt-3 inline-block text-xs text-primary-600 hover:underline">Centre de ressources →</a>
        </Panel>

        <Panel title="Activité récente">
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune activité enregistrée.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-gray-700">{actionLabel(a.action)}</span>
                  <span className="shrink-0 text-xs text-gray-400">{fmt(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
