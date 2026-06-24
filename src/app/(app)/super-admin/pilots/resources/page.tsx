import { requireSuperAdmin } from '../../_auth'
import { PILOT_RESOURCES, THEME_LABEL, type ResourceTheme } from '@/lib/platform/resources'
import { Panel } from '@/components/charts'
import { PilotNav } from '../_nav'

export const dynamic = 'force-dynamic'

const FORMAT_LABEL: Record<string, string> = { guide: 'Guide', checklist: 'Checklist', video: 'Vidéo', reference: 'Référence' }
const THEME_ORDER: ResourceTheme[] = ['onboarding', 'academics', 'finance', 'communication', 'engagement', 'admin']

export default async function ResourcesPage() {
  await requireSuperAdmin()

  const byTheme = new Map<ResourceTheme, typeof PILOT_RESOURCES>()
  for (const r of PILOT_RESOURCES) { const l = byTheme.get(r.theme) ?? []; l.push(r); byTheme.set(r.theme, l) }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/pilots" className="text-primary-300 hover:text-white text-sm">← Exécution des pilotes</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Centre de ressources</h1>
        <p className="text-primary-300 text-sm mt-0.5">Guides d’accompagnement à partager avec les écoles pilotes.</p>
      </div>

      <PilotNav active="resources" />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Chaque ressource pointe vers l’écran concerné dans l’espace école. Les recommandations apparaissent automatiquement dans l’espace d’onboarding de chaque pilote selon les étapes restantes.
      </div>

      {THEME_ORDER.filter((t) => byTheme.has(t)).map((theme) => (
        <Panel key={theme} title={THEME_LABEL[theme]}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(byTheme.get(theme) ?? []).map((r) => (
              <a key={r.key} href={r.href} className="flex flex-col rounded-xl border border-sand-200 bg-white p-4 shadow-sm transition-colors hover:border-primary-300 hover:bg-sand-50">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                  <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{FORMAT_LABEL[r.format]}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{r.desc}</p>
              </a>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  )
}
