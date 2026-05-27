import { requireTeacherCtx } from '../_auth'

type ClassSubjectRow = {
  id: string
  class_id: string
  classes: {
    id:   string
    name: string
    level:   string | null
    section: string | null
    academic_years: { name: string }
  }
  subjects: { name: string; code: string | null; coefficient: number | null }
}

export default async function TeacherClassesPage() {
  const { supabase, schoolId, teacher, assignedClassSubjectIds } = await requireTeacherCtx()

  if (assignedClassSubjectIds.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          </div>
          <h1 className="text-2xl font-bold text-white">Mes classes</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune classe assignée</p>
          <p className="mt-1 text-sm text-gray-400">
            L&apos;administrateur doit vous assigner des matières dans les classes.
          </p>
        </div>
      </div>
    )
  }

  // Fetch class-subject details
  const { data: csData } = await supabase
    .from('class_subjects')
    .select('id, class_id, classes!class_id(id, name, level, section, academic_years!academic_year_id(name)), subjects!subject_id(name, code, coefficient)')
    .in('id', assignedClassSubjectIds)
    .eq('school_id', schoolId)

  const classSubjects = (csData ?? []) as unknown as ClassSubjectRow[]

  // Count active enrollments per class
  const classIds = Array.from(new Set(classSubjects.map((cs) => cs.class_id)))
  let enrollmentCounts = new Map<string, number>()

  if (classIds.length > 0) {
    const { data: enrollData } = await supabase
      .from('student_class_enrollments')
      .select('class_id')
      .in('class_id', classIds)
      .eq('school_id', schoolId)
      .eq('status', 'active')

    for (const row of (enrollData ?? []) as { class_id: string }[]) {
      enrollmentCounts.set(row.class_id, (enrollmentCounts.get(row.class_id) ?? 0) + 1)
    }
  }

  // Group by class for display
  type ClassGroup = {
    classId:   string
    className: string
    level:     string | null
    section:   string | null
    yearName:  string
    subjects:  { csId: string; name: string; code: string | null; coefficient: number | null }[]
    enrolled:  number
  }

  const classMap = new Map<string, ClassGroup>()
  for (const cs of classSubjects) {
    const cl = cs.classes
    if (!classMap.has(cs.class_id)) {
      classMap.set(cs.class_id, {
        classId:   cs.class_id,
        className: cl.name,
        level:     cl.level,
        section:   cl.section,
        yearName:  cl.academic_years.name,
        subjects:  [],
        enrolled:  enrollmentCounts.get(cs.class_id) ?? 0,
      })
    }
    classMap.get(cs.class_id)!.subjects.push({
      csId:        cs.id,
      name:        cs.subjects.name,
      code:        cs.subjects.code,
      coefficient: cs.subjects.coefficient,
    })
  }

  const groups = Array.from(classMap.values()).sort((a, b) =>
    a.className.localeCompare(b.className, 'fr')
  )

  const teacherName = `${teacher.first_name} ${teacher.last_name}`

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Mes classes</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          {teacherName} · {groups.length} classe{groups.length !== 1 ? 's' : ''}, {assignedClassSubjectIds.length} matière{assignedClassSubjectIds.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
          <p className="text-2xl font-bold text-primary-700">{groups.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Classes</p>
        </div>
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
          <p className="text-2xl font-bold text-primary-700">{assignedClassSubjectIds.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Matières</p>
        </div>
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
          <p className="text-2xl font-bold text-primary-700">
            {Array.from(enrollmentCounts.values()).reduce((s, n) => s + n, 0)}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Élèves</p>
        </div>
      </div>

      {/* ── Class cards ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.classId} className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            {/* Class header */}
            <div className="flex items-center justify-between bg-primary-800 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  {group.className}
                  {group.section && <span className="ml-1.5 text-primary-300 text-sm">— {group.section}</span>}
                </h2>
                <p className="text-xs text-primary-300 mt-0.5">
                  {group.yearName}
                  {group.level && ` · Niveau ${group.level}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">{group.enrolled}</p>
                <p className="text-xs text-primary-300">élève{group.enrolled !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Subjects in this class */}
            <div className="divide-y divide-sand-100 bg-white">
              {group.subjects.map((sub) => (
                <div key={sub.csId} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{sub.name}</p>
                    {sub.code && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{sub.code}</p>
                    )}
                  </div>
                  {sub.coefficient !== null && (
                    <span className="shrink-0 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                      Coef. {sub.coefficient}
                    </span>
                  )}
                  <a
                    href={`/teacher/grades?class_subject=${sub.csId}`}
                    className="shrink-0 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                  >
                    Notes →
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
