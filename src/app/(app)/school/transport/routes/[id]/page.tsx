import { notFound } from 'next/navigation'
import { requireTransportAdmin } from '../../_auth'
import { setRouteStatus, endStudentTransport } from '../../actions'
import { StopsManager, type Stop } from './_StopsManager'
import { AssignOnRoute } from './_AssignOnRoute'
import { SIMPLE_STATUS_LABEL, SIMPLE_STATUS_CLASS, fmtFCFA, fmtDate } from '@/lib/transport'

const FEEDBACK: Record<string, { ok: boolean; msg: string }> = {
  // stops
  stop_invalid: { ok: false, msg: 'Arrêt invalide. Vérifiez les champs.' },
  stop_server:  { ok: false, msg: 'L’opération sur l’arrêt a échoué. Veuillez réessayer.' },
  // assignment
  duplicate:    { ok: false, msg: 'Cet élève a déjà une affectation de transport active.' },
  invalid:      { ok: false, msg: 'Itinéraire invalide.' },
  readonly:     { ok: false, msg: 'Cet établissement est en lecture seule.' },
  server:       { ok: false, msg: 'L’opération a échoué. Veuillez réessayer.' },
  status:       { ok: false, msg: 'Le statut n’a pas pu être mis à jour.' },
}

type RouteRow = {
  id: string; name: string; description: string | null; status: string; monthly_fee: number
  vehicle_id: string | null; driver_id: string | null
  transport_vehicles: { id: string; name: string; capacity: number } | null
  transport_drivers: { id: string; full_name: string; phone: string | null } | null
}

type Assignment = {
  id: string; monthly_fee: number; start_date: string | null
  students: { id: string; first_name: string; last_name: string } | null
  transport_stops: { name: string } | null
}

type Props = { params: { id: string }; searchParams: { error?: string; stop_ok?: string; transport_ok?: string; transport_error?: string } }

export default async function RouteDetailPage({ params, searchParams }: Props) {
  const { supabase, schoolId } = await requireTransportAdmin()

  const { data } = await supabase
    .from('transport_routes')
    .select('id, name, description, status, monthly_fee, vehicle_id, driver_id, transport_vehicles(id, name, capacity), transport_drivers(id, full_name, phone)')
    .eq('id', params.id).eq('school_id', schoolId).maybeSingle()
  if (!data) notFound()
  const route = data as unknown as RouteRow

  const writable = await (async () => {
    const { data: s } = await supabase.from('schools').select('subscription_status').eq('id', schoolId).maybeSingle()
    return (s as { subscription_status: string } | null)?.subscription_status === 'active'
  })()

  const [{ data: stopsData }, { data: assignmentsData }, { data: activeStudents }, { data: assignedRows }] = await Promise.all([
    supabase.from('transport_stops').select('id, name, pickup_time, dropoff_time, stop_order, notes').eq('school_id', schoolId).eq('route_id', route.id).order('stop_order').order('name'),
    supabase.from('student_transport_assignments').select('id, monthly_fee, start_date, students(id, first_name, last_name), transport_stops(name)').eq('school_id', schoolId).eq('route_id', route.id).eq('status', 'active'),
    supabase.from('students').select('id, first_name, last_name').eq('school_id', schoolId).eq('status', 'active').order('last_name'),
    supabase.from('student_transport_assignments').select('student_id').eq('school_id', schoolId).eq('status', 'active'),
  ])

  const stops = (stopsData ?? []) as Stop[]
  const assignments = (assignmentsData ?? []) as unknown as Assignment[]
  const assignedIds = new Set((assignedRows ?? []).map((r: { student_id: string }) => r.student_id))
  const unassigned = ((activeStudents ?? []) as { id: string; first_name: string; last_name: string }[])
    .filter((s) => !assignedIds.has(s.id))
    .map((s) => ({ id: s.id, label: `${s.last_name} ${s.first_name}` }))

  const capacity = route.transport_vehicles?.capacity ?? 0
  const overCapacity = capacity > 0 && assignments.length > capacity
  const isActive = route.status === 'active'

  const fb = searchParams.transport_error ? FEEDBACK[searchParams.transport_error]
    : searchParams.error ? FEEDBACK[searchParams.error]
    : searchParams.transport_ok ? { ok: true, msg: searchParams.transport_ok === 'assigned' ? 'Élève affecté au transport.' : 'Affectation terminée.' }
    : searchParams.stop_ok ? { ok: true, msg: 'Arrêts mis à jour.' }
    : null

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/transport/routes" className="text-primary-300 hover:text-white text-sm">← Itinéraires</a></div>
        <div className="flex items-start gap-4 mt-1">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{route.name}</h1>
            {route.description && <p className="text-primary-200 text-sm mt-0.5">{route.description}</p>}
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${SIMPLE_STATUS_CLASS[route.status] ?? ''}`}>{SIMPLE_STATUS_LABEL[route.status] ?? route.status}</span>
          </div>
          <a href={`/school/transport/routes/${route.id}/edit`} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors">Modifier</a>
        </div>
      </div>

      {fb && (
        <div role="alert" className={`rounded-lg border p-4 ${fb.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-sm ${fb.ok ? 'text-emerald-700' : 'text-red-700'}`}>{fb.msg}</p>
        </div>
      )}

      {overCapacity && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Attention :</span> {assignments.length} élèves affectés pour une capacité de {capacity} places sur le véhicule {route.transport_vehicles?.name}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Véhicule</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{route.transport_vehicles ? <a href={`/school/transport/vehicles/${route.transport_vehicles.id}`} className="hover:text-primary-600 hover:underline">{route.transport_vehicles.name}</a> : '—'}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Chauffeur</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{route.transport_drivers ? <a href={`/school/transport/drivers/${route.transport_drivers.id}`} className="hover:text-primary-600 hover:underline">{route.transport_drivers.full_name}</a> : '—'}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Élèves</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{assignments.length}{capacity > 0 ? ` / ${capacity}` : ''}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Frais mensuel</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{fmtFCFA(route.monthly_fee)}</p>
        </div>
      </div>

      <StopsManager routeId={route.id} stops={stops} readOnly={!writable} />

      {/* Assigned students */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Élèves affectés ({assignments.length})</p></div>
        {assignments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">Aucun élève affecté à cet itinéraire.</p>
        ) : (
          <div className="divide-y divide-sand-100">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{a.students ? <a href={`/school/students/${a.students.id}`} className="hover:text-primary-600 hover:underline">{a.students.last_name} {a.students.first_name}</a> : '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Arrêt {a.transport_stops?.name ?? '—'} · {fmtFCFA(a.monthly_fee)}/mois{a.start_date ? ` · depuis ${fmtDate(a.start_date)}` : ''}</p>
                </div>
                {writable && (
                  <form action={endStudentTransport}>
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <input type="hidden" name="student_id" value={a.students?.id ?? ''} />
                    <input type="hidden" name="route_id" value={route.id} />
                    <input type="hidden" name="redirect_to" value="route" />
                    <button type="submit" className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Terminer</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-sand-200 px-5 py-4">
          <AssignOnRoute routeId={route.id} routeFee={route.monthly_fee} stops={stops.map((s) => ({ id: s.id, name: s.name }))} students={unassigned} readOnly={!writable} />
        </div>
      </div>

      {/* Management */}
      <div className="rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-red-100 bg-red-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-red-500">Gestion de l’itinéraire</p></div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{isActive ? 'Désactiver l’itinéraire' : 'Réactiver l’itinéraire'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{isActive ? 'L’itinéraire n’apparaîtra plus comme actif.' : 'L’itinéraire redevient actif.'}</p>
          </div>
          <form action={setRouteStatus}>
            <input type="hidden" name="id" value={route.id} />
            <input type="hidden" name="new_status" value={isActive ? 'inactive' : 'active'} />
            <button type="submit" className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{isActive ? 'Désactiver' : 'Réactiver'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
