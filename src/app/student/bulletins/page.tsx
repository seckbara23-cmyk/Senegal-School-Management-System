import { requireStudentCtx } from '../_auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100 }

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

type SearchParams = { period_id?: string }

type SubjectResult = {
  subjectId: string; subjectName: string; coefficient: number
  teacherName: string | null; subjectAvg: number | null
  missingGrades: number; totalAssessments: number
}

export default async function StudentBulletinsPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, schoolId, student } = await requireStudentCtx()

  // Active class enrollment
  const { data: enrData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, classes!class_id(id, name, academic_year_id)')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  type EnrRow = { class_id: string; classes: { id: string; name: string; academic_year_id: string } }
  const enrollment = enrData as unknown as EnrRow | null

  // Periods for this school
  const { data: periodsData } = await supabase
    .from('academic_periods')
    .select('id, name, academic_year_id, academic_years!academic_year_id(id, name)')
    .eq('school_id', schoolId)
    .order('name', { ascending: true })

  type PeriodRow = { id: string; name: string; academic_year_id: string; academic_years: { id: string; name: string } }
  const periods = (periodsData ?? []) as unknown as PeriodRow[]

  const selectedPeriodId = periods.some((p) => p.id === searchParams.period_id)
    ? searchParams.period_id!
    : null
  const selectedPeriod = selectedPeriodId ? periods.find((p) => p.id === selectedPeriodId) ?? null : null

  // ── Calculation ───────────────────────────────────────────────────────────

  let subjectResults: SubjectResult[] = []
  let periodAvg: number | null = null
  let rank: number | null = null
  let classAvg: number | null = null

  if (selectedPeriod && enrollment) {
    const { class_id: classId, classes } = enrollment
    const academicYearId = classes.academic_year_id

    const { data: csData } = await supabase
      .from('class_subjects')
      .select('id, subjects!subject_id(id, name, coefficient), teacher_subject_assignments(teachers!teacher_id(first_name, last_name))')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('academic_year_id', academicYearId)

    type CSRow = {
      id: string
      subjects: { id: string; name: string; coefficient: number | null }
      teacher_subject_assignments: { teachers: { first_name: string; last_name: string } | null }[]
    }
    const classSubjects = (csData ?? []) as unknown as CSRow[]
    const csIds = classSubjects.map((cs) => cs.id)

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

    const [myGradesRes, allGradesRes, allEnrRes] = await Promise.all([
      assessIds.length > 0
        ? supabase.from('grades').select('assessment_id, score').eq('student_id', student.id).in('assessment_id', assessIds)
        : Promise.resolve({ data: [] }),
      assessIds.length > 0
        ? supabase.from('grades').select('assessment_id, student_id, score').eq('school_id', schoolId).in('assessment_id', assessIds)
        : Promise.resolve({ data: [] }),
      supabase.from('student_class_enrollments').select('student_id').eq('class_id', classId).eq('school_id', schoolId).eq('status', 'active'),
    ])

    type GradeRow = { assessment_id: string; student_id?: string; score: number }
    const myGrades = (myGradesRes.data ?? []) as GradeRow[]
    const allGrades = (allGradesRes.data ?? []) as GradeRow[]
    const allStudentIds = ((allEnrRes.data ?? []) as { student_id: string }[]).map((e) => e.student_id)

    const myGradeIndex = new Map<string, number>()
    for (const g of myGrades) myGradeIndex.set(g.assessment_id, g.score)

    const allGradeIndex = new Map<string, Map<string, number>>()
    for (const g of allGrades) {
      if (!allGradeIndex.has(g.assessment_id)) allGradeIndex.set(g.assessment_id, new Map())
      allGradeIndex.get(g.assessment_id)!.set(g.student_id!, g.score)
    }

    const assessByCS = new Map<string, AssessRow[]>()
    for (const a of assessments) {
      if (!assessByCS.has(a.class_subject_id)) assessByCS.set(a.class_subject_id, [])
      assessByCS.get(a.class_subject_id)!.push(a)
    }

    let weightedSum = 0; let totalWeight = 0

    for (const cs of classSubjects) {
      const csAssessments = assessByCS.get(cs.id) ?? []
      let csWeightedSum = 0; let csTotalWeight = 0; let graded = 0

      for (const a of csAssessments) {
        const score = myGradeIndex.get(a.id)
        if (score !== undefined) {
          csWeightedSum += (score / a.max_score) * 20 * a.coefficient
          csTotalWeight += a.coefficient
          graded++
        }
      }

      const subjectAvg = csTotalWeight > 0 ? round2(csWeightedSum / csTotalWeight) : null
      const subjectCoeff = cs.subjects.coefficient ?? 1
      if (subjectAvg !== null) {
        weightedSum += subjectAvg * subjectCoeff
        totalWeight += subjectCoeff
      }

      const tsaEmbed = cs.teacher_subject_assignments
      const tsa = Array.isArray(tsaEmbed) ? tsaEmbed[0] : tsaEmbed
      const teacherName = tsa?.teachers ? `${tsa.teachers.first_name} ${tsa.teachers.last_name}` : null

      subjectResults.push({
        subjectId: cs.subjects.id, subjectName: cs.subjects.name, coefficient: subjectCoeff,
        teacherName, subjectAvg, missingGrades: csAssessments.length - graded,
        totalAssessments: csAssessments.length,
      })
    }

    periodAvg = totalWeight > 0 ? round2(weightedSum / totalWeight) : null

    if (allStudentIds.length > 1) {
      const studentAvgs: number[] = []
      for (const sid of allStudentIds) {
        let ws = 0; let tw = 0
        for (const cs of classSubjects) {
          const csAssessments = assessByCS.get(cs.id) ?? []
          let csWS = 0; let csTW = 0
          for (const a of csAssessments) {
            const score = allGradeIndex.get(a.id)?.get(sid)
            if (score !== undefined) {
              csWS += (score / a.max_score) * 20 * a.coefficient
              csTW += a.coefficient
            }
          }
          if (csTW > 0) {
            ws += (csWS / csTW) * (cs.subjects.coefficient ?? 1)
            tw += cs.subjects.coefficient ?? 1
          }
        }
        if (tw > 0) studentAvgs.push(round2(ws / tw))
      }
      studentAvgs.sort((a, b) => b - a)
      classAvg = studentAvgs.length > 0
        ? round2(studentAvgs.reduce((s, v) => s + v, 0) / studentAvgs.length)
        : null
      if (periodAvg !== null) {
        rank = studentAvgs.findIndex((avg) => avg <= periodAvg!) + 1
      }
    }
  }

  const hasData = selectedPeriod && enrollment && subjectResults.length > 0

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Mes bulletins</h1>
        {selectedPeriod && (
          <p className="mt-0.5 text-sm text-primary-300">{selectedPeriod.name} · {selectedPeriod.academic_years.name}</p>
        )}
      </div>

      {/* Period selector */}
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
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
          Afficher
        </button>
      </form>

      {!selectedPeriod && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Choisissez une période</p>
          <p className="mt-1 text-sm text-gray-400">Votre bulletin sera calculé automatiquement.</p>
        </div>
      )}

      {selectedPeriod && !enrollment && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune inscription de classe active</p>
          <p className="mt-1 text-sm text-gray-400">Contactez l&apos;administrateur pour associer votre classe.</p>
        </div>
      )}

      {selectedPeriod && enrollment && subjectResults.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune évaluation pour cette période</p>
          <p className="mt-1 text-sm text-gray-400">Revenez après les premières évaluations.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Identity banner */}
          <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-primary-700 px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200">Bulletin de notes</p>
              <p className="text-base font-bold text-white mt-0.5">
                {student.last_name} {student.first_name}
              </p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-sand-200 text-center">
              <div className="px-3 py-3">
                <p className="text-xs text-gray-400">Classe</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{enrollment!.classes.name}</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-xs text-gray-400">Période</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedPeriod!.name}</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-xs text-gray-400">Année</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedPeriod!.academic_years.name}</p>
              </div>
            </div>
          </div>

          {/* Subject table */}
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Matière</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Coeff.</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Moy./20</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Mention</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Enseignant(e)</th>
                </tr>
              </thead>
              <tbody>
                {subjectResults.map((sr, idx) => (
                  <tr key={sr.subjectId} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{sr.subjectName}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{sr.coefficient}</td>
                    <td className="px-4 py-3 text-right">
                      {sr.subjectAvg !== null ? (
                        <span className={`text-base font-bold ${mentionClass(sr.subjectAvg)}`}>{sr.subjectAvg}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {sr.subjectAvg !== null ? (
                        <span className={`text-xs ${mentionClass(sr.subjectAvg)}`}>{mention(sr.subjectAvg)}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-xs text-gray-500">
                      {sr.teacherName ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-3 overflow-hidden rounded-xl shadow-sm">
            <div className="bg-primary-700 px-4 py-4 text-center">
              <p className={`text-2xl font-bold ${periodAvg !== null ? 'text-white' : 'text-white/40'}`}>
                {periodAvg ?? '—'}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Moyenne /20</p>
            </div>
            <div className="bg-primary-600 px-4 py-4 text-center">
              <p className={`text-2xl font-bold ${rank !== null ? 'text-white' : 'text-white/40'}`}>
                {rank !== null ? `${rank}${rank === 1 ? 'er' : 'e'}` : '—'}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Rang</p>
            </div>
            <div className="bg-emerald-600 px-4 py-4 text-center">
              <p className={`text-2xl font-bold ${classAvg !== null ? 'text-white' : 'text-white/40'}`}>
                {classAvg ?? '—'}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">Moy. classe</p>
            </div>
          </div>

          {periodAvg !== null && (
            <div className="rounded-xl border border-sand-200 bg-white shadow-sm px-5 py-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Appréciation</span>
              <span className={`text-base font-bold ${mentionClass(periodAvg)}`}>{mention(periodAvg)}</span>
            </div>
          )}
        </>
      )}

    </div>
  )
}
