import Link from 'next/link'
import { requireTransportAdmin } from './_auth'
import { fmtFCFA, fmtDate, daysUntil, EXPIRY_WINDOW_DAYS } from '@/lib/transport'

// ─── Heroicon paths (consistent with the rest of the app) ──────────────────────
const P = {
  truck:    'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  route:    'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z',
  user:     'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  students: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  money:    'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  alert:    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
}

function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

const TONES: Record<string, string> = {
  green:  'bg-primary-50 text-primary-700',
  sky:    'bg-sky-50 text-sky-700',
  amber:  'bg-amber-50 text-amber-700',
  emerald:'bg-emerald-50 text-emerald-700',
}

function KpiCard({ label, value, sub, href, iconPath, tone = 'green', danger = false }: {
  label: string; value: string | number; sub?: string; href: string; iconPath: string; tone?: string; danger?: boolean
}) {
  return (
    <Link href={href} className="group flex flex-col gap-1 rounded-xl border border-sand-200 bg-white p-4 shadow-sm transition-all hover:border-primary-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone] ?? TONES.green}`}><Icon path={iconPath} /></span>
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </Link>
  )
}

type Vehicle = { id: string; name: string; capacity: number; status: string; insurance_expiry_date: string | null; inspection_expiry_date: string | null }
type Driver = { id: string; full_name: string; status: string; license_expiry_date: string | null }
type Route = { id: string; name: string; status: string; vehicle_id: string | null }

export default async function TransportDashboardPage() {
  const { supabase, schoolId, schoolName } = await requireTransportAdmin()

  const [vehRes, drvRes, rtRes, asgRes] = await Promise.all([
    supabase.from('transport_vehicles').select('id, name, capacity, status, insurance_expiry_date, inspection_expiry_date').eq('school_id', schoolId),
    supabase.from('transport_drivers').select('id, full_name, status, license_expiry_date').eq('school_id', schoolId),
    supabase.from('transport_routes').select('id, name, status, vehicle_id').eq('school_id', schoolId),
    supabase.from('student_transport_assignments').select('route_id, monthly_fee').eq('school_id', schoolId).eq('status', 'active'),
  ])

  const vehicles = (vehRes.data ?? []) as Vehicle[]
  const drivers = (drvRes.data ?? []) as Driver[]
  const routes = (rtRes.data ?? []) as Route[]
  const assignments = (asgRes.data ?? []) as { route_id: string; monthly_fee: number }[]

  const today = new Date().toISOString().slice(0, 10)
  const activeRoutes = routes.filter((r) => r.status === 'active').length
  const expectedRevenue = assignments.reduce((sum, a) => sum + (a.monthly_fee || 0), 0)

  // Riders per route → per vehicle, for capacity warnings.
  const ridersByRoute = new Map<string, number>()
  for (const a of assignments) ridersByRoute.set(a.route_id, (ridersByRoute.get(a.route_id) ?? 0) + 1)
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]))

  type Alert = { tone: 'red' | 'amber'; label: string; href: string }
  const alerts: Alert[] = []

  // Over-capacity routes
  for (const r of routes) {
    if (!r.vehicle_id) continue
    const v = vehicleById.get(r.vehicle_id)
    if (!v || v.capacity <= 0) continue
    const riders = ridersByRoute.get(r.id) ?? 0
    if (riders > v.capacity) alerts.push({ tone: 'red', label: `Itinéraire « ${r.name} » : ${riders} élèves pour ${v.capacity} places (${v.name})`, href: `/school/transport/routes/${r.id}` })
  }

  // Expiring documents (≤30 days, including expired)
  let expiringCount = 0
  for (const v of vehicles) {
    for (const [kind, date] of [['Assurance', v.insurance_expiry_date], ['Visite technique', v.inspection_expiry_date]] as const) {
      const d = daysUntil(date, today)
      if (d !== null && d <= EXPIRY_WINDOW_DAYS) {
        expiringCount++
        alerts.push({ tone: d < 0 ? 'red' : 'amber', label: `${kind} — ${v.name} : ${d < 0 ? 'expirée' : `expire le ${fmtDate(date)}`}`, href: `/school/transport/vehicles/${v.id}` })
      }
    }
  }
  for (const dr of drivers) {
    const d = daysUntil(dr.license_expiry_date, today)
    if (d !== null && d <= EXPIRY_WINDOW_DAYS) {
      expiringCount++
      alerts.push({ tone: d < 0 ? 'red' : 'amber', label: `Permis — ${dr.full_name} : ${d < 0 ? 'expiré' : `expire le ${fmtDate(dr.license_expiry_date)}`}`, href: `/school/transport/drivers/${dr.id}` })
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a></div>
        <h1 className="text-2xl font-bold text-white">Transport</h1>
        <p className="mt-0.5 text-sm text-primary-300">{schoolName}</p>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a href="/school/transport/vehicles" className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">Véhicules</a>
        <a href="/school/transport/drivers" className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">Chauffeurs</a>
        <a href="/school/transport/routes" className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">Itinéraires</a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="Véhicules" value={vehicles.length} href="/school/transport/vehicles" iconPath={P.truck} tone="green" />
        <KpiCard label="Itinéraires actifs" value={activeRoutes} sub={`${routes.length} au total`} href="/school/transport/routes" iconPath={P.route} tone="sky" />
        <KpiCard label="Chauffeurs" value={drivers.length} href="/school/transport/drivers" iconPath={P.user} tone="emerald" />
        <KpiCard label="Élèves transportés" value={assignments.length} href="/school/transport/routes" iconPath={P.students} tone="green" />
        <KpiCard label="Revenu mensuel attendu" value={fmtFCFA(expectedRevenue)} sub="affectations actives" href="/school/transport/routes" iconPath={P.money} tone="emerald" />
        <KpiCard label="Documents à renouveler" value={expiringCount} sub={`sous ${EXPIRY_WINDOW_DAYS} jours`} href="/school/transport/vehicles" iconPath={P.alert} tone="amber" danger={expiringCount > 0} />
      </div>

      {/* Alerts */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center gap-2">
          <Icon path={P.alert} className="h-4 w-4 text-gray-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Alertes ({alerts.length})</p>
        </div>
        {alerts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500 text-center">Aucune alerte. Capacités et documents sont à jour.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {alerts.map((a, i) => (
              <li key={i}>
                <a href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-sand-50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />
                  <span className="text-sm text-gray-700">{a.label}</span>
                  <span className="ml-auto text-sm text-primary-600 shrink-0">→</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Finance note — invoice generation is a documented future step (MVP stores
          the monthly fee on each assignment and reports expected revenue only). */}
      <p className="text-xs text-gray-400">
        Les frais de transport sont enregistrés par affectation. La génération automatique de factures de transport sera ajoutée dans une prochaine version.
      </p>
    </div>
  )
}
