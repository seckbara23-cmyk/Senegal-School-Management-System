import { notFound } from 'next/navigation'
import { requireTransportAdmin } from '../../../_auth'
import { DriverForm } from '../../_DriverForm'

type Props = { params: { id: string } }

export default async function EditDriverPage({ params }: Props) {
  const { supabase, schoolId } = await requireTransportAdmin()

  const { data } = await supabase
    .from('transport_drivers')
    .select('id, full_name, phone, address, license_number, license_expiry_date, emergency_contact_name, emergency_contact_phone, status, notes')
    .eq('id', params.id).eq('school_id', schoolId).maybeSingle()
  if (!data) notFound()
  const d = data as {
    id: string; full_name: string; phone: string | null; address: string | null; license_number: string | null
    license_expiry_date: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; status: string; notes: string | null
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href={`/school/transport/drivers/${d.id}`} className="text-primary-300 hover:text-white text-sm">← {d.full_name}</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier le chauffeur</h1>
      </div>
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <DriverForm mode="edit" defaults={d} />
      </div>
    </div>
  )
}
