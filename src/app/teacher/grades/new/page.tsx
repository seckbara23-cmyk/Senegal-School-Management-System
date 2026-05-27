import { requireTeacherCtx } from '../../_auth'
import { NewTeacherAssessmentForm, type ClassSubjectOption, type PeriodOption } from '../_new_assessment_form'

type Props = {
  searchParams: { class_subject?: string | string[] }
}

export default async function TeacherNewAssessmentPage({ searchParams }: Props) {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  const rawCsId = Array.isArray(searchParams.class_subject)
    ? searchParams.class_subject[0]
    : searchParams.class_subject
  const preselectedCsId = rawCsId?.trim()

  // Load only assigned class_subjects (scoped to teacher)
  let classSubjects: ClassSubjectOption[] = []
  if (assignedClassSubjectIds.length > 0) {
    const { data: csData } = await supabase
      .from('class_subjects')
      .select('id, classes!class_id(name, level), subjects!subject_id(name, code)')
      .in('id', assignedClassSubjectIds)
      .eq('school_id', schoolId)
      .order('classes(name)', { ascending: true })

    type CSRow = {
      id: string
      classes:  { name: string; level: string | null }
      subjects: { name: string; code: string | null }
    }

    classSubjects = ((csData ?? []) as unknown as CSRow[]).map((cs) => ({
      id:          cs.id,
      className:   cs.classes.name + (cs.classes.level ? ` (${cs.classes.level})` : ''),
      subjectName: cs.subjects.name,
      subjectCode: cs.subjects.code,
    }))
  }

  // Load academic periods for the school
  const { data: periodsData } = await supabase
    .from('academic_periods')
    .select('id, name, academic_years!academic_year_id(name)')
    .eq('school_id', schoolId)
    .order('name', { ascending: true })

  type PeriodRow = { id: string; name: string; academic_years: { name: string } }

  const periods: PeriodOption[] = ((periodsData ?? []) as unknown as PeriodRow[]).map((p) => ({
    id:       p.id,
    name:     p.name,
    yearName: p.academic_years.name,
  }))

  const validPreselected = preselectedCsId && assignedClassSubjectIds.includes(preselectedCsId)
    ? preselectedCsId
    : undefined

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher/grades" className="text-primary-300 hover:text-white text-sm">
            ← Notes
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle évaluation</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Créer une évaluation et saisir les notes
        </p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <NewTeacherAssessmentForm
          classSubjects={classSubjects}
          periods={periods}
          preselectedCsId={validPreselected}
        />
      </div>

    </div>
  )
}
