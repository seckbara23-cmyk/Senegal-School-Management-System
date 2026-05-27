import { requireTeacherCtx } from '../_auth'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_LABEL: Record<string, string> = {
  devoir:        'Devoir',
  composition:   'Composition',
  examen:        'Examen',
  participation: 'Participation',
  autre:         'Autre',
}

const TYPE_COLOR: Record<string, string> = {
  devoir:        'bg-primary-100 text-primary-700',
  composition:   'bg-emerald-100 text-emerald-700',
  examen:        'bg-red-100 text-red-700',
  participation: 'bg-amber-100 text-amber-700',
  autre:         'bg-gray-100 text-gray-600',
}

type AssessmentRow = {
  id: string
  title: string
  assessment_type: string
  assessment_date: string | null
  coefficient: number
  max_score: number
  class_subjects: {
    id: string
    class_id: string
    classes:  { name: string; level: string | null }
    subjects: { name: string }
  }
  academic_periods: { name: string }
}

type Props = {
  searchParams: { class_subject?: string }
}

export default async function TeacherGradesPage({ searchParams }: Props) {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  // Optional filter by class_subject (from classes page "Notes →" link)
  const filterCsId = searchParams.class_subject
  const targetIds  = filterCsId && assignedClassSubjectIds.includes(filterCsId)
    ? [filterCsId]
    : assignedClassSubjectIds

  if (assignedClassSubjectIds.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          </div>
          <h1 className="text-2xl font-bold text-white">Notes</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune matière assignée</p>
          <p className="mt-1 text-sm text-gray-400">L&apos;administrateur doit vous assigner des matières.</p>
        </div>
      </div>
    )
  }

  // Fetch assessments for assigned class-subjects
  const { data: assessData } = await supabase
    .from('assessments')
    .select('id, title, assessment_type, assessment_date, coefficient, max_score, class_subjects!class_subject_id(id, class_id, classes!class_id(name, level), subjects!subject_id(name)), academic_periods!academic_period_id(name)')
    .in('class_subject_id', targetIds)
    .order('assessment_date', { ascending: false, nullsFirst: false })

  const assessments = (assessData ?? []) as unknown as AssessmentRow[]
  const assessmentIds = assessments.map((a) => a.id)

  // Grade completion counts per assessment
  let gradeCountMap = new Map<string, number>()
  if (assessmentIds.length > 0) {
    const { data: gradesData } = await supabase
      .from('grades')
      .select('assessment_id')
      .in('assessment_id', assessmentIds)
      .eq('school_id', schoolId)

    for (const row of (gradesData ?? []) as { assessment_id: string }[]) {
      gradeCountMap.set(row.assessment_id, (gradeCountMap.get(row.assessment_id) ?? 0) + 1)
    }
  }

  // Enrollment counts per class
  const classIds = Array.from(new Set(assessments.map((a) => a.class_subjects.class_id)))
  let enrollCountMap = new Map<string, number>()
  if (classIds.length > 0) {
    const { data: enrollData } = await supabase
      .from('student_class_enrollments')
      .select('class_id')
      .in('class_id', classIds)
      .eq('school_id', schoolId)
      .eq('status', 'active')

    for (const row of (enrollData ?? []) as { class_id: string }[]) {
      enrollCountMap.set(row.class_id, (enrollCountMap.get(row.class_id) ?? 0) + 1)
    }
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Notes</h1>
            <p className="mt-0.5 text-sm text-primary-300">
              {assessments.length} évaluation{assessments.length !== 1 ? 's' : ''}
              {filterCsId && ' · filtre actif'}
            </p>
          </div>
          <a
            href="/teacher/grades/new"
            className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
          >
            + Nouvelle évaluation
          </a>
        </div>
      </div>

      {/* ── Active filter banner ─────────────────────────────────────────────── */}
      {filterCsId && (
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-4 py-2.5">
          <p className="text-sm text-primary-700">Filtré par classe / matière</p>
          <a href="/teacher/grades" className="text-xs font-medium text-primary-600 hover:underline">
            Effacer le filtre ×
          </a>
        </div>
      )}

      {assessments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune évaluation</p>
          <p className="mt-1 text-sm text-gray-400">
            Commencez par créer une nouvelle évaluation.
          </p>
          <a
            href="/teacher/grades/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            + Nouvelle évaluation
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Évaluations — {assessments.length} au total
            </p>
          </div>
          <div className="divide-y divide-sand-100">
            {assessments.map((a) => {
              const cs     = a.class_subjects as unknown as AssessmentRow['class_subjects']
              const period = a.academic_periods as unknown as { name: string }
              const graded = gradeCountMap.get(a.id) ?? 0
              const total  = enrollCountMap.get(cs.class_id) ?? 0

              return (
                <a
                  key={a.id}
                  href={`/teacher/grades/${a.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-primary-50 transition-colors"
                >
                  {/* Left: title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[a.assessment_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[a.assessment_type] ?? a.assessment_type}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cs.classes.name}
                      {cs.classes.level && ` (${cs.classes.level})`}
                      {' · '}{cs.subjects.name}
                      {' · '}{period.name}
                    </p>
                  </div>

                  {/* Right: grade completion + date */}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${graded === total && total > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                      {graded}/{total}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.assessment_date)}</p>
                  </div>

                  <span className="text-gray-300 shrink-0">→</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
