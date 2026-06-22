import { requireTransportAdmin } from '../../_auth'
import { RouteForm } from '../_RouteForm'

export default async function NewRoutePage() {
  const { supabase, schoolId } = await requireTransportAdmin()

  const [{ data: vehiclesData }, { data: driversData }] = await Promise.all([
    supabase.from('transport_vehicles').select('id, name, registration_plate').eq('school_id', schoolId).eq('status', 'active').order('name'),
    supabase.from('transport_drivers').select('id, full_name').eq('school_id', schoolId).eq('status', 'active').order('full_name'),
  ])

  const vehicles = ((vehiclesData ?? []) as { id: string; name: string; registration_plate: string }[])
    .map((v) => ({ id: v.id, label: `${v.name} · ${v.registration_plate}` }))
  const drivers = ((driversData ?? []) as { id: string; full_name: string }[])
    .map((d) => ({ id: d.id, label: d.full_name }))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/transport/routes" className="text-primary-300 hover:text-white text-sm">← Itinéraires</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvel itinéraire</h1>
        <p className="mt-0.5 text-sm text-primary-300">Les arrêts s&apos;ajoutent ensuite depuis la fiche de l&apos;itinéraire</p>
      </div>
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <RouteForm mode="create" vehicles={vehicles} drivers={drivers} />
      </div>
    </div>
  )
}
