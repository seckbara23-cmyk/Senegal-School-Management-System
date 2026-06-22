import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { computeAcademicDashboard, averageTone, AVERAGE_TEXT_CLASS, AVERAGE_BAR_CLASS } from '@/lib/grades'

type Props = { searchParams: { year?: string; period?: string } }

export default async function AcademicDashboardPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const [yearsRes, periodsRes] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active').eq('school_id', schoolId).order('starts_on', { ascending: false }),
    supabase.from('academic_periods').select('id, name, academic_year_id, is_active').eq('school_id', schoolId).order('starts_on', { ascending: true }),
  ])
  type YearRow   = { id: string; name: string; is_active: boolean }
  type PeriodRow = { id: string; name: string; academic_year_id: string; is_active: boolean }
  const years   = (yearsRes.data ?? []) as YearRow[]
  const periods = (periodsRes.data ?? []) as PeriodRow[]

  const yearIds = new Set(years.map((y) => y.id))
  const selectedYear =
    (searchParams.year && yearIds.has(searchParams.year)) ? searchParams.year
    : (years.find((y) => y.is_active)?.id ?? years[0]?.id ?? '')

  const yearPeriods = periods.filter((p) => p.academic_year_id === selectedYear)
  const periodIds = new Set(yearPeriods.map((p) => p.id))
  const selectedPeriod =
    (searchParams.period && periodIds.has(searchParams.period)) ? searchParams.period
    : (yearPeriods.find((p) => p.is_active)?.id ?? yearPeriods[0]?.id ?? '')

  const data = selectedPeriod
    ? await computeAcademicDashboard(supabase, schoolId, selectedYear, selectedPeriod)
    : null

  const overallTone = averageTone(data?.overall ?? null)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Tableau de bord académique</h1>
        <p className="text-primary-300 text-sm mt-0.5">Évaluations, saisie des notes et moyennes par classe</p>
      </div>

      {/* Period filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div className="min-w-[180px]">
          <label htmlFor="year" className="block text-xs font-medium text-gray-600 mb-1">Année scolaire</label>
          <select id="year" name="year" defaultValue={selectedYear} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' (active)' : ''}</option>)}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label htmlFor="period" className="block text-xs font-medium text-gray-600 mb-1">Période</label>
          <select id="period" name="period" defaultValue={selectedPeriod} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            {yearPeriods.length === 0 && <option value="">— Aucune période —</option>}
            {yearPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_active ? ' (active)' : ''}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Afficher</button>
        <a href="/school/academics/assessments" className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50 transition-colors">Évaluations →</a>
      </form>

      {!selectedPeriod || !data ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune période académique</p>
          <p className="mt-1 text-sm text-gray-400">Créez une période (trimestre / semestre) pour suivre les notes.</p>
          <a href="/school/academics/periods/new" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">Créer une période</a>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Évaluations</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{data.assessmentsCreated}</p>
              <p className="text-xs text-gray-400">créées (période)</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Notes saisies</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{data.gradesEntered}</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Saisie en attente</p>
              <p className={`mt-1 text-2xl font-bold ${data.pendingCount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{data.pendingCount}</p>
              <p className="text-xs text-gray-400">évaluation(s)</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Moyenne générale</p>
              <p className={`mt-1 text-2xl font-bold ${AVERAGE_TEXT_CLASS[overallTone]}`}>{data.overall !== null ? `${data.overall}/20` : '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Class averages */}
            <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
              <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Moyennes par classe</h2>
              </div>
              {data.classAverages.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune classe pour cette année.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {data.classAverages.map((c) => {
                    const tone = averageTone(c.average)
                    return (
                      <li key={c.classId} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{c.className}</p>
                          <p className="text-xs text-gray-400">{c.gradedStudents}/{c.totalStudents} élève(s) noté(s)</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.average !== null && (
                            <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-sand-200 sm:block">
                              <div className={`h-full rounded-full ${AVERAGE_BAR_CLASS[tone]}`} style={{ width: `${Math.min(100, Math.round((c.average / 20) * 100))}%` }} />
                            </div>
                          )}
                          <span className={`text-sm font-bold ${AVERAGE_TEXT_CLASS[tone]}`}>{c.average !== null ? `${c.average}/20` : '—'}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Pending grade entry */}
            <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
              <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Saisie en attente</h2>
              </div>
              {data.pending.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Toutes les notes sont saisies. 🎉</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {data.pending.slice(0, 10).map((p) => (
                    <li key={p.assessmentId}>
                      <a href={`/school/academics/assessments/${p.assessmentId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-50 transition-colors">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{p.title}</p>
                          <p className="truncate text-xs text-gray-500">{p.className} · {p.subject}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{p.graded}/{p.expected}</span>
                      </a>
                    </li>
                  ))}
                  {data.pending.length > 10 && (
                    <li className="px-5 py-2 text-center text-xs text-gray-400">+{data.pending.length - 10} autre(s)</li>
                  )}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
