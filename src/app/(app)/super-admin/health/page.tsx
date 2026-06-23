import { requireSuperAdmin } from '../_auth'
import { loadPlatformOps } from '@/lib/platform/ops'
import { HEALTH_BAND_LABEL, HEALTH_BAND_CLASS, type HealthBand } from '@/lib/platform/health'

export const dynamic = 'force-dynamic'

const BANDS: HealthBand[] = ['healthy', 'watch', 'risk', 'dormant', 'suspended']

function activityLabel(days: number | null): string {
  if (days === null) return 'jamais'
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

type Props = { searchParams: { band?: string } }

export default async function HealthPage({ searchParams }: Props) {
  await requireSuperAdmin()
  const ops = await loadPlatformOps()

  const counts: Record<string, number> = {}
  for (const s of ops.schools) counts[s.health.band] = (counts[s.health.band] ?? 0) + 1
  const band = BANDS.includes(searchParams.band as HealthBand) ? (searchParams.band as HealthBand) : null
  const rows = band ? ops.schools.filter((s) => s.health.band === band) : ops.schools

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/super-admin/command-center" className="text-primary-300 hover:text-white text-sm">← Centre de commande</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Santé des écoles</h1>
        <p className="text-primary-300 text-sm mt-0.5">Score dérivé : activité, données, recouvrement, facturation.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/super-admin/health" className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!band ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Toutes ({ops.schools.length})</a>
        {BANDS.map((b) => (
          <a key={b} href={`/super-admin/health?band=${b}`} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${band === b ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>{HEALTH_BAND_LABEL[b]} ({counts[b] ?? 0})</a>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Score</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">État</th>
                <th className="hidden sm:table-cell px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Élèves</th>
                <th className="hidden sm:table-cell px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Recouvrement</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Dernière activité</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, idx) => (
                <tr key={s.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3">
                    <a href={`/super-admin/schools/${s.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{s.name}</a>
                    {s.isPilot && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Pilote</span>}
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-gray-800">{s.health.score}</td>
                  <td className="px-3 py-3 text-center"><span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${HEALTH_BAND_CLASS[s.health.band]}`}>{HEALTH_BAND_LABEL[s.health.band]}</span></td>
                  <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-600">{s.activeStudents}</td>
                  <td className="hidden sm:table-cell px-3 py-3 text-center text-gray-600">{s.collectionRate !== null ? `${s.collectionRate}%` : '—'}</td>
                  <td className="px-3 py-3 text-right text-xs text-gray-400 whitespace-nowrap">{activityLabel(s.daysSinceActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
