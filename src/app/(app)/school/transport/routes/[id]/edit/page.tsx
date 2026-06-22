import { notFound } from 'next/navigation'
import { requireTransportAdmin } from '../../../_auth'
import { RouteForm } from '../../_RouteForm'

type Props = { params: { id: string } }

export default async function EditRoutePage({ params }: Props) {
  const { supabase, schoolId } = await requireTransportAdmin()

  const [{ data: routeData }, { data: vehiclesData }, { data: driversData }] = await Promise.all([
    supabase.from('transport_routes').select('id, name, description, vehicle_id, driver_id, status, monthly_fee').eq('id', params.id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('transport_vehicles').select('id, name, registration_plate').eq('school_id', schoolId).order('name'),
    supabase.from('transport_drivers').select('id, full_name').eq('school_id', schoolId).order('full_name'),
  ])
  if (!routeData) notFound()
  const route = routeData as {
    id: string; name: string; description: string | null; vehicle_id: string | null; driver_id: string | null; status: string; monthly_fee: number
  }

  const vehicles = ((vehiclesData ?? []) as { id: string; name: string; registration_plate: string }[])
    .map((v) => ({ id: v.id, label: `${v.name} · ${v.registration_plate}` }))
  const drivers = ((driversData ?? []) as { id: string; full_name: string }[]).map((d) => ({ id: d.id, label: d.full_name }))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href={`/school/transport/routes/${route.id}`} className="text-primary-300 hover:text-white text-sm">← {route.name}</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier l&apos;itinéraire</h1>
      </div>
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <RouteForm mode="edit" defaults={route} vehicles={vehicles} drivers={drivers} />
      </div>
    </div>
  )
}
