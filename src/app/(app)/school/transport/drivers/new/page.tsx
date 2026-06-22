import { requireTransportAdmin } from '../../_auth'
import { DriverForm } from '../_DriverForm'

export default async function NewDriverPage() {
  await requireTransportAdmin()
  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/transport/drivers" className="text-primary-300 hover:text-white text-sm">← Chauffeurs</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouveau chauffeur</h1>
        <p className="mt-0.5 text-sm text-primary-300">Ajout d&apos;un chauffeur au transport scolaire</p>
      </div>
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <DriverForm mode="create" />
      </div>
    </div>
  )
}
