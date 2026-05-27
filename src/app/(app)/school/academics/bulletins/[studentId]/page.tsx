import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mention(avg: number): { label: string; colorClass: string; borderClass: string } {
  if (avg >= 16) return { label: 'Très bien',  colorClass: 'text-emerald-700', borderClass: 'border-emerald-300 bg-emerald-50' }
  if (avg >= 14) return { label: 'Bien',        colorClass: 'text-sky-700',     borderClass: 'border-sky-300 bg-sky-50'         }
  if (avg >= 12) return { label: 'Assez bien',  colorClass: 'text-primary-700', borderClass: 'border-primary-300 bg-primary-50' }
  if (avg >= 10) return { label: 'Passable',    colorClass: 'text-amber-600',   borderClass: 'border-amber-200 bg-amber-50'     }
  return              { label: 'Insuffisant', colorClass: 'text-red-600',     borderClass: 'border-red-200 bg-red-50'         }
}

const TYPE_SHORT: Record<string, string> = {
  devoir:        'D',
  composition:   'Comp.',
  examen:        'Exam.',
  participation: 'Part.',
  autre:         'Autre',
}

type Props = {
  params: { studentId: string }
  searchParams: { period_id?: string }
}

export default async function BulletinPage({ params, searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name, address)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')

  type MembershipRow = { school_id: string; schools: { name: string; address: string | null } }
  const mem     = membership as unknown as MembershipRow
  const schoolId   = mem.school_id
  const schoolName = mem.schools.name

  // Validate period_id
  if (!searchParams.period_id) redirect('/school/academics/bulletins')

  const [studentRes, periodRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('id', params.studentId)
      .eq('school_id', schoolId)
      .maybeSingle(),

    supabase
      .from('academic_periods')
      .select('id, name, academic_year_id, academic_years!academic_year_id(name)')
      .eq('id', searchParams.period_id)
      .eq('school_id', schoolId)
      .maybeSingle(),
  ])

  if (!studentRes.data) notFound()
  if (!periodRes.data)  notFound()

  type StudentRow = { id: string; first_name: string; last_name: string }
  type PeriodRow  = { id: string; name: string; academic_year_id: string; academic_years: { name: string } }

  const student = studentRes.data as StudentRow
  const period  = periodRes.data as unknown as PeriodRow

  // Find student's active class enrollment for this academic year
  const { data: enrollData } = await supabase
    .from('student_class_enrollments')
    .select('class_id, classes!class_id(id, name, level)')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('academic_year_id', period.academic_year_id)
    .eq('status', 'active')
    .maybeSingle()

  type EnrollRow = { class_id: string; classes: { id: string; name: string; level: string | null } }
  const enrollment = enrollData as unknown as EnrollRow | null

  if (!enrollment) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/school/academics/bulletins" className="text-primary-300 hover:text-white text-sm">← Bulletins</a>
          </div>
          <h1 className="text-2xl font-bold text-white">Bulletin introuvable</h1>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-6 py-8 text-center shadow-sm">
          <p className="text-sm text-gray-600">
            {student.first_name} {student.last_name} n&apos;est pas inscrit(e) dans une classe pour cette année scolaire.
          </p>
          <a href="/school/academics/bulletins" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            ← Retour aux bulletins
          </a>
        </div>
      </div>
    )
  }

  const classId = enrollment.class_id

  // Fetch class_subjects with subject + teacher
  const { data: csData } = await supabase
    .from('class_subjects')
    .select(`
      id,
      subjects!subject_id(id, name, code, coefficient),
      teacher_subject_assignments!class_subject_id(
        teachers!teacher_id(first_name, last_name)
      )
    `)
    .eq('class_id', classId)
    .eq('school_id', schoolId)
    .eq('academic_year_id', period.academic_year_id)
    .order('subjects(name)', { ascending: true })

  type CSRow = {
    id: string
    subjects: { id: string; name: string; code: string | null; coefficient: number | null }
    teacher_subject_assignments: Array<{ teachers: { first_name: string; last_name: string } }>
  }
  const classSubjects = (csData ?? []) as unknown as CSRow[]
  const csIds = classSubjects.map((cs) => cs.id)

  // Fetch assessments in period for this class
  const { data: assessData } = csIds.length > 0
    ? await supabase
        .from('assessments')
        .select('id, title, assessment_type, coefficient, max_score, class_subject_id')
        .eq('school_id', schoolId)
        .eq('academic_period_id', period.id)
        .in('class_subject_id', csIds)
        .order('assessment_date', { ascending: true, nullsFirst: false })
    : { data: [] }

  type AssessRow = {
    id: string
    title: string
    assessment_type: string
    coefficient: number
    max_score: number
    class_subject_id: string
  }
  const assessments = (assessData ?? []) as AssessRow[]
  const assessIds   = assessments.map((a) => a.id)

  // Fetch grades: all enrolled students (for rank) + this student
  const { data: allEnrolledData } = await supabase
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const allStudentIds = ((allEnrolledData ?? []) as { student_id: string }[]).map((e) => e.student_id)

  const { data: gradesData } = assessIds.length > 0
    ? await supabase
        .from('grades')
        .select('assessment_id, student_id, score, comment')
        .eq('school_id', schoolId)
        .in('assessment_id', assessIds)
    : { data: [] }

  type GradeRow = { assessment_id: string; student_id: string; score: number; comment: string | null }
  const grades = (gradesData ?? []) as GradeRow[]

  // ── In-memory calculation ─────────────────────────────────────────────────

  // Index grades: assessment_id → student_id → {score, comment}
  const gradeIndex = new Map<string, Map<string, { score: number; comment: string | null }>>()
  for (const g of grades) {
    if (!gradeIndex.has(g.assessment_id)) gradeIndex.set(g.assessment_id, new Map())
    gradeIndex.get(g.assessment_id)!.set(g.student_id, { score: g.score, comment: g.comment })
  }

  // Index assessments by class_subject_id
  const assessByCS = new Map<string, AssessRow[]>()
  for (const a of assessments) {
    if (!assessByCS.has(a.class_subject_id)) assessByCS.set(a.class_subject_id, [])
    assessByCS.get(a.class_subject_id)!.push(a)
  }

  // Subject average for a student (normalised to /20)
  function subjectAvg(csId: string, sid: string): {
    avg: number | null
    gradedCount: number
    totalCount: number
    classAvg: number | null
  } {
    const csAssessments = assessByCS.get(csId) ?? []

    let weightedSum   = 0
    let totalWeight   = 0
    let gradedCount   = 0

    for (const a of csAssessments) {
      const entry = gradeIndex.get(a.id)?.get(sid)
      if (entry !== undefined) {
        weightedSum += (entry.score / a.max_score) * 20 * a.coefficient
        totalWeight += a.coefficient
        gradedCount++
      }
    }

    // Class average for this subject
    let classWSum   = 0
    let classTWeight = 0
    let classCount  = 0

    for (const sid2 of allStudentIds) {
      let sWSum = 0
      let sTWeight = 0
      for (const a of csAssessments) {
        const entry = gradeIndex.get(a.id)?.get(sid2)
        if (entry !== undefined) {
          sWSum   += (entry.score / a.max_score) * 20 * a.coefficient
          sTWeight += a.coefficient
        }
      }
      if (sTWeight > 0) {
        classWSum   += sWSum / sTWeight
        classTWeight = 1
        classCount++
      }
    }

    return {
      avg:        totalWeight  > 0 ? round2(weightedSum  / totalWeight)  : null,
      gradedCount,
      totalCount: csAssessments.length,
      classAvg:   classCount   > 0 ? round2(classWSum    / classCount)   : null,
    }
  }

  // Period average for a student
  function periodAvg(sid: string): number | null {
    let weightedSum = 0
    let totalWeight = 0

    for (const cs of classSubjects) {
      const { avg } = subjectAvg(cs.id, sid)
      if (avg !== null) {
        const coeff = cs.subjects.coefficient ?? 1
        weightedSum += avg * coeff
        totalWeight += coeff
      }
    }

    return totalWeight > 0 ? round2(weightedSum / totalWeight) : null
  }

  // Compute rank
  const studentAvgs = allStudentIds.map((sid) => ({ sid, avg: periodAvg(sid) }))
  studentAvgs.sort((a, b) => {
    if (a.avg === null && b.avg === null) return 0
    if (a.avg === null) return 1
    if (b.avg === null) return -1
    return b.avg - a.avg
  })
  const rankPosition = studentAvgs.findIndex((s) => s.sid === student.id)
  const rank         = rankPosition >= 0 ? rankPosition + 1 : null

  const overallAvg = periodAvg(student.id)
  const mentionData = overallAvg !== null ? mention(overallAvg) : null

  // Build subject rows for display
  const subjectRows = classSubjects.map((cs) => {
    const { avg, gradedCount, totalCount, classAvg } = subjectAvg(cs.id, student.id)
    const csAssessments = assessByCS.get(cs.id) ?? []
    const teacher = cs.teacher_subject_assignments[0]?.teachers ?? null

    // Collect individual grades for this student
    const gradeEntries = csAssessments.map((a) => {
      const entry = gradeIndex.get(a.id)?.get(student.id)
      return {
        id:    a.id,
        title: a.title,
        type:  a.assessment_type,
        score: entry ? round2(entry.score) : null,
        maxScore: a.max_score,
        comment:  entry?.comment ?? null,
      }
    })

    return {
      id:          cs.id,
      name:        cs.subjects.name,
      code:        cs.subjects.code,
      coefficient: cs.subjects.coefficient ?? 1,
      avg,
      classAvg,
      gradedCount,
      totalCount,
      teacher,
      gradeEntries,
    }
  })

  return (
    <div className="space-y-6">

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <a href={`/school/academics/bulletins?period_id=${period.id}&class_id=${classId}`}
           className="text-sm text-primary-600 hover:text-primary-800 hover:underline">
          ← Retour à la liste
        </a>
        <span className="text-xs text-gray-400">
          {allStudentIds.length} élève{allStudentIds.length !== 1 ? 's' : ''} dans la classe
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BULLETIN DOCUMENT
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border-2 border-primary-200 bg-white shadow-md overflow-hidden print:shadow-none print:border-gray-300">

        {/* ── Document header ──────────────────────────────────────────────── */}
        <div className="bg-primary-800 px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-300 mb-1">
            République du Sénégal
          </p>
          <h1 className="text-xl font-bold text-white tracking-tight">{schoolName}</h1>
          <p className="text-primary-300 text-xs mt-0.5 uppercase tracking-wider">
            Bulletin Scolaire
          </p>
        </div>

        {/* ── Identity band ────────────────────────────────────────────────── */}
        <div className="border-b-2 border-primary-200 bg-primary-50 px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-0.5">Élève</p>
              <p className="font-bold text-primary-900">{student.last_name} {student.first_name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-0.5">Classe</p>
              <p className="font-semibold text-primary-800">
                {enrollment.classes.name}
                {enrollment.classes.level ? ` — ${enrollment.classes.level}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-0.5">Période</p>
              <p className="font-semibold text-primary-800">{period.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-0.5">Année scolaire</p>
              <p className="font-semibold text-primary-800">{period.academic_years.name}</p>
            </div>
          </div>
        </div>

        {/* ── Subject table ─────────────────────────────────────────────────── */}
        {subjectRows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-500">Aucune matière assignée à cette classe pour cette période.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-sand-100 border-b-2 border-primary-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-700 w-[22%]">Matière</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-700 text-center w-14">Coeff</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-700">Évaluations</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-700 text-right w-20">Moyenne</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-700 text-right w-20">Moy. classe</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-700 w-[18%]">Enseignant</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-sand-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                  >
                    {/* Subject name */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{row.name}</p>
                      {row.code && <p className="text-xs text-gray-400 font-mono">{row.code}</p>}
                    </td>

                    {/* Coefficient */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block rounded bg-primary-100 px-1.5 py-0.5 text-xs font-bold text-primary-700">
                        {row.coefficient}
                      </span>
                    </td>

                    {/* Grade entries */}
                    <td className="px-4 py-3">
                      {row.gradeEntries.length === 0 ? (
                        <span className="text-xs text-gray-300 italic">Aucune évaluation</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {row.gradeEntries.map((g) => (
                            <span
                              key={g.id}
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                                g.score !== null
                                  ? g.score / g.maxScore >= 0.5
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-400'
                              }`}
                              title={g.title}
                            >
                              <span className="text-[10px] font-normal mr-1 opacity-70">
                                {TYPE_SHORT[g.type] ?? g.type}
                              </span>
                              {g.score !== null ? `${g.score}/${g.maxScore}` : '—'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Subject average */}
                    <td className="px-4 py-3 text-right">
                      {row.avg !== null ? (
                        <span className={`text-base font-bold ${row.avg >= 10 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {row.avg}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                      <span className="text-gray-300 text-xs">/20</span>
                    </td>

                    {/* Class average */}
                    <td className="hidden md:table-cell px-4 py-3 text-right text-gray-400 text-xs">
                      {row.classAvg !== null ? `${row.classAvg}/20` : '—'}
                    </td>

                    {/* Teacher */}
                    <td className="hidden lg:table-cell px-4 py-3 text-xs text-gray-500">
                      {row.teacher
                        ? `${row.teacher.last_name} ${row.teacher.first_name}`
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Summary footer ────────────────────────────────────────────────── */}
        <div className="border-t-2 border-primary-200 bg-primary-50 px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-center">

            {/* Overall average */}
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-1">Moyenne générale</p>
              {overallAvg !== null ? (
                <p className={`text-3xl font-bold ${overallAvg >= 10 ? 'text-primary-800' : 'text-red-700'}`}>
                  {overallAvg}
                  <span className="text-base font-normal text-primary-400 ml-0.5">/20</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-300">—</p>
              )}
            </div>

            {/* Mention */}
            {mentionData && (
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-1">Mention</p>
                <span className={`inline-block rounded-lg border-2 px-4 py-1.5 text-base font-bold uppercase tracking-wide ${mentionData.borderClass} ${mentionData.colorClass}`}>
                  {mentionData.label}
                </span>
              </div>
            )}

            {/* Rank */}
            <div className="text-center sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-1">Classement</p>
              {rank !== null && overallAvg !== null ? (
                <p className="text-2xl font-bold text-primary-800">
                  {rank}
                  <span className="text-sm font-normal text-primary-400">
                    {rank === 1 ? 'er' : 'e'} / {allStudentIds.length}
                  </span>
                </p>
              ) : (
                <p className="text-xl text-gray-300">—</p>
              )}
            </div>
          </div>

          {/* Observations */}
          <div className="mt-5 border-t border-primary-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-2">Observations</p>
            <div className="min-h-[3rem] rounded border border-dashed border-primary-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-300 italic">—</p>
            </div>
          </div>

          {/* Signature line */}
          <div className="mt-4 flex justify-end">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-6">Le Directeur / La Directrice</p>
              <div className="border-t border-gray-300 w-40 mx-auto" />
              <p className="text-xs text-gray-300 mt-1">Signature et cachet</p>
            </div>
          </div>
        </div>

      </div>
      {/* ── End bulletin document ─────────────────────────────────────────── */}

    </div>
  )
}
