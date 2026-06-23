import { requireSuperAdmin } from '../_auth'
import { loadPlatformOps, FEATURES } from '@/lib/platform/ops'
import { HBar, Panel } from '@/components/charts'

export const dynamic = 'force-dynamic'

export default async function AdoptionPage() {
  await requireSuperAdmin()
  const ops = await loadPlatformOps()
  const activeSchools = ops.schools.filter((s) => s.subscriptionStatus === 'active')
  const maxCount = Math.max(1, ...ops.adoption.map((a) => a.count))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/command-center" className="text-primary-300 hover:text-white text-sm">← Centre de commande</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Adoption des fonctionnalités</h1>
        <p className="text-primary-300 text-sm mt-0.5">Part des écoles actives utilisant chaque module ({activeSchools.length} écoles).</p>
      </div>

      <Panel title="Taux d’adoption">
        <div className="space-y-3">
          {ops.adoption.map((a) => <HBar key={a.key} label={a.label} value={a.count} max={maxCount} display={`${a.rate}% (${a.count})`} barClass={a.rate >= 50 ? 'bg-emerald-500' : a.rate >= 20 ? 'bg-amber-500' : 'bg-red-500'} />)}
        </div>
      </Panel>

      <Panel title="Matrice d’usage par école">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left">
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                {FEATURES.map((f) => <th key={f.key} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {activeSchools.map((s, idx) => (
                <tr key={s.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-3 py-2"><a href={`/super-admin/schools/${s.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{s.name}</a></td>
                  {FEATURES.map((f) => <td key={f.key} className="px-2 py-2 text-center">{s.features.includes(f.key) ? <span className="text-emerald-600">✓</span> : <span className="text-gray-200">·</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
