import { notFound } from 'next/navigation'
import { requireTransportAdmin } from '../../_auth'
import { setDriverStatus } from '../../actions'
import { SIMPLE_STATUS_LABEL, SIMPLE_STATUS_CLASS, fmtDate, daysUntil, EXPIRY_WINDOW_DAYS } from '@/lib/transport'

const ERROR_MESSAGES: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  status:   'Le statut n’a pas pu être mis à jour. Veuillez réessayer.',
}

type Driver = {
  id: string; full_name: string; phone: string | null; address: string | null; license_number: string | null
  license_expiry_date: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null
  status: string; notes: string | null; created_at: string
}

type Props = { params: { id: string }; searchParams: { error?: string } }

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '—'}</span>
    </div>
  )
}

export default async function DriverDetailPage({ params, searchParams }: Props) {
  const { supabase, schoolId } = await requireTransportAdmin()

  const { data } = await supabase
    .from('transport_drivers')
    .select('id, full_name, phone, address, license_number, license_expiry_date, emergency_contact_name, emergency_contact_phone, status, notes, created_at')
    .eq('id', params.id).eq('school_id', schoolId).maybeSingle()
  if (!data) notFound()
  const d = data as Driver

  const { data: routesData } = await supabase
    .from('transport_routes').select('id, name').eq('school_id', schoolId).eq('driver_id', d.id).order('name')
  const routes = (routesData ?? []) as { id: string; name: string }[]

  const today = new Date().toISOString().slice(0, 10)
  const licDays = daysUntil(d.license_expiry_date, today)
  const licSoon = licDays !== null && licDays <= EXPIRY_WINDOW_DAYS
  const licExpired = licDays !== null && licDays < 0
  const isActive = d.status === 'active'
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/transport/drivers" className="text-primary-300 hover:text-white text-sm">← Chauffeurs</a></div>
        <div className="flex items-start gap-4 mt-1">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{d.full_name}</h1>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${SIMPLE_STATUS_CLASS[d.status] ?? ''}`}>{SIMPLE_STATUS_LABEL[d.status] ?? d.status}</span>
          </div>
          <a href={`/school/transport/drivers/${d.id}/edit`} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors">Modifier</a>
        </div>
      </div>

      {errorMessage && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-700">{errorMessage}</p></div>}

      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Coordonnées</p></div>
        <div className="divide-y divide-sand-100">
          <InfoRow label="Téléphone" value={d.phone} />
          <InfoRow label="Adresse" value={d.address} />
          <InfoRow label="Contact d’urgence" value={[d.emergency_contact_name, d.emergency_contact_phone].filter(Boolean).join(' · ') || null} />
        </div>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Permis de conduire</p></div>
        <div className="divide-y divide-sand-100">
          <InfoRow label="Numéro" value={d.license_number} />
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-sm text-gray-600">Expiration</span>
            <span className={`text-sm font-medium ${licExpired ? 'text-red-600' : licSoon ? 'text-amber-600' : 'text-gray-900'}`}>
              {fmtDate(d.license_expiry_date)}{licExpired ? ' · expiré' : licSoon ? ` · dans ${licDays} j` : ''}
            </span>
          </div>
        </div>
      </div>

      {d.notes && (
        <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p></div>
          <p className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap">{d.notes}</p>
        </div>
      )}

      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Itinéraires affectés</p></div>
        {routes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">Aucun itinéraire affecté à ce chauffeur.</p>
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
        <div className="border-b border-red-100 bg-red-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-red-500">Gestion du chauffeur</p></div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{isActive ? 'Désactiver le chauffeur' : 'Réactiver le chauffeur'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{isActive ? 'Le chauffeur n’apparaîtra plus comme actif.' : 'Le chauffeur redevient actif.'}</p>
          </div>
          <form action={setDriverStatus}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="new_status" value={isActive ? 'inactive' : 'active'} />
            <button type="submit" className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{isActive ? 'Désactiver' : 'Réactiver'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
