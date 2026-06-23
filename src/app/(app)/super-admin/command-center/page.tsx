import { requireSuperAdmin } from '../_auth'
import { loadPlatformOps } from '@/lib/platform/ops'
import { KpiCard, HBar, Panel } from '@/components/charts'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

const TOOLS = [
  { href: '/super-admin/health', icon: '❤️', title: 'Santé des écoles', desc: 'Scores dérivés & priorités' },
  { href: '/super-admin/monitoring', icon: '📡', title: 'Supervision', desc: 'Statut, activité, essais' },
  { href: '/super-admin/adoption', icon: '📈', title: 'Adoption', desc: 'Usage par fonctionnalité' },
  { href: '/super-admin/pilots', icon: '🚀', title: 'Pilotes', desc: 'Activation & jalons' },
  { href: '/super-admin/support', icon: '🎧', title: 'Support', desc: 'Tickets & suivi' },
  { href: '/super-admin/subscriptions', icon: '💳', title: 'Abonnements', desc: 'Facturation SaaS' },
]

export default async function CommandCenterPage() {
  await requireSuperAdmin()
  const ops = await loadPlatformOps()
  const k = ops.kpis
  const maxAdopt = Math.max(1, ...ops.adoption.map((a) => a.count))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin" className="text-primary-300 hover:text-white text-sm">← Super Admin</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Centre de commande</h1>
        <p className="text-primary-300 text-sm mt-0.5">Pilotage de ScolaTech · indicateurs dérivés en temps réel</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Écoles actives" value={k.active} sub={`${k.total} au total`} tone="primary" />
        <KpiCard label="MRR" value={fmt(k.mrr)} sub="revenu mensuel" tone="emerald" />
        <KpiCard label="Activation" value={`${k.activationRate}%`} sub={`${k.activated} activées`} tone={k.activationRate < 50 ? 'amber' : 'emerald'} />
        <KpiCard label="Écoles dormantes" value={k.dormant} sub=">30 j sans activité" href="/super-admin/monitoring" tone={k.dormant > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Saines" value={k.healthy} href="/super-admin/health" tone="emerald" />
        <KpiCard label="À surveiller" value={k.watch} href="/super-admin/health" tone="amber" />
        <KpiCard label="À risque / dormantes" value={k.risk + k.dormantBand} href="/super-admin/health" tone="red" />
        <KpiCard label="Tickets ouverts" value={k.openTickets} href="/super-admin/support" tone={k.openTickets > 0 ? 'amber' : 'emerald'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Alertes" action={<a href="/super-admin/monitoring" className="text-xs text-primary-600 hover:underline">Supervision →</a>}>
          {ops.alerts.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune alerte. Tout est au vert. 🎉</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {ops.alerts.slice(0, 12).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <a href={`/super-admin/schools/${a.schoolId}`} className="min-w-0 truncate text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline">{a.schoolName}</a>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${a.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{a.label}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Adoption par fonctionnalité" action={<a href="/super-admin/adoption" className="text-xs text-primary-600 hover:underline">Détail →</a>}>
          <div className="space-y-2.5">
            {ops.adoption.map((a) => <HBar key={a.key} label={a.label} value={a.count} max={maxAdopt} display={`${a.rate}%`} barClass="bg-primary-500" />)}
          </div>
        </Panel>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Outils d’exploitation</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <a key={t.href} href={t.href} className="flex items-start gap-3 rounded-xl border border-sand-200 bg-white p-4 shadow-sm hover:border-primary-300 hover:bg-sand-50 transition-colors">
              <span className="text-2xl">{t.icon}</span>
              <span><span className="block text-sm font-semibold text-gray-900">{t.title}</span><span className="block text-xs text-gray-500">{t.desc}</span></span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
