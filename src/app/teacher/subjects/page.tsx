import { requireTeacherCtx } from '../_auth'

type CsRow = {
  id: string
  classes: { name: string; level: string | null; section: string | null } | null
  subjects: { name: string; coefficient: number | null } | null
}

function classLabel(c: CsRow['classes']): string {
  if (!c) return '—'
  return [c.name, c.section ?? c.level].filter(Boolean).join(' ')
}

export default async function TeacherSubjectsPage() {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  if (assignedClassSubjectIds.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          </div>
          <h1 className="text-2xl font-bold text-white">Mes matières</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune matière assignée</p>
          <p className="mt-1 text-sm text-gray-400">L&apos;administrateur doit vous assigner des matières.</p>
        </div>
      </div>
    )
  }

  const { data: csData } = await supabase
    .from('class_subjects')
    .select('id, classes!class_id(name, level, section), subjects!subject_id(name, coefficient)')
    .eq('school_id', schoolId)
    .in('id', assignedClassSubjectIds)
  const classSubjects = (csData ?? []) as unknown as CsRow[]

  // Assessment counts per class_subject.
  const { data: assessData } = await supabase
    .from('assessments')
    .select('class_subject_id')
    .eq('school_id', schoolId)
    .in('class_subject_id', assignedClassSubjectIds)
  const assessCount = new Map<string, number>()
  for (const r of (assessData ?? []) as { class_subject_id: string }[]) {
    assessCount.set(r.class_subject_id, (assessCount.get(r.class_subject_id) ?? 0) + 1)
  }

  // Sort by class then subject.
  classSubjects.sort((a, b) =>
    classLabel(a.classes).localeCompare(classLabel(b.classes)) ||
    (a.subjects?.name ?? '').localeCompare(b.subjects?.name ?? ''),
  )

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Mes matières</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          {classSubjects.length} matière{classSubjects.length !== 1 ? 's' : ''} assignée{classSubjects.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {classSubjects.map((cs) => {
          const count = assessCount.get(cs.id) ?? 0
          return (
            <div key={cs.id} className="flex flex-col rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">{cs.subjects?.name ?? '—'}</p>
                  <p className="text-sm text-gray-500">{classLabel(cs.classes)}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Coefficient {cs.subjects?.coefficient ?? 1} · {count} évaluation{count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-100 pt-4">
                <a
                  href={`/teacher/grades?class_subject=${cs.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
                >
                  Voir les notes
                </a>
                <a
                  href={`/teacher/grades/new?class_subject=${cs.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-sand-50 transition-colors"
                >
                  + Évaluation
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
