import { notFound } from 'next/navigation'
import { requireTransportAdmin } from '../../_auth'
import { setVehicleStatus } from '../../actions'
import { VEHICLE_STATUS_LABEL, VEHICLE_STATUS_CLASS, fmtDate, daysUntil, EXPIRY_WINDOW_DAYS } from '@/lib/transport'

const ERROR_MESSAGES: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  status:   'Le statut n’a pas pu être mis à jour. Veuillez réessayer.',
}

type Vehicle = {
  id: string; name: string; registration_plate: string; make: string | null; model: string | null
  capacity: number; status: string; insurance_expiry_date: string | null; inspection_expiry_date: string | null
  notes: string | null; created_at: string
}

type Props = { params: { id: string }; searchParams: { error?: string } }

function DocRow({ label, date, today }: { label: string; date: string | null; today: string }) {
  const d = daysUntil(date, today)
  const soon = d !== null && d <= EXPIRY_WINDOW_DAYS
  const expired = d !== null && d < 0
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-gray-900'}`}>
        {fmtDate(date)}
        {expired ? ' · expiré' : soon ? ` · dans ${d} j` : ''}
      </span>
    </div>
  )
}

export default async function VehicleDetailPage({ params, searchParams }: Props) {
  const { supabase, schoolId } = await requireTransportAdmin()

  const { data } = await supabase
    .from('transport_vehicles')
    .select('id, name, registration_plate, make, model, capacity, status, insurance_expiry_date, inspection_expiry_date, notes, created_at')
    .eq('id', params.id).eq('school_id', schoolId).maybeSingle()
  if (!data) notFound()
  const v = data as Vehicle

  // Routes currently using this vehicle.
  const { data: routesData } = await supabase
    .from('transport_routes').select('id, name, status').eq('school_id', schoolId).eq('vehicle_id', v.id).order('name')
  const routes = (routesData ?? []) as { id: string; name: string; status: string }[]

  const today = new Date().toISOString().slice(0, 10)
  const isActive = v.status === 'active'
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/transport/vehicles" className="text-primary-300 hover:text-white text-sm">← Véhicules</a>
        </div>
        <div className="flex items-start gap-4 mt-1">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{v.name}</h1>
            <p className="text-primary-300 text-sm mt-0.5 font-mono">{v.registration_plate}</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${VEHICLE_STATUS_CLASS[v.status] ?? ''}`}>{VEHICLE_STATUS_LABEL[v.status] ?? v.status}</span>
          </div>
          <a href={`/school/transport/vehicles/${v.id}/edit`} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors">Modifier</a>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-700">{errorMessage}</p></div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Capacité</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{v.capacity} places</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Marque / modèle</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Itinéraires</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{routes.length}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Enregistré le</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(v.created_at)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Documents & échéances</p></div>
        <div className="divide-y divide-sand-100">
          <DocRow label="Assurance" date={v.insurance_expiry_date} today={today} />
          <DocRow label="Visite technique" date={v.inspection_expiry_date} today={today} />
        </div>
      </div>

      {v.notes && (
        <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p></div>
          <p className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap">{v.notes}</p>
        </div>
      )}

      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Itinéraires utilisant ce véhicule</p></div>
        {routes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">Aucun itinéraire n&apos;utilise ce véhicule.</p>
        ) : (
          <div className="divide-y divide-sand-100">
            {routes.map((r) => (
              <a key={r.id} href={`/school/transport/routes/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-sand-50">
                <span className="text-sm font-medium text-gray-900">{r.name}</span>
                <span className="text-sm text-primary-600">Voir →</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-red-100 bg-red-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-red-500">Gestion du véhicule</p></div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{isActive ? 'Désactiver le véhicule' : 'Réactiver le véhicule'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{isActive ? 'Le véhicule n’apparaîtra plus comme actif. Pour « maintenance », utilisez Modifier.' : 'Le véhicule redevient actif dans le parc.'}</p>
          </div>
          <form action={setVehicleStatus}>
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="new_status" value={isActive ? 'inactive' : 'active'} />
            <button type="submit" className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{isActive ? 'Désactiver' : 'Réactiver'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
