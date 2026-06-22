import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mention(avg: number): string {
  if (avg >= 16) return 'Très bien'
  if (avg >= 14) return 'Bien'
  if (avg >= 12) return 'Assez bien'
  if (avg >= 10) return 'Passable'
  return 'Insuffisant'
}

function mentionClass(avg: number): string {
  if (avg >= 16) return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  if (avg >= 14) return 'border-sky-300 bg-sky-50 text-sky-700'
  if (avg >= 12) return 'border-primary-200 bg-primary-50 text-primary-700'
  if (avg >= 10) return 'border-accent-300 bg-accent-50 text-accent-700'
  return 'border-red-200 bg-red-50 text-red-600'
}

type Trend = 'up' | 'down' | 'flat' | null

// Average delta: positive = improvement
function avgTrend(delta: number | null): Trend {
  if (delta === null) return null
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

// Rank delta: a *lower* rank number is better, so a decrease is an improvement
function rankTrend(delta: number | null): Trend {
  if (delta === null) return null
  if (delta < 0) return 'up'
  if (delta > 0) return 'down'
  return 'flat'
}

function TrendBadge({ trend, children }: { trend: Trend; children: React.ReactNode }) {
  if (trend === null) {
    return <span className="text-xs text-gray-300">—</span>
  }
  const cls =
    trend === 'up'   ? 'text-emerald-700' :
    trend === 'down' ? 'text-red-600' :
                       'text-gray-400'
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${cls}`}>
      <span aria-hidden="true">{arrow}</span>
      {children}
    </span>
  )
}

type Props = {
  searchParams: { period_id?: string; class_id?: string }
}

export default async function RankingsPage({ searchParams }: Props) {
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

  // Filter sources — scoped to the current school
  const [periodsRes, classesRes] = await Promise.all([
    supabase
      .from('academic_periods')
      .select('id, name, starts_on, academic_year_id, academic_years!academic_year_id(id, name)')
      .eq('school_id', schoolId)
      .order('starts_on', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),

    supabase
      .from('classes')
      .select('id, name, level, academic_year_id')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),
  ])

  type PeriodRow = { id: string; name: string; starts_on: string | null; academic_year_id: string; academic_years: { id: string; name: string } }
  type ClassRow  = { id: string; name: string; level: string | null; academic_year_id: string }

  const periods = (periodsRes.data ?? []) as unknown as PeriodRow[]
  const classes = (classesRes.data ?? []) as ClassRow[]

  // Only accept ids that belong to this school
  const selectedPeriodId = periods.some((p) => p.id === searchParams.period_id)
    ? searchParams.period_id!
    : null
  const selectedClassId = classes.some((c) => c.id === searchParams.class_id)
    ? searchParams.class_id!
    : null

  const selectedPeriod = selectedPeriodId ? periods.find((p) => p.id === selectedPeriodId) ?? null : null
  const selectedClass  = selectedClassId  ? classes.find((c) => c.id === selectedClassId)  ?? null : null

  // The immediately preceding chronological period within the same academic year
  let previousPeriod: PeriodRow | null = null
  if (selectedPeriod) {
    const yearPeriods = periods.filter((p) => p.academic_year_id === selectedPeriod.academic_year_id)
    const idx = yearPeriods.findIndex((p) => p.id === selectedPeriod.id)
    previousPeriod = idx > 0 ? yearPeriods[idx - 1] : null
  }

  type RankRow = {
    studentId:        string
    firstName:        string
    lastName:         string
    admissionNumber:  string
    overallAvg:       number | null
    prevAvg:          number | null
    missingGrades:    number
    totalAssessments: number
  }

  let rows: RankRow[] = []
  let totalAssessments = 0

  if (selectedPeriod && selectedClass) {
    // Subjects taught in this class, with their coefficients
    const { data: csData } = await supabase
      .from('class_subjects')
      .select('id, subjects!subject_id(id, name, coefficient)')
      .eq('school_id', schoolId)
      .eq('class_id', selectedClass.id)
      .eq('academic_year_id', selectedClass.academic_year_id)

    type CSRow = { id: string; subjects: { id: string; name: string; coefficient: number | null } }
    const classSubjects = (csData ?? []) as unknown as CSRow[]
    const csIds = classSubjects.map((cs) => cs.id)

    // Assessments of those subjects, for the selected period and its predecessor
    const periodIds = previousPeriod ? [selectedPeriod.id, previousPeriod.id] : [selectedPeriod.id]
    const { data: assessData } = csIds.length > 0
      ? await supabase
          .from('assessments')
          .select('id, class_subject_id, academic_period_id, coefficient, max_score')
          .eq('school_id', schoolId)
          .in('academic_period_id', periodIds)
          .in('class_subject_id', csIds)
      : { data: [] }

    type AssessRow = { id: string; class_subject_id: string; academic_period_id: string; coefficient: number; max_score: number }
    const assessments = (assessData ?? []) as AssessRow[]
    const assessIds = assessments.map((a) => a.id)
    totalAssessments = assessments.filter((a) => a.academic_period_id === selectedPeriod.id).length

    // Active enrolled students of the class + every grade for those assessments
    const [enrollRes, gradesRes] = await Promise.all([
      supabase
        .from('student_class_enrollments')
        .select('student_id, students!student_id(id, first_name, last_name, admission_number)')
        .eq('class_id', selectedClass.id)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('students(last_name)', { ascending: true }),

      assessIds.length > 0
        ? supabase
            .from('grades')
            .select('assessment_id, student_id, score')
            .eq('school_id', schoolId)
            .in('assessment_id', assessIds)
        : Promise.resolve({ data: [] }),
    ])

    type EnrollRow = {
      student_id: string
      students: { id: string; first_name: string; last_name: string; admission_number: string }
    }
    type GradeRow = { assessment_id: string; student_id: string; score: number }

    const enrollments = (enrollRes.data ?? []) as unknown as EnrollRow[]
    const grades      = (gradesRes.data ?? []) as GradeRow[]

    // Index: assessment_id → student_id → score
    const gradeIndex = new Map<string, Map<string, number>>()
    for (const g of grades) {
      if (!gradeIndex.has(g.assessment_id)) gradeIndex.set(g.assessment_id, new Map())
      gradeIndex.get(g.assessment_id)!.set(g.student_id, g.score)
    }

    // Index per period: class_subject_id → assessments
    const assessByCS     = new Map<string, AssessRow[]>()
    const assessByCSPrev = new Map<string, AssessRow[]>()
    for (const a of assessments) {
      const target = a.academic_period_id === selectedPeriod.id ? assessByCS : assessByCSPrev
      if (!target.has(a.class_subject_id)) target.set(a.class_subject_id, [])
      target.get(a.class_subject_id)!.push(a)
    }

    // Overall weighted average of one student in one period — same logic as the bulletin
    const avgFor = (sid: string, byCS: Map<string, AssessRow[]>): { avg: number | null; graded: number } => {
      let weightedSum = 0
      let totalWeight = 0
      let graded = 0

      for (const cs of classSubjects) {
        const csAssessments = byCS.get(cs.id) ?? []
        let csWeightedSum = 0
        let csTotalWeight = 0

        for (const a of csAssessments) {
          const score = gradeIndex.get(a.id)?.get(sid)
          if (score !== undefined) {
            csWeightedSum += (score / a.max_score) * 20 * a.coefficient
            csTotalWeight += a.coefficient
            graded++
          }
        }

        if (csTotalWeight > 0) {
          const subjectAvg   = csWeightedSum / csTotalWeight
          const subjectCoeff = cs.subjects.coefficient ?? 1
          weightedSum += subjectAvg * subjectCoeff
          totalWeight += subjectCoeff
        }
      }

      return { avg: totalWeight > 0 ? round2(weightedSum / totalWeight) : null, graded }
    }

    for (const enr of enrollments) {
      const sid = enr.student_id
      const { avg, graded } = avgFor(sid, assessByCS)
      const prev = previousPeriod ? avgFor(sid, assessByCSPrev).avg : null

      rows.push({
        studentId:        sid,
        firstName:        enr.students.first_name,
        lastName:         enr.students.last_name,
        admissionNumber:  enr.students.admission_number,
        overallAvg:       avg,
        prevAvg:          prev,
        missingGrades:    totalAssessments - graded,
        totalAssessments,
      })
    }

    // Highest average first; students with no grades sort last
    rows.sort((a, b) => {
      if (a.overallAvg === null && b.overallAvg === null) return 0
      if (a.overallAvg === null) return 1
      if (b.overallAvg === null) return -1
      return b.overallAvg - a.overallAvg
    })
  }

  const hasSelection = !!(selectedPeriod && selectedClass)
  const hasPrevious  = !!previousPeriod

  // ── Competition ranks (1 + students strictly above) for both periods ───────
  const currentAvgs = rows.map((r) => r.overallAvg).filter((a): a is number => a !== null)
  const prevAvgs    = rows.map((r) => r.prevAvg).filter((a): a is number => a !== null)
  function rankOf(avg: number, pool: number[]): number {
    return 1 + pool.filter((a) => a > avg).length
  }

  type ComputedRow = RankRow & { rank: number | null; avgDelta: number | null; rankDelta: number | null }
  const computed: ComputedRow[] = rows.map((r) => {
    const rank     = r.overallAvg !== null ? rankOf(r.overallAvg, currentAvgs) : null
    const prevRank = r.prevAvg    !== null ? rankOf(r.prevAvg, prevAvgs)        : null
    const avgDelta  = r.overallAvg !== null && r.prevAvg !== null ? round2(r.overallAvg - r.prevAvg) : null
    const rankDelta = rank !== null && prevRank !== null ? rank - prevRank : null
    return { ...r, rank, avgDelta, rankDelta }
  })

  // ── Performance summary ────────────────────────────────────────────────────
  const ranked      = rows.filter((r) => r.overallAvg !== null) as (RankRow & { overallAvg: number })[]
  const rankedCount = ranked.length
  const classAvg    = rankedCount > 0 ? round2(ranked.reduce((s, r) => s + r.overallAvg, 0) / rankedCount) : null
  const highestAvg  = rankedCount > 0 ? Math.max(...ranked.map((r) => r.overallAvg)) : null
  const lowestAvg   = rankedCount > 0 ? Math.min(...ranked.map((r) => r.overallAvg)) : null
  const passCount   = ranked.filter((r) => r.overallAvg >= 10).length
  const passRate    = rankedCount > 0 ? Math.round((passCount / rankedCount) * 100) : null

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Classement &amp; performance</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {hasSelection
            ? `${selectedClass!.name}${selectedClass!.level ? ` — ${selectedClass!.level}` : ''} · ${selectedPeriod!.name} · ${selectedPeriod!.academic_years.name}`
            : 'Registre des résultats du conseil de classe'}
        </p>
      </div>

      {/* ── Filter form ──────────────────────────────────────────────────────── */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div>
          <label htmlFor="period_id" className="block text-xs font-medium text-gray-600 mb-1">Période académique</label>
          <select
            id="period_id"
            name="period_id"
            defaultValue={selectedPeriodId ?? ''}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">— Choisir —</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.academic_years.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="class_id" className="block text-xs font-medium text-gray-600 mb-1">Classe</label>
          <select
            id="class_id"
            name="class_id"
            defaultValue={selectedClassId ?? ''}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">— Choisir —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
        >
          Établir le classement
        </button>
      </form>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {!hasSelection ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Choisissez une période et une classe</p>
          <p className="mt-1 text-sm text-gray-400">Le classement et la performance seront calculés automatiquement.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun élève inscrit dans cette classe</p>
          <a
            href={`/school/classes/${selectedClass!.id}`}
            className="mt-3 inline-block text-sm text-primary-600 hover:underline"
          >
            Gérer la classe →
          </a>
        </div>
      ) : (
        <>
          {/* ── Performance summary ─────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-xl border-2 border-primary-200 bg-white shadow-sm">
            <div className="border-b-2 border-primary-200 bg-primary-50 px-5 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary-700">
                Synthèse de la performance
              </p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-sand-200 sm:grid-cols-5 [&>div]:border-t [&>div]:border-sand-200 sm:[&>div]:border-t-0">
              <div className="px-4 py-4 text-center">
                <p className="text-2xl font-bold text-primary-800">{classAvg ?? '—'}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Moyenne classe</p>
              </div>
              <div className="px-4 py-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">{highestAvg ?? '—'}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Plus forte</p>
              </div>
              <div className="px-4 py-4 text-center">
                <p className={`text-2xl font-bold ${lowestAvg !== null && lowestAvg < 10 ? 'text-red-600' : 'text-gray-700'}`}>
                  {lowestAvg ?? '—'}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Plus faible</p>
              </div>
              <div className="px-4 py-4 text-center">
                <p className={`text-2xl font-bold ${passRate !== null && passRate >= 50 ? 'text-primary-700' : 'text-accent-700'}`}>
                  {passRate !== null ? `${passRate}%` : '—'}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Taux de réussite</p>
              </div>
              <div className="px-4 py-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{rankedCount}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Élèves classés{rows.length !== rankedCount ? ` / ${rows.length}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* ── Ranking register ────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-xl border-2 border-primary-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-primary-800 text-left">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-center w-16">Rang</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200">Élève</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200">N° matricule</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-right">Moyenne</th>
                    {hasPrevious && (
                      <th className="hidden sm:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-right">Évol. moy.</th>
                    )}
                    {hasPrevious && (
                      <th className="hidden md:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-center">Évol. rang</th>
                    )}
                    <th className="hidden sm:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200">Mention</th>
                    <th className="hidden md:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-center">Notes manquantes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map((r, idx) => (
                    <tr
                      key={r.studentId}
                      className={`border-b border-sand-200 transition-colors hover:bg-accent-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                    >
                      {/* Rank */}
                      <td className="px-4 py-3 text-center">
                        {r.rank !== null ? (
                          r.rank <= 3 ? (
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                              r.rank === 1 ? 'bg-accent-300 text-accent-700'
                              : r.rank === 2 ? 'bg-sand-300 text-gray-700'
                              : 'bg-accent-50 text-accent-700 border border-accent-300'
                            }`}>
                              {r.rank}
                            </span>
                          ) : (
                            <span className="font-mono text-sm font-semibold text-gray-500">{r.rank}</span>
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Student */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{r.lastName} {r.firstName}</p>
                        <p className="sm:hidden text-xs font-mono text-gray-400">{r.admissionNumber}</p>
                      </td>

                      {/* Admission number */}
                      <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-500">{r.admissionNumber}</td>

                      {/* Overall average */}
                      <td className="px-4 py-3 text-right">
                        {r.overallAvg !== null ? (
                          <span className={`text-base font-bold ${r.overallAvg >= 10 ? 'text-primary-800' : 'text-red-600'}`}>
                            {r.overallAvg}
                            <span className="text-xs font-normal text-gray-300">/20</span>
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>

                      {/* Average evolution */}
                      {hasPrevious && (
                        <td className="hidden sm:table-cell px-4 py-3 text-right">
                          <TrendBadge trend={avgTrend(r.avgDelta)}>
                            {r.avgDelta !== null ? `${r.avgDelta > 0 ? '+' : ''}${r.avgDelta}` : null}
                          </TrendBadge>
                        </td>
                      )}

                      {/* Rank evolution */}
                      {hasPrevious && (
                        <td className="hidden md:table-cell px-4 py-3 text-center">
                          <TrendBadge trend={rankTrend(r.rankDelta)}>
                            {r.rankDelta !== null && r.rankDelta !== 0
                              ? `${Math.abs(r.rankDelta)} place${Math.abs(r.rankDelta) > 1 ? 's' : ''}`
                              : r.rankDelta === 0 ? 'stable' : null}
                          </TrendBadge>
                        </td>
                      )}

                      {/* Mention */}
                      <td className="hidden sm:table-cell px-4 py-3">
                        {r.overallAvg !== null ? (
                          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${mentionClass(r.overallAvg)}`}>
                            {mention(r.overallAvg)}
                          </span>
                        ) : (
                          <span className="text-xs italic text-gray-300">Non noté</span>
                        )}
                      </td>

                      {/* Missing grades */}
                      <td className="hidden md:table-cell px-4 py-3 text-center">
                        {totalAssessments === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : r.missingGrades > 0 ? (
                          <span className="inline-block rounded-full border border-accent-300 bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
                            {r.missingGrades} / {r.totalAssessments}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-emerald-600">Complet</span>
                        )}
                      </td>

                      {/* Bulletin link */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <a
                          href={`/school/academics/bulletins/${r.studentId}?period_id=${selectedPeriodId}`}
                          className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
                        >
                          Bulletin →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">
            Classement établi sur la moyenne générale pondérée par coefficient. Les élèves sans note figurent en fin de registre.
            {hasPrevious
              ? ` Évolution calculée par rapport à ${previousPeriod!.name}. ▲ progression · ▼ recul · — stable.`
              : ' Aucune période antérieure : l’évolution n’est pas affichée.'}
          </p>
        </>
      )}

    </div>
  )
}
