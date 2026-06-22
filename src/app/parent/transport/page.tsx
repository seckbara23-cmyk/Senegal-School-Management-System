import { requireParentCtx } from '../_auth'
import { fmtTime } from '@/lib/transport'

export const dynamic = 'force-dynamic'

type ChildLink = {
  student_id: string
  students: { id: string; first_name: string; last_name: string } | null
}

type TransportRow = {
  assignment_id: string
  route_id: string
  route_name: string
  route_description: string | null
  stop_name: string | null
  pickup_time: string | null
  dropoff_time: string | null
  driver_name: string | null
  driver_phone: string | null
  vehicle_name: string | null
  registration_plate: string | null
  monthly_fee: number
  start_date: string | null
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      {href ? (
        <a href={href} className="text-sm font-medium text-primary-700 hover:underline">{value}</a>
      ) : (
        <span className="text-sm font-medium text-gray-900">{value}</span>
      )}
    </div>
  )
}

export default async function ParentTransportPage() {
  const { supabase, schoolName, parent } = await requireParentCtx()

  // Linked children — never trust a URL param; only what the parent is linked to.
  const { data: linksData } = await supabase
    .from('parent_student_links')
    .select('student_id, students!student_id(id, first_name, last_name)')
    .eq('parent_id', parent.id)
  const links = (linksData ?? []) as unknown as ChildLink[]

  // One RPC call per child. The RPC re-checks parentage server-side (SECURITY
  // DEFINER + is_parent_of_student), so it only ever returns the caller's child.
  const transports = await Promise.all(
    links.map(async (l) => {
      const { data } = await supabase.rpc('parent_child_transport', { p_student_id: l.student_id })
      const row = ((data ?? []) as TransportRow[])[0] ?? null
      return { link: l, row }
    }),
  )

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <p className="text-sm text-primary-300">Portail Parent · {schoolName}</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Transport scolaire</h1>
        <p className="mt-0.5 text-sm text-primary-200">Itinéraire et contact du chauffeur de vos enfants</p>
      </div>

      {links.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun enfant lié</p>
          <p className="mt-1 text-sm text-gray-400">Contactez l&apos;administrateur de l&apos;école.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {transports.map(({ link, row }) => {
            const s = link.students
            const name = s ? `${s.first_name} ${s.last_name}` : '—'
            return (
              <div key={link.student_id} className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
                  <p className="text-sm font-bold text-gray-900">{name}</p>
                </div>
                {!row ? (
                  <p className="px-5 py-6 text-sm text-gray-500 text-center">Aucun transport scolaire pour cet enfant.</p>
                ) : (
                  <div className="divide-y divide-sand-100">
                    <div className="px-5 py-4">
                      <p className="text-base font-semibold text-gray-900">{row.route_name}</p>
                      {row.route_description && <p className="text-sm text-gray-500 mt-0.5">{row.route_description}</p>}
                    </div>
                    <InfoRow label="Arrêt" value={row.stop_name ?? '—'} />
                    <InfoRow label="Heure de ramassage" value={fmtTime(row.pickup_time)} />
                    <InfoRow label="Heure de dépose" value={fmtTime(row.dropoff_time)} />
                    <InfoRow label="Chauffeur" value={row.driver_name ?? '—'} />
                    <InfoRow label="Téléphone du chauffeur" value={row.driver_phone ?? '—'} href={row.driver_phone ? `tel:${row.driver_phone}` : undefined} />
                    <InfoRow label="Véhicule" value={[row.vehicle_name, row.registration_plate].filter(Boolean).join(' · ') || '—'} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
