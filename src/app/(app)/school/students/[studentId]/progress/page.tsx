import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

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

type Props = { params: { studentId: string } }

export default async function StudentProgressPage({ params }: Props) {
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

  // ── Student (school-scoped) ────────────────────────────────────────────────
  const { data: studentData } = await supabase
    .from('students')
    .select('id, first_name, last_name, admission_number')
    .eq('id', params.studentId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!studentData) notFound()

  type StudentRow = { id: string; first_name: string; last_name: string; admission_number: string }
  const student = studentData as StudentRow
  const fullName = `${student.last_name} ${student.first_name}`

  // ── Resolve the student's academic year via active enrollment ──────────────
  const { data: enrollData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, academic_year_id, classes!class_id(id, name, level), academic_years!academic_year_id(id, name, is_active, starts_on)')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  type EnrollRow = {
    class_id: string
    academic_year_id: string
    classes: { id: string; name: string; level: string | null }
    academic_years: { id: string; name: string; is_active: boolean; starts_on: string | null }
  }
  const enrollments = (enrollData ?? []) as unknown as EnrollRow[]

  // Prefer the active academic year; otherwise the most recent one by start date
  const enrollment =
    enrollments.find((e) => e.academic_years.is_active) ??
    [...enrollments].sort((a, b) =>
      (b.academic_years.starts_on ?? '').localeCompare(a.academic_years.starts_on ?? ''),
    )[0] ??
    null

  const BackLink = (
    <a
      href={`/school/students/${student.id}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Retour à la fiche élève
    </a>
  )

  if (!enrollment) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">← {fullName}</a>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Progression</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune inscription active</p>
          <p className="mt-1 text-sm text-gray-400">
            {fullName} n&apos;est inscrit(e) dans aucune classe pour le moment.
          </p>
        </div>
        {BackLink}
      </div>
    )
  }

  const classId       = enrollment.class_id
  const academicYearId = enrollment.academic_year_id
  const className     = enrollment.classes.name
  const classLevel    = enrollment.classes.level
  const yearName      = enrollment.academic_years.name

  // ── Periods of that academic year ──────────────────────────────────────────
  const { data: periodData } = await supabase
    .from('academic_periods')
    .select('id, name, starts_on')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  type PeriodRow = { id: string; name: string; starts_on: string | null }
  const periods = (periodData ?? []) as PeriodRow[]
  const periodIds = periods.map((p) => p.id)

  // ── Subjects of the class (with coefficients) ──────────────────────────────
  const { data: csData } = await supabase
    .from('class_subjects')
    .select('id, subjects!subject_id(id, coefficient)')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('academic_year_id', academicYearId)

  type CSRow = { id: string; subjects: { id: string; coefficient: number | null } }
  const classSubjects = (csData ?? []) as unknown as CSRow[]
  const csIds = classSubjects.map((cs) => cs.id)

  // ── Assessments across all periods + every grade + the whole class roster ──
  const [assessRes, enrollRosterRes] = await Promise.all([
    csIds.length > 0 && periodIds.length > 0
      ? supabase
          .from('assessments')
          .select('id, class_subject_id, academic_period_id, coefficient, max_score')
          .eq('school_id', schoolId)
          .in('class_subject_id', csIds)
          .in('academic_period_id', periodIds)
      : Promise.resolve({ data: [] }),

    supabase
      .from('student_class_enrollments')
      .select('student_id')
      .eq('class_id', classId)
      .eq('school_id', schoolId)
      .eq('status', 'active'),
  ])

  type AssessRow = { id: string; class_subject_id: string; academic_period_id: string; coefficient: number; max_score: number }
  const assessments = (assessRes.data ?? []) as AssessRow[]
  const assessIds   = assessments.map((a) => a.id)

  const rosterIds = ((enrollRosterRes.data ?? []) as { student_id: string }[]).map((e) => e.student_id)

  const { data: gradeData } = assessIds.length > 0
    ? await supabase
        .from('grades')
        .select('assessment_id, student_id, score')
        .eq('school_id', schoolId)
        .in('assessment_id', assessIds)
    : { data: [] }

  type GradeRow = { assessment_id: string; student_id: string; score: number }
  const grades = (gradeData ?? []) as GradeRow[]

  // ── In-memory indexes ──────────────────────────────────────────────────────
  const gradeIndex = new Map<string, Map<string, number>>()  // assessment_id → student_id → score
  for (const g of grades) {
    if (!gradeIndex.has(g.assessment_id)) gradeIndex.set(g.assessment_id, new Map())
    gradeIndex.get(g.assessment_id)!.set(g.student_id, g.score)
  }

  // period_id → class_subject_id → assessments
  const assessByPeriodCS = new Map<string, Map<string, AssessRow[]>>()
  const assessCountByPeriod = new Map<string, number>()
  for (const a of assessments) {
    if (!assessByPeriodCS.has(a.academic_period_id)) assessByPeriodCS.set(a.academic_period_id, new Map())
    const csMap = assessByPeriodCS.get(a.academic_period_id)!
    if (!csMap.has(a.class_subject_id)) csMap.set(a.class_subject_id, [])
    csMap.get(a.class_subject_id)!.push(a)
    assessCountByPeriod.set(a.academic_period_id, (assessCountByPeriod.get(a.academic_period_id) ?? 0) + 1)
  }

  // Overall weighted average of one student in one period (same logic as bulletin)
  function periodAvgFor(periodId: string, sid: string): { avg: number | null; graded: number } {
    const csMap = assessByPeriodCS.get(periodId)
    if (!csMap) return { avg: null, graded: 0 }

    let weightedSum = 0
    let totalWeight = 0
    let graded = 0

    for (const cs of classSubjects) {
      const csAssessments = csMap.get(cs.id) ?? []
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

  // ── Per-period result for the focal student, with class rank ───────────────
  type PeriodResult = {
    periodId:      string
    periodName:    string
    avg:           number | null
    rank:          number | null
    rankedTotal:   number
    missingGrades: number
    totalGrades:   number
  }

  const results: PeriodResult[] = periods.map((p) => {
    const { avg, graded } = periodAvgFor(p.id, student.id)

    // Rank the focal student against the class roster for this period
    let rank: number | null = null
    let rankedTotal = 0
    if (avg !== null) {
      const classAvgs = rosterIds
        .map((sid) => periodAvgFor(p.id, sid).avg)
        .filter((a): a is number => a !== null)
      rankedTotal = classAvgs.length
      // rank = 1 + number of students strictly above this student's average
      rank = 1 + classAvgs.filter((a) => a > avg).length
    }

    const total = assessCountByPeriod.get(p.id) ?? 0
    return {
      periodId:      p.id,
      periodName:    p.name,
      avg,
      rank,
      rankedTotal,
      missingGrades: total - graded,
      totalGrades:   total,
    }
  })

  // ── Progression deltas vs the previous period ──────────────────────────────
  type Row = PeriodResult & { avgDelta: number | null; rankDelta: number | null }
  let prev: PeriodResult | null = null
  const rows: Row[] = results.map((r) => {
    const avgDelta  = prev && prev.avg  !== null && r.avg  !== null ? round2(r.avg - prev.avg) : null
    const rankDelta = prev && prev.rank !== null && r.rank !== null ? r.rank - prev.rank       : null
    prev = r
    return { ...r, avgDelta, rankDelta }
  })

  const graded = results.filter((r) => r.avg !== null) as (PeriodResult & { avg: number })[]
  const yearAvg = graded.length > 0 ? round2(graded.reduce((s, r) => s + r.avg, 0) / graded.length) : null
  const bestPeriod = graded.length > 0 ? graded.reduce((best, r) => (r.avg > best.avg ? r : best)) : null

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">← {fullName}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Carnet de progression</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {className}{classLevel ? ` — ${classLevel}` : ''} · {yearName}
        </p>
      </div>

      {/* ── Identity band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border-2 border-primary-200 bg-primary-50 px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5">Élève</p>
            <p className="font-bold text-primary-900 text-sm">{fullName}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5">N° matricule</p>
            <p className="font-mono text-sm text-primary-800">{student.admission_number}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5">Moyenne annuelle</p>
            <p className="font-bold text-primary-800 text-sm">{yearAvg !== null ? `${yearAvg}/20` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-0.5">Meilleure période</p>
            <p className="font-semibold text-primary-800 text-sm">{bestPeriod ? bestPeriod.periodName : '—'}</p>
          </div>
        </div>
      </div>

      {/* ── Progression register ──────────────────────────────────────────────── */}
      {periods.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune période académique</p>
          <p className="mt-1 text-sm text-gray-400">Aucune période n&apos;est définie pour {yearName}.</p>
          <a href="/school/academics/periods" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Gérer les périodes →
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-primary-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200">Période</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-right">Moyenne</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-right">Évolution</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-center">Rang</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-center">Évol. rang</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200">Mention</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-200 text-center">Notes manquantes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.periodId}
                    className={`border-b border-sand-200 transition-colors hover:bg-accent-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                  >
                    {/* Period */}
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.periodName}</td>

                    {/* Average */}
                    <td className="px-4 py-3 text-right">
                      {r.avg !== null ? (
                        <span className={`text-base font-bold ${r.avg >= 10 ? 'text-primary-800' : 'text-red-600'}`}>
                          {r.avg}
                          <span className="text-xs font-normal text-gray-300">/20</span>
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>

                    {/* Average evolution */}
                    <td className="px-4 py-3 text-right">
                      <TrendBadge trend={avgTrend(r.avgDelta)}>
                        {r.avgDelta !== null
                          ? `${r.avgDelta > 0 ? '+' : ''}${r.avgDelta}`
                          : null}
                      </TrendBadge>
                    </td>

                    {/* Rank */}
                    <td className="px-4 py-3 text-center">
                      {r.rank !== null ? (
                        <span className="font-mono text-sm font-semibold text-gray-700">
                          {r.rank}<span className="text-xs font-normal text-gray-300"> / {r.rankedTotal}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Rank evolution */}
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      <TrendBadge trend={rankTrend(r.rankDelta)}>
                        {r.rankDelta !== null && r.rankDelta !== 0
                          ? `${Math.abs(r.rankDelta)} place${Math.abs(r.rankDelta) > 1 ? 's' : ''}`
                          : r.rankDelta === 0 ? 'stable' : null}
                      </TrendBadge>
                    </td>

                    {/* Mention */}
                    <td className="hidden sm:table-cell px-4 py-3">
                      {r.avg !== null ? (
                        <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${mentionClass(r.avg)}`}>
                          {mention(r.avg)}
                        </span>
                      ) : (
                        <span className="text-xs italic text-gray-300">Non noté</span>
                      )}
                    </td>

                    {/* Missing grades */}
                    <td className="hidden md:table-cell px-4 py-3 text-center">
                      {r.totalGrades === 0 ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : r.missingGrades > 0 ? (
                        <span className="inline-block rounded-full border border-accent-300 bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
                          {r.missingGrades} / {r.totalGrades}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-emerald-600">Complet</span>
                      )}
                    </td>

                    {/* Bulletin link */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/school/academics/bulletins/${student.id}?period_id=${r.periodId}`}
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
      )}

      <p className="text-center text-xs text-gray-400">
        Évolution calculée par rapport à la période précédente. ▲ progression · ▼ recul · — stable.
        Une amélioration du rang correspond à une place plus proche du 1<sup>er</sup>.
      </p>

      {BackLink}

    </div>
  )
}
