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
  if (avg >= 16) return 'text-emerald-700 font-semibold'
  if (avg >= 14) return 'text-sky-700 font-semibold'
  if (avg >= 12) return 'text-primary-700 font-semibold'
  if (avg >= 10) return 'text-amber-600 font-medium'
  return 'text-red-600 font-medium'
}

type Props = {
  searchParams: { period_id?: string; class_id?: string }
}

export default async function BulletinsPage({ searchParams }: Props) {
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

  // Always fetch periods and classes for the filter form
  const [periodsRes, classesRes] = await Promise.all([
    supabase
      .from('academic_periods')
      .select('id, name, academic_year_id, academic_years!academic_year_id(id, name)')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),

    supabase
      .from('classes')
      .select('id, name, level, academic_year_id')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),
  ])

  type PeriodRow = { id: string; name: string; academic_year_id: string; academic_years: { id: string; name: string } }
  type ClassRow  = { id: string; name: string; level: string | null; academic_year_id: string }

  const periods = (periodsRes.data ?? []) as unknown as PeriodRow[]
  const classes = (classesRes.data ?? []) as ClassRow[]

  const selectedPeriodId = periods.some((p) => p.id === searchParams.period_id)
    ? searchParams.period_id!
    : null
  const selectedClassId = classes.some((c) => c.id === searchParams.class_id)
    ? searchParams.class_id!
    : null

  const selectedPeriod = selectedPeriodId ? periods.find((p) => p.id === selectedPeriodId) ?? null : null
  const selectedClass  = selectedClassId  ? classes.find((c) => c.id === selectedClassId)  ?? null : null

  // ── Student data (only when both period and class are selected) ────────────
  type StudentResult = {
    studentId:     string
    firstName:     string
    lastName:      string
    periodAvg:     number | null
    missingGrades: number
    totalAssessments: number
  }

  let studentResults: StudentResult[] = []
  let totalAssessmentsInPeriod = 0

  if (selectedPeriod && selectedClass) {
    // Fetch class_subjects for selected class+year
    const { data: csData } = await supabase
      .from('class_subjects')
      .select('id, subjects!subject_id(id, name, coefficient)')
      .eq('school_id', schoolId)
      .eq('class_id', selectedClass.id)
      .eq('academic_year_id', selectedClass.academic_year_id)

    type CSRow = { id: string; subjects: { id: string; name: string; coefficient: number | null } }
    const classSubjects = (csData ?? []) as unknown as CSRow[]
    const csIds = classSubjects.map((cs) => cs.id)

    // Fetch all assessments in period for this class
    const { data: assessData } = csIds.length > 0
      ? await supabase
          .from('assessments')
          .select('id, class_subject_id, coefficient, max_score')
          .eq('school_id', schoolId)
          .eq('academic_period_id', selectedPeriod.id)
          .in('class_subject_id', csIds)
      : { data: [] }

    type AssessRow = { id: string; class_subject_id: string; coefficient: number; max_score: number }
    const assessments = (assessData ?? []) as AssessRow[]
    const assessIds = assessments.map((a) => a.id)
    totalAssessmentsInPeriod = assessments.length

    // Fetch enrolled students + all grades in one shot
    const [enrollRes, gradesRes] = await Promise.all([
      supabase
        .from('student_class_enrollments')
        .select('student_id, students!student_id(id, first_name, last_name)')
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

    type EnrollRow = { student_id: string; students: { id: string; first_name: string; last_name: string } }
    type GradeRow  = { assessment_id: string; student_id: string; score: number }

    const enrollments = (enrollRes.data ?? []) as unknown as EnrollRow[]
    const grades      = (gradesRes.data ?? []) as GradeRow[]

    // Build grade index: assessment_id → student_id → score
    const gradeIndex = new Map<string, Map<string, number>>()
    for (const g of grades) {
      if (!gradeIndex.has(g.assessment_id)) gradeIndex.set(g.assessment_id, new Map())
      gradeIndex.get(g.assessment_id)!.set(g.student_id, g.score)
    }

    // Index assessments by class_subject_id
    const assessByCS = new Map<string, AssessRow[]>()
    for (const a of assessments) {
      if (!assessByCS.has(a.class_subject_id)) assessByCS.set(a.class_subject_id, [])
      assessByCS.get(a.class_subject_id)!.push(a)
    }

    // Compute per-student period average
    for (const enr of enrollments) {
      const sid = enr.student_id
      let weightedSum = 0
      let totalWeight = 0
      let graded = 0

      for (const cs of classSubjects) {
        const csAssessments = assessByCS.get(cs.id) ?? []
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
          const subjectAvg = csWeightedSum / csTotalWeight
          const subjectCoeff = cs.subjects.coefficient ?? 1
          weightedSum += subjectAvg * subjectCoeff
          totalWeight += subjectCoeff
        }
      }

      const periodAvg = totalWeight > 0 ? round2(weightedSum / totalWeight) : null

      studentResults.push({
        studentId:        sid,
        firstName:        enr.students.first_name,
        lastName:         enr.students.last_name,
        periodAvg,
        missingGrades:    totalAssessmentsInPeriod - graded,
        totalAssessments: totalAssessmentsInPeriod,
      })
    }

    // Sort by average descending (ungraded at bottom)
    studentResults.sort((a, b) => {
      if (a.periodAvg === null && b.periodAvg === null) return 0
      if (a.periodAvg === null) return 1
      if (b.periodAvg === null) return -1
      return b.periodAvg - a.periodAvg
    })
  }

  const hasSelection = !!(selectedPeriod && selectedClass)

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Bulletins scolaires</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {hasSelection
            ? `${studentResults.length} élève${studentResults.length !== 1 ? 's' : ''} — ${selectedClass!.name} · ${selectedPeriod!.name}`
            : 'Sélectionnez une période et une classe'}
        </p>
      </div>

      {/* ── Filter form ──────────────────────────────────────────────────────── */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div>
          <label htmlFor="period_id" className="block text-xs font-medium text-gray-600 mb-1">Période</label>
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
          Afficher
        </button>
      </form>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {!hasSelection ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Choisissez une période et une classe</p>
          <p className="mt-1 text-sm text-gray-400">Les moyennes seront calculées automatiquement.</p>
        </div>
      ) : studentResults.length === 0 ? (
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
          {/* Stats strip */}
          {totalAssessmentsInPeriod > 0 && (
            <div className="overflow-hidden rounded-xl grid grid-cols-3 shadow-sm">
              <div className="bg-primary-600 px-4 py-4 text-center">
                <p className="text-2xl font-bold text-white">{studentResults.length}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Élèves</p>
              </div>
              <div className="bg-primary-700 px-4 py-4 text-center">
                <p className="text-2xl font-bold text-white">{totalAssessmentsInPeriod}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mt-0.5">Évaluations</p>
              </div>
              <div className="bg-emerald-600 px-4 py-4 text-center">
                {(() => {
                  const graded = studentResults.filter((s) => s.periodAvg !== null)
                  const avg = graded.length > 0
                    ? round2(graded.reduce((s, r) => s + r.periodAvg!, 0) / graded.length)
                    : null
                  return (
                    <>
                      <p className="text-2xl font-bold text-white">{avg ?? '—'}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">Moy. classe /20</p>
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Student list table */}
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Rang</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Élève</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Moyenne</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Mention</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Notes manquantes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {studentResults.map((s, idx) => (
                  <tr
                    key={s.studentId}
                    className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                  >
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-mono text-gray-400">{s.periodAvg !== null ? idx + 1 : '—'}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.lastName} {s.firstName}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.periodAvg !== null ? (
                        <span className={`text-base font-bold ${mentionClass(s.periodAvg)}`}>
                          {s.periodAvg}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {s.periodAvg !== null ? (
                        <span className={`text-xs ${mentionClass(s.periodAvg)}`}>
                          {mention(s.periodAvg)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-center">
                      {s.missingGrades > 0 ? (
                        <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {s.missingGrades} / {s.totalAssessments}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600">Complet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/school/academics/bulletins/${s.studentId}?period_id=${selectedPeriodId}`}
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
        </>
      )}

    </div>
  )
}
