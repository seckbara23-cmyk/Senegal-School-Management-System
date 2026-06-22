import { requireTransportAdmin } from '../_auth'
import { SIMPLE_STATUS_LABEL, SIMPLE_STATUS_CLASS, fmtFCFA } from '@/lib/transport'

type Route = {
  id: string; name: string; status: string; monthly_fee: number
  transport_vehicles: { name: string } | null
  transport_drivers: { full_name: string } | null
}

export default async function RoutesPage() {
  const { supabase, schoolId, schoolName } = await requireTransportAdmin()

  const [{ data: routesData, error }, { data: ridersData }] = await Promise.all([
    supabase
      .from('transport_routes')
      .select('id, name, status, monthly_fee, transport_vehicles(name), transport_drivers(full_name)')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),
    supabase
      .from('student_transport_assignments')
      .select('route_id')
      .eq('school_id', schoolId)
      .eq('status', 'active'),
  ])

  const routes = (routesData ?? []) as unknown as Route[]
  const riders = new Map<string, number>()
  for (const r of (ridersData ?? []) as { route_id: string }[]) {
    riders.set(r.route_id, (riders.get(r.route_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/transport" className="text-primary-300 hover:text-white text-sm">← Transport</a></div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Itinéraires</h1>
            <p className="mt-0.5 text-sm text-primary-300">{schoolName}</p>
          </div>
          <a href="/school/transport/routes/new" className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors">+ Nouvel itinéraire</a>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-700">Une erreur est survenue lors du chargement.</p></div>}

      {!error && routes.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucun itinéraire</h3>
          <p className="mt-1 text-sm text-gray-500">Créez un itinéraire, puis ajoutez ses arrêts et affectez des élèves.</p>
          <a href="/school/transport/routes/new" className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">+ Nouvel itinéraire</a>
        </div>
      )}

      {!error && routes.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {routes.map((r) => (
            <a key={r.id} href={`/school/transport/routes/${r.id}`} className="group rounded-xl border border-sand-200 bg-white p-5 shadow-sm transition-all hover:border-primary-200 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold text-gray-900 group-hover:text-primary-700">{r.name}</h2>
                <span className={`shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${SIMPLE_STATUS_CLASS[r.status] ?? ''}`}>{SIMPLE_STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-gray-400">Véhicule</dt><dd className="text-gray-700 text-right">{r.transport_vehicles?.name ?? '—'}</dd>
                <dt className="text-gray-400">Chauffeur</dt><dd className="text-gray-700 text-right">{r.transport_drivers?.full_name ?? '—'}</dd>
                <dt className="text-gray-400">Élèves</dt><dd className="text-gray-700 text-right">{riders.get(r.id) ?? 0}</dd>
                <dt className="text-gray-400">Frais mensuel</dt><dd className="text-gray-900 font-semibold text-right">{fmtFCFA(r.monthly_fee)}</dd>
              </dl>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
