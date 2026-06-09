import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { attendanceRate, rateTone, RATE_TEXT_CLASS, RATE_BAR_CLASS, monthLabel } from '@/lib/attendance'

// ─── Types returned by the migration-041 aggregate RPCs ───────────────────────

type ClassRow = {
  class_id: string; class_name: string; class_section: string | null
  present: number; absent: number; late: number; excused: number; total: number; sessions: number
}
type MonthRow = { month: string; present: number; absent: number; late: number; excused: number; total: number }
type DayRow   = { day: string;  present: number; absent: number; late: number; excused: number; total: number }

function fmtDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

type Props = { searchParams: { year?: string } }

export default async function AttendanceSummaryPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: yearsData } = await supabase
    .from('academic_years')
    .select('id, name, is_active')
    .eq('school_id', schoolId)
    .order('starts_on', { ascending: false })
  type YearRow = { id: string; name: string; is_active: boolean }
  const years = (yearsData ?? []) as YearRow[]

  const yearIds = new Set(years.map((y) => y.id))
  const selectedYear =
    (searchParams.year && yearIds.has(searchParams.year)) ? searchParams.year
    : (years.find((y) => y.is_active)?.id ?? years[0]?.id ?? '')

  // Daily summary window: the last 30 days.
  const today = new Date()
  const toISO   = today.toISOString().slice(0, 10)
  const fromISO = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

  let classRows: ClassRow[] = []
  let monthRows: MonthRow[] = []
  let dayRows:   DayRow[]   = []
  let rpcError = false

  if (selectedYear) {
    const [classRes, monthRes, dayRes] = await Promise.all([
      supabase.rpc('attendance_class_summary',   { p_school_id: schoolId, p_year_id: selectedYear }),
      supabase.rpc('attendance_monthly_summary', { p_school_id: schoolId, p_year_id: selectedYear }),
      supabase.rpc('attendance_daily_summary',   { p_school_id: schoolId, p_year_id: selectedYear, p_from: fromISO, p_to: toISO }),
    ])
    if (classRes.error || monthRes.error || dayRes.error) rpcError = true
    classRows = (classRes.data ?? []) as ClassRow[]
    monthRows = (monthRes.data ?? []) as MonthRow[]
    dayRows   = (dayRes.data ?? []) as DayRow[]
  }

  // School-wide totals (from the per-class rows).
  const totals = classRows.reduce(
    (a, c) => ({
      present: a.present + c.present, absent: a.absent + c.absent,
      late: a.late + c.late, excused: a.excused + c.excused, total: a.total + c.total,
    }),
    { present: 0, absent: 0, late: 0, excused: 0, total: 0 },
  )
  const overallRate = attendanceRate(totals)
  const overallTone = rateTone(overallRate)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/attendance" className="text-primary-300 hover:text-white text-sm">← Registre des présences</a>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Statistiques de présence</h1>
            <p className="text-primary-300 text-sm mt-0.5">Assiduité par classe, par jour et par mois</p>
          </div>
        </div>
      </div>

      {/* Year filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div className="min-w-[200px]">
          <label htmlFor="year" className="block text-xs font-medium text-gray-600 mb-1">Année scolaire</label>
          <select id="year" name="year" defaultValue={selectedYear} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' (active)' : ''}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Afficher</button>
      </form>

      {rpcError && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Les statistiques ne sont pas disponibles : la migration de base de données (041) n&apos;a pas encore été appliquée.
          </p>
        </div>
      )}

      {years.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune année scolaire</p>
          <p className="mt-1 text-sm text-gray-400">Créez une année scolaire pour suivre l&apos;assiduité.</p>
        </div>
      ) : (
        <>
          {/* Overall KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assiduité (année)</p>
              <p className={`mt-1 text-2xl font-bold ${RATE_TEXT_CLASS[overallTone]}`}>{overallRate !== null ? `${overallRate}%` : '—'}</p>
              <p className="text-xs text-gray-400">{totals.total} enregistrements</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Absences</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{totals.absent}</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Retards</p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{totals.late}</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Justifiés</p>
              <p className="mt-1 text-2xl font-bold text-sky-700">{totals.excused}</p>
            </div>
          </div>

          {/* Attendance by class */}
          <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
            <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Assiduité par classe</h2>
            </div>
            {classRows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune classe pour cette année.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand-200 bg-sand-100 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Classe</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Séances</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Abs.</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Ret.</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Just.</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Assiduité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRows.map((c, idx) => {
                      const rate = attendanceRate(c)
                      const tone = rateTone(rate)
                      return (
                        <tr key={c.class_id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{[c.class_name, c.class_section].filter(Boolean).join(' ')}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{c.sessions}</td>
                          <td className="px-4 py-3 text-center font-semibold text-red-600">{c.absent}</td>
                          <td className="px-4 py-3 text-center font-semibold text-amber-600">{c.late}</td>
                          <td className="px-4 py-3 text-center text-sky-700">{c.excused}</td>
                          <td className="px-4 py-3">
                            {rate === null ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sand-200">
                                  <div className={`h-full rounded-full ${RATE_BAR_CLASS[tone]}`} style={{ width: `${rate}%` }} />
                                </div>
                                <span className={`text-xs font-bold ${RATE_TEXT_CLASS[tone]}`}>{rate}%</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Monthly summary */}
            <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
              <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Résumé mensuel</h2>
              </div>
              {monthRows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune donnée mensuelle.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {monthRows.map((m) => {
                    const rate = attendanceRate(m)
                    const tone = rateTone(rate)
                    return (
                      <li key={m.month} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="text-sm font-medium capitalize text-gray-900">{monthLabel(m.month)}</span>
                        <span className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="text-red-600">{m.absent} abs.</span>
                          <span className="text-amber-600">{m.late} ret.</span>
                          <span className={`font-bold ${RATE_TEXT_CLASS[tone]}`}>{rate !== null ? `${rate}%` : '—'}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Daily summary (last 30 days) */}
            <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
              <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Résumé quotidien (30 j)</h2>
              </div>
              {dayRows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune séance sur les 30 derniers jours.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {dayRows.map((d) => {
                    const rate = attendanceRate(d)
                    const tone = rateTone(rate)
                    return (
                      <li key={d.day} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="text-sm font-medium text-gray-900">{fmtDay(d.day)}</span>
                        <span className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="text-red-600">{d.absent} abs.</span>
                          <span className="text-amber-600">{d.late} ret.</span>
                          <span className={`font-bold ${RATE_TEXT_CLASS[tone]}`}>{rate !== null ? `${rate}%` : '—'}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
