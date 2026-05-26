import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { assignSubjectToClass, assignTeacher, removeSubjectFromClass } from '../actions'

type Props = {
  searchParams: { class_id?: string; error?: string }
}

const ERROR_MSG: Record<string, string> = {
  invalid:   'Données invalides. Vérifiez votre sélection.',
  duplicate: 'Cette matière est déjà assignée à cette classe.',
  server:    'Erreur serveur. Réessayez.',
}

export default async function AssignmentsPage({ searchParams }: Props) {
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

  // Fetch all needed data in parallel
  const [classesRes, subjectsRes, teachersRes] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, level, academic_year_id, academic_years!academic_year_id(id, name, is_active)')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),

    supabase
      .from('subjects')
      .select('id, name, code, coefficient')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),

    supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('last_name', { ascending: true }),
  ])

  type ClassRow = {
    id: string
    name: string
    level: string | null
    academic_year_id: string
    academic_years: { id: string; name: string; is_active: boolean }
  }
  type SubjectRow = { id: string; name: string; code: string | null; coefficient: number | null }
  type TeacherRow = { id: string; first_name: string; last_name: string }

  const classes  = (classesRes.data  ?? []) as unknown as ClassRow[]
  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  const teachers = (teachersRes.data ?? []) as TeacherRow[]

  // Validate selectedClassId
  const selectedClassId = classes.some((c) => c.id === searchParams.class_id)
    ? searchParams.class_id!
    : classes.find((c) => c.academic_years.is_active)?.id ?? classes[0]?.id ?? null

  const selectedClass = selectedClassId ? classes.find((c) => c.id === selectedClassId) ?? null : null

  // Fetch class_subjects for selected class, with teacher assignment
  type ClassSubjectRow = {
    id: string
    subject_id: string
    subjects: { name: string; code: string | null; coefficient: number | null }
    teacher_subject_assignments: Array<{ teacher_id: string; teachers: { first_name: string; last_name: string } }>
  }
  let classSubjects: ClassSubjectRow[] = []

  if (selectedClassId) {
    const { data } = await supabase
      .from('class_subjects')
      .select(`
        id, subject_id,
        subjects!subject_id(name, code, coefficient),
        teacher_subject_assignments!class_subject_id(
          teacher_id,
          teachers!teacher_id(first_name, last_name)
        )
      `)
      .eq('school_id', schoolId)
      .eq('class_id', selectedClassId)
      .order('subjects(name)', { ascending: true })

    classSubjects = (data ?? []) as unknown as ClassSubjectRow[]
  }

  const errorMsg = searchParams.error ? (ERROR_MSG[searchParams.error] ?? 'Erreur inconnue.') : null

  // Subjects not yet assigned to the selected class
  const assignedSubjectIds = new Set(classSubjects.map((cs) => cs.subject_id))
  const availableSubjects = subjects.filter((s) => !assignedSubjectIds.has(s.id))

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Attributions classes</h1>
        <p className="text-primary-300 text-sm mt-0.5">Assigner matières et enseignants aux classes</p>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* ── Class selector ───────────────────────────────────────────────────── */}
      {classes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune classe</p>
          <p className="mt-1 text-sm text-gray-500">Créez des classes avant d&apos;assigner des matières.</p>
          <a href="/school/classes" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
            Gérer les classes
          </a>
        </div>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="class_id" className="block text-xs font-medium text-gray-600 mb-1">Classe</label>
              <select
                id="class_id"
                name="class_id"
                defaultValue={selectedClassId ?? ''}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.level ? ` (${c.level})` : ''} — {c.academic_years.name}
                  </option>
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

          {selectedClass && (
            <>
              {/* ── Assign subject form ────────────────────────────────────── */}
              {subjects.length === 0 ? (
                <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-gray-500">
                  Aucune matière dans le catalogue.{' '}
                  <a href="/school/academics/subjects/new" className="text-primary-600 hover:underline">Créer une matière</a>
                </div>
              ) : availableSubjects.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Toutes les matières sont déjà assignées à cette classe.
                </div>
              ) : (
                <div className="rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-800 mb-3">Ajouter une matière à la classe</h2>
                  <form action={assignSubjectToClass} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="class_id" value={selectedClass.id} />
                    <div className="flex-1 min-w-[200px]">
                      <label htmlFor="subject_id" className="block text-xs font-medium text-gray-600 mb-1">Matière</label>
                      <select
                        id="subject_id"
                        name="subject_id"
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                      >
                        {availableSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.code ? ` (${s.code})` : ''}{s.coefficient != null ? ` · coeff. ${s.coefficient}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors shadow-sm"
                    >
                      Assigner
                    </button>
                  </form>
                </div>
              )}

              {/* ── Class subjects table ───────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-gray-800">
                    {selectedClass.name}
                    {selectedClass.level ? ` — ${selectedClass.level}` : ''}
                    <span className="ml-2 text-sm font-normal text-gray-400">{selectedClass.academic_years.name}</span>
                  </h2>
                  <span className="text-sm text-gray-400">
                    {classSubjects.length} matière{classSubjects.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {classSubjects.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
                    <p className="text-sm text-gray-500">Aucune matière assignée à cette classe.</p>
                    <p className="mt-1 text-xs text-gray-400">Utilisez le formulaire ci-dessus pour en ajouter.</p>

                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-sand-200 bg-primary-800 text-left">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Matière</th>
                          <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Coeff.</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Enseignant</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {classSubjects.map((cs, idx) => {
                          const assignment = cs.teacher_subject_assignments[0] ?? null
                          const teacher = assignment
                            ? (assignment.teachers as unknown as { first_name: string; last_name: string })
                            : null
                          return (
                            <tr
                              key={cs.id}
                              className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                            >
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{cs.subjects.name}</p>
                                {cs.subjects.code && (
                                  <p className="text-xs font-mono text-gray-400">{cs.subjects.code}</p>
                                )}
                              </td>
                              <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-500">
                                {cs.subjects.coefficient != null ? cs.subjects.coefficient : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <form action={assignTeacher} className="flex items-center gap-2">
                                  <input type="hidden" name="class_subject_id" value={cs.id} />
                                  <select
                                    name="teacher_id"
                                    defaultValue={assignment?.teacher_id ?? ''}
                                    className="block rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                                  >
                                    <option value="">— Aucun —</option>
                                    {teachers.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.last_name} {t.first_name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="submit"
                                    className="rounded px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-800 hover:bg-primary-50 transition-colors"
                                  >
                                    {teacher ? 'Modifier' : 'Assigner'}
                                  </button>
                                </form>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <form action={removeSubjectFromClass}>
                                  <input type="hidden" name="class_subject_id" value={cs.id} />
                                  <button
                                    type="submit"
                                    className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline"
                                  >
                                    Retirer
                                  </button>
                                </form>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

    </div>
  )
}
