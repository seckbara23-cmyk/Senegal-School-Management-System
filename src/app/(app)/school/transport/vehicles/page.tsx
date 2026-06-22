import { requireTransportAdmin } from '../_auth'
import {
  VEHICLE_STATUS_LABEL, VEHICLE_STATUS_CLASS, fmtDate, isExpiringSoon,
} from '@/lib/transport'

const PAGE_SIZE = 25

function buildUrl(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/school/transport/vehicles?${qs}` : '/school/transport/vehicles'
}

type Vehicle = {
  id: string; name: string; registration_plate: string; make: string | null; model: string | null
  capacity: number; status: string; insurance_expiry_date: string | null; inspection_expiry_date: string | null
}

type Props = { searchParams: { q?: string | string[]; page?: string | string[] } }

export default async function VehiclesPage({ searchParams }: Props) {
  const { supabase, schoolId, schoolName } = await requireTransportAdmin()

  const rawQ = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q) ?? ''
  const q = rawQ.trim().slice(0, 100).replace(/[,()]/g, '').trim()
  const rawPage = (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) ?? '1'
  const page = Math.max(1, Number(rawPage) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const base = supabase
    .from('transport_vehicles')
    .select('id, name, registration_plate, make, model, capacity, status, insurance_expiry_date, inspection_expiry_date', { count: 'exact' })
    .eq('school_id', schoolId)
  const filtered = q ? base.or(`name.ilike.%${q}%,registration_plate.ilike.%${q}%`) : base
  const { data, count, error } = await filtered.order('name', { ascending: true }).range(from, to)

  const vehicles = (data ?? []) as Vehicle[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/transport" className="text-primary-300 hover:text-white text-sm">← Transport</a>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Véhicules</h1>
            <p className="mt-0.5 text-sm text-primary-300">{schoolName}</p>
          </div>
          <a href="/school/transport/vehicles/new"
            className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors">
            + Nouveau véhicule
          </a>
        </div>
      </div>

      <form method="GET" action="/school/transport/vehicles" role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem] max-w-sm">
          <input type="search" name="q" defaultValue={q} placeholder="Nom ou immatriculation…" autoComplete="off"
            className="block w-full rounded-lg border border-sand-300 bg-white py-2 pl-3 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <button type="submit" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">Rechercher</button>
        {q && <a href="/school/transport/vehicles" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">Effacer</a>}
        {total > 0 && <span className="ml-auto inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">{total} véhicule{total !== 1 ? 's' : ''}</span>}
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Une erreur est survenue lors du chargement.</p>
        </div>
      )}

      {!error && total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <h3 className="text-base font-semibold text-gray-900">{q ? 'Aucun résultat' : 'Aucun véhicule enregistré'}</h3>
          <p className="mt-1 text-sm text-gray-500">{q ? 'Aucun véhicule ne correspond à votre recherche.' : 'Ajoutez le premier véhicule du parc de transport.'}</p>
          {!q && <a href="/school/transport/vehicles/new" className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">+ Nouveau véhicule</a>}
        </div>
      )}

      {!error && vehicles.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-sand-200">
                <thead>
                  <tr className="bg-sand-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Véhicule</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Immatriculation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Capacité</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Documents</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {vehicles.map((v) => {
                    const insSoon = isExpiringSoon(v.insurance_expiry_date, today)
                    const inspSoon = isExpiringSoon(v.inspection_expiry_date, today)
                    return (
                      <tr key={v.id} className="group transition-colors hover:bg-sand-50">
                        <td className="px-4 py-3.5">
                          <a href={`/school/transport/vehicles/${v.id}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline">{v.name}</a>
                          {(v.make || v.model) && <p className="text-xs text-gray-400 mt-0.5">{[v.make, v.model].filter(Boolean).join(' ')}</p>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><span className="font-mono text-sm text-gray-600">{v.registration_plate}</span></td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-600">{v.capacity} places</td>
                        <td className="px-4 py-3.5">
                          {(insSoon || inspSoon) ? (
                            <div className="flex flex-col gap-0.5">
                              {insSoon && <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Assurance {fmtDate(v.insurance_expiry_date)}</span>}
                              {inspSoon && <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Visite {fmtDate(v.inspection_expiry_date)}</span>}
                            </div>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VEHICLE_STATUS_CLASS[v.status] ?? ''}`}>{VEHICLE_STATUS_LABEL[v.status] ?? v.status}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <a href={`/school/transport/vehicles/${v.id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline">Voir →</a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-sand-100 sm:hidden">
              {vehicles.map((v) => (
                <a key={v.id} href={`/school/transport/vehicles/${v.id}`} className="flex items-start gap-3 px-4 py-4 hover:bg-primary-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{v.name}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{v.registration_plate} · {v.capacity} places</p>
                    <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${VEHICLE_STATUS_CLASS[v.status] ?? ''}`}>{VEHICLE_STATUS_LABEL[v.status] ?? v.status}</span>
                  </div>
                  <span className="text-gray-300 shrink-0 mt-1">→</span>
                </a>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              {page > 1 ? <a href={buildUrl(q, page - 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">← Précédent</a> : <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300">← Précédent</span>}
              <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
              {page < totalPages ? <a href={buildUrl(q, page + 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">Suivant →</a> : <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300">Suivant →</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
