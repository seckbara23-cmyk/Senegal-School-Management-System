import { requireSuperAdmin } from '../_auth'
import { loadPlatformOps } from '@/lib/platform/ops'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { active: 'Active', suspended: 'Suspendue', archived: 'Archivée', inactive: 'Inactive' }
const STATUS_CLASS: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700', suspended: 'border-red-200 bg-red-50 text-red-700',
  archived: 'border-gray-200 bg-gray-100 text-gray-500', inactive: 'border-amber-200 bg-amber-50 text-amber-700',
}

function activityLabel(days: number | null): string {
  if (days === null) return 'jamais'
  if (days === 0) return "aujourd'hui"
  return `il y a ${days} j`
}
function trialLabel(iso: string | null): string {
  if (!iso) return '—'
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (d < 0) return 'expiré'
  return `${d} j`
}

type Props = { searchParams: { status?: string } }

export default async function MonitoringPage({ searchParams }: Props) {
  await requireSuperAdmin()
  const ops = await loadPlatformOps()

  const filter = ['active', 'suspended', 'archived'].includes(searchParams.status ?? '') ? searchParams.status! : null
  const rows = filter ? ops.schools.filter((s) => s.subscriptionStatus === filter) : ops.schools

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/command-center" className="text-primary-300 hover:text-white text-sm">← Centre de commande</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Supervision des tenants</h1>
        <p className="text-primary-300 text-sm mt-0.5">Statut, activité, essais et facturation par école.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actives</p><p className="mt-1 text-2xl font-bold text-emerald-600">{ops.kpis.active}</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Dormantes</p><p className="mt-1 text-2xl font-bold text-red-600">{ops.kpis.dormant}</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Essais ≤7 j</p><p className="mt-1 text-2xl font-bold text-amber-600">{ops.kpis.trialExpiringSoon}</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Suspendues</p><p className="mt-1 text-2xl font-bold text-gray-700">{ops.kpis.suspended}</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/super-admin/monitoring" className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!filter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Toutes</a>
        {['active', 'suspended', 'archived'].map((st) => (
          <a key={st} href={`/super-admin/monitoring?status=${st}`} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === st ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>{STATUS_LABEL[st]}</a>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                <th className="hidden sm:table-cell px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Facturation</th>
                <th className="hidden md:table-cell px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Élèves / Ens.</th>
                <th className="hidden sm:table-cell px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Essai</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Activité</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, idx) => {
                const dormant = s.subscriptionStatus === 'active' && s.activeStudents > 0 && (s.daysSinceActivity === null || s.daysSinceActivity > 30)
                return (
                  <tr key={s.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3"><a href={`/super-admin/schools/${s.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{s.name}</a>{s.isPilot && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Pilote</span>}</td>
                    <td className="px-3 py-3 text-center"><span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[s.subscriptionStatus] ?? STATUS_CLASS.inactive}`}>{STATUS_LABEL[s.subscriptionStatus] ?? s.subscriptionStatus}</span></td>
                    <td className="hidden sm:table-cell px-3 py-3 text-center text-xs text-gray-500">{s.billingStatus ?? '—'}</td>
                    <td className="hidden md:table-cell px-3 py-3 text-center text-gray-600">{s.activeStudents} / {s.activeTeachers}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-center text-xs text-gray-500">{trialLabel(s.trialEndsAt)}</td>
                    <td className="px-3 py-3 text-right text-xs whitespace-nowrap"><span className={dormant ? 'font-semibold text-red-600' : 'text-gray-400'}>{activityLabel(s.daysSinceActivity)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
