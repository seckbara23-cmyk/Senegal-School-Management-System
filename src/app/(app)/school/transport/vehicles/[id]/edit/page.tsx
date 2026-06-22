import { notFound } from 'next/navigation'
import { requireTransportAdmin } from '../../../_auth'
import { VehicleForm } from '../../_VehicleForm'

type Props = { params: { id: string } }

export default async function EditVehiclePage({ params }: Props) {
  const { supabase, schoolId } = await requireTransportAdmin()

  const { data } = await supabase
    .from('transport_vehicles')
    .select('id, name, registration_plate, make, model, capacity, status, insurance_expiry_date, inspection_expiry_date, notes')
    .eq('id', params.id).eq('school_id', schoolId).maybeSingle()
  if (!data) notFound()
  const v = data as {
    id: string; name: string; registration_plate: string; make: string | null; model: string | null
    capacity: number; status: string; insurance_expiry_date: string | null; inspection_expiry_date: string | null; notes: string | null
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/transport/vehicles/${v.id}`} className="text-primary-300 hover:text-white text-sm">← {v.name}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier le véhicule</h1>
      </div>
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <VehicleForm mode="edit" defaults={v} />
      </div>
    </div>
  )
}
