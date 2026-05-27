import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { saveTeacherGrades } from '../actions'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtScore(score: number | null, maxScore: number): string {
  if (score === null) return '—'
  return `${score}/${maxScore}`
}

const TYPE_LABEL: Record<string, string> = {
  devoir:        'Devoir',
  composition:   'Composition',
  examen:        'Examen',
  participation: 'Participation',
  autre:         'Autre',
}

type Props = {
  params: { assessmentId: string }
  searchParams: { saved?: string; error?: string }
}

export default async function TeacherGradeEntryPage({ params, searchParams }: Props) {
  const supabase = createClient()

  // ── Auth: teacher membership ────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'teacher')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/dashboard')
  const schoolId = (membership as { school_id: string }).school_id

  // ── Resolve teacher record ──────────────────────────────────────────────────
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('profile_id', user.id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!teacher) redirect('/dashboard')
  const teacherId = (teacher as { id: string }).id

  // ── Fetch assessment with context ───────────────────────────────────────────
  const { data: rawAssessment } = await supabase
    .from('assessments')
    .select(`
      id, title, assessment_type, coefficient, max_score, assessment_date,
      class_subject_id,
      class_subjects!class_subject_id(
        id, class_id,
        classes!class_id(id, name, level),
        subjects!subject_id(name, code, coefficient)
      ),
      academic_periods!academic_period_id(id, name, academic_years!academic_year_id(name))
    `)
    .eq('id', params.assessmentId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawAssessment) notFound()

  type AssessmentFull = {
    id: string
    title: string
    assessment_type: string
    coefficient: number
    max_score: number
    assessment_date: string | null
    class_subject_id: string
    class_subjects: {
      id: string
      class_id: string
      classes:  { id: string; name: string; level: string | null }
      subjects: { name: string; code: string | null; coefficient: number | null }
    }
    academic_periods: {
      id: string
      name: string
      academic_years: { name: string }
    }
  }
  const assessment = rawAssessment as unknown as AssessmentFull

  // ── Verify teacher is assigned to this class_subject ───────────────────────
  const { data: assignment } = await supabase
    .from('teacher_subject_assignments')
    .select('id')
    .eq('class_subject_id', assessment.class_subject_id)
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!assignment) redirect('/teacher/grades')

  const classId  = assessment.class_subjects.class_id
  const maxScore = assessment.max_score

  // ── Fetch enrolled students + existing grades ───────────────────────────────
  const [enrollmentsRes, gradesRes] = await Promise.all([
    supabase
      .from('student_class_enrollments')
      .select('student_id, students!student_id(id, first_name, last_name)')
      .eq('class_id', classId)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('students(last_name)', { ascending: true }),

    supabase
      .from('grades')
      .select('student_id, score, comment')
      .eq('assessment_id', params.assessmentId)
      .eq('school_id', schoolId),
  ])

  type EnrollmentRow = {
    student_id: string
    students: { id: string; first_name: string; last_name: string }
  }
  type GradeRow = { student_id: string; score: number; comment: string | null }

  const enrollments = (enrollmentsRes.data ?? []) as unknown as EnrollmentRow[]
  const gradeMap    = new Map<string, GradeRow>()
  for (const g of (gradesRes.data ?? []) as GradeRow[]) {
    gradeMap.set(g.student_id, g)
  }

  const gradedScores = enrollments
    .map((e) => gradeMap.get(e.student_id)?.score ?? null)
    .filter((s): s is number => s !== null)

  const gradedCount = gradedScores.length
  const avgScore    = gradedCount > 0
    ? Math.round((gradedScores.reduce((s, n) => s + n, 0) / gradedCount) * 100) / 100
    : null

  const saved   = searchParams.saved === '1'
  const errCode = searchParams.error

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher/grades" className="text-primary-300 hover:text-white text-sm">← Notes</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{assessment.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          <span className="text-primary-300 text-sm">
            {assessment.class_subjects.classes.name}
            {assessment.class_subjects.classes.level ? ` (${assessment.class_subjects.classes.level})` : ''}
          </span>
          <span className="text-primary-500 text-sm">·</span>
          <span className="text-primary-300 text-sm">{assessment.class_subjects.subjects.name}</span>
          <span className="text-primary-500 text-sm">·</span>
          <span className="text-primary-300 text-sm">{assessment.academic_periods.name}</span>
          <span className="text-primary-500 text-sm">·</span>
          <span className="text-primary-300 text-sm">{assessment.academic_periods.academic_years.name}</span>
        </div>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm">
        <div className="bg-primary-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">/{maxScore}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Barème</p>
        </div>
        <div className="bg-primary-700 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{assessment.coefficient}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-300 mt-0.5">Coefficient</p>
        </div>
        <div className="bg-emerald-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">
            {avgScore !== null ? avgScore : '—'}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">
            Moyenne ({gradedCount}/{enrollments.length})
          </p>
        </div>
        <div className="bg-accent-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">
            {TYPE_LABEL[assessment.assessment_type] ?? assessment.assessment_type}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-200 mt-0.5">
            {fmtDate(assessment.assessment_date)}
          </p>
        </div>
      </div>

      {/* ── Banners ─────────────────────────────────────────────────────────── */}
      {saved && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Notes enregistrées avec succès.
        </div>
      )}
      {errCode === 'invalid_score' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Note invalide — vérifiez que les notes sont entre 0 et {maxScore}.
        </div>
      )}
      {errCode === 'unauthorized' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Vous n&apos;êtes pas autorisé à modifier les notes de cette évaluation.
        </div>
      )}

      {/* ── Grade entry form ─────────────────────────────────────────────────── */}
      {enrollments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun élève inscrit</p>
          <p className="mt-1 text-sm text-gray-500">
            L&apos;administrateur doit inscrire des élèves actifs dans cette classe.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-sand-200 shadow-sm overflow-hidden">

          <div className="flex items-center justify-between px-5 py-3 bg-sand-50 border-b border-sand-200">
            <h2 className="text-sm font-semibold text-gray-800">
              Saisie des notes — {enrollments.length} élève{enrollments.length !== 1 ? 's' : ''}
            </h2>
            <span className="text-xs text-gray-400">Barème : /{maxScore}</span>
          </div>

          <form action={saveTeacherGrades}>
            <input type="hidden" name="assessment_id" value={assessment.id} />

            <div className="grid grid-cols-[2rem_1fr_8rem_1fr] sm:grid-cols-[2.5rem_1fr_9rem_1fr] border-b border-sand-200 bg-primary-800 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-300">#</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-200">Élève</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-200 text-right pr-2">Note /{maxScore}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-200 pl-3">Observation</span>
            </div>

            <div className="divide-y divide-sand-100">
              {enrollments.map((enr, idx) => {
                const existing = gradeMap.get(enr.student_id)
                const student  = enr.students
                return (
                  <div
                    key={enr.student_id}
                    className={`grid grid-cols-[2rem_1fr_8rem_1fr] sm:grid-cols-[2.5rem_1fr_9rem_1fr] items-center px-4 py-2 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'
                    }`}
                  >
                    <span className="text-xs text-gray-300 font-mono select-none">{idx + 1}</span>
                    <span className="text-sm font-medium text-gray-900 pr-2 truncate">
                      {student.last_name} {student.first_name}
                    </span>
                    <div className="flex items-center justify-end gap-1 pr-2">
                      <input
                        type="number"
                        name={`score_${enr.student_id}`}
                        defaultValue={existing?.score ?? ''}
                        min="0"
                        max={maxScore}
                        step="0.25"
                        placeholder="—"
                        className={`w-16 rounded border px-2 py-1 text-right text-sm font-semibold shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                          existing
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      />
                    </div>
                    <input
                      type="text"
                      name={`comment_${enr.student_id}`}
                      defaultValue={existing?.comment ?? ''}
                      placeholder="Observation…"
                      maxLength={200}
                      className="ml-3 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 placeholder-gray-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 w-full"
                    />
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-sand-200 bg-sand-50 px-5 py-3">
              <p className="text-xs text-gray-400">Laissez vide pour effacer une note existante.</p>
              <button
                type="submit"
                className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
              >
                Enregistrer les notes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Grade summary table (read-only) ──────────────────────────────────── */}
      {gradedCount > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wider">
            Récapitulatif — {gradedCount} note{gradedCount !== 1 ? 's' : ''} saisie{gradedCount !== 1 ? 's' : ''}
          </h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Élève</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Note</th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Observation</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enr, idx) => {
                  const g = gradeMap.get(enr.student_id)
                  if (!g) return null
                  return (
                    <tr key={enr.student_id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {enr.students.last_name} {enr.students.first_name}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${g.score / maxScore >= 0.5 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {fmtScore(g.score, maxScore)}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-gray-500 text-xs">
                        {g.comment ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {avgScore !== null && (
                <tfoot>
                  <tr className="border-t-2 border-primary-200 bg-primary-50">
                    <td className="px-4 py-2.5 text-sm font-bold text-primary-800">Moyenne de classe</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-primary-800">
                      {avgScore}/{maxScore}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-2.5 text-xs text-primary-600">
                      {gradedCount}/{enrollments.length} élèves notés
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
