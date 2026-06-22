import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { assignTeacher } from '../../actions'

const MATRIX_PATH = '/school/academics/assignments/matrix'

const ERROR_MSG: Record<string, string> = {
  invalid:  'Données invalides. Vérifiez votre sélection.',
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  server:   'Erreur serveur. Réessayez.',
}

type Props = { searchParams: { year?: string; error?: string } }

export default async function AssignmentMatrixPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const [yearsRes, teachersRes] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active').eq('school_id', schoolId).order('starts_on', { ascending: false }),
    supabase.from('teachers').select('id, first_name, last_name').eq('school_id', schoolId).eq('status', 'active').order('last_name'),
  ])
  type YearRow    = { id: string; name: string; is_active: boolean }
  type TeacherRow = { id: string; first_name: string; last_name: string }
  const years    = (yearsRes.data ?? []) as YearRow[]
  const teachers = (teachersRes.data ?? []) as TeacherRow[]

  const yearIds = new Set(years.map((y) => y.id))
  const selectedYear =
    (searchParams.year && yearIds.has(searchParams.year)) ? searchParams.year
    : (years.find((y) => y.is_active)?.id ?? years[0]?.id ?? '')

  const errorMsg = searchParams.error ? (ERROR_MSG[searchParams.error] ?? 'Erreur inconnue.') : null

  // Classes for the year + their class-subjects (with the assigned teacher).
  type ClassRow = { id: string; name: string; level: string | null; section: string | null }
  type CsRow = {
    id: string
    class_id: string
    subjects: { name: string; code: string | null; coefficient: number | null } | null
    teacher_subject_assignments: Array<{ teacher_id: string }>
  }
  let classes: ClassRow[] = []
  let classSubjects: CsRow[] = []
  if (selectedYear) {
    const [clsRes, csRes] = await Promise.all([
      supabase.from('classes').select('id, name, level, section').eq('school_id', schoolId).eq('academic_year_id', selectedYear).order('name'),
      supabase
        .from('class_subjects')
        .select('id, class_id, subjects!subject_id(name, code, coefficient), teacher_subject_assignments!class_subject_id(teacher_id)')
        .eq('school_id', schoolId)
        .eq('academic_year_id', selectedYear),
    ])
    classes = (clsRes.data ?? []) as ClassRow[]
    classSubjects = (csRes.data ?? []) as unknown as CsRow[]
  }

  // Group class-subjects by class, ordered by subject name.
  const byClass = new Map<string, CsRow[]>()
  for (const cs of classSubjects) {
    if (!byClass.has(cs.class_id)) byClass.set(cs.class_id, [])
    byClass.get(cs.class_id)!.push(cs)
  }
  for (const list of Array.from(byClass.values())) {
    list.sort((a, b) => (a.subjects?.name ?? '').localeCompare(b.subjects?.name ?? ''))
  }

  const total    = classSubjects.length
  const assigned = classSubjects.filter((cs) => (cs.teacher_subject_assignments?.length ?? 0) > 0).length
  const coverage = total > 0 ? Math.round((assigned / total) * 100) : null

  const classLabel = (c: ClassRow) => [c.name, c.section ?? c.level].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/assignments" className="text-primary-300 hover:text-white text-sm">← Attributions</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Matrice des attributions</h1>
        <p className="text-primary-300 text-sm mt-0.5">Qui enseigne quoi — par classe et matière, sur l&apos;année</p>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      )}

      {/* Year filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div className="min-w-[200px]">
          <label htmlFor="year" className="block text-xs font-medium text-gray-600 mb-1">Année scolaire</label>
          <select id="year" name="year" defaultValue={selectedYear} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_active ? ' (active)' : ''}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Afficher</button>
      </form>

      {years.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune année scolaire</p>
          <p className="mt-1 text-sm text-gray-400">Créez une année scolaire et des classes pour gérer les attributions.</p>
        </div>
      ) : (
        <>
          {/* Coverage strip */}
          <div className="overflow-hidden rounded-xl grid grid-cols-3 shadow-sm">
            <div className="bg-primary-600 px-5 py-4 text-center">
              <p className="text-2xl font-bold text-white">{assigned}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Assignées</p>
            </div>
            <div className={`px-5 py-4 text-center ${total - assigned > 0 ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <p className="text-2xl font-bold text-white">{total - assigned}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/80 mt-0.5">Sans enseignant</p>
            </div>
            <div className="bg-primary-700 px-5 py-4 text-center">
              <p className="text-2xl font-bold text-white">{coverage !== null ? `${coverage}%` : '—'}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Couverture</p>
            </div>
          </div>

          {classes.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
              <p className="text-sm text-gray-500">Aucune classe pour cette année.</p>
            </div>
          ) : (
            classes.map((c) => {
              const rows = byClass.get(c.id) ?? []
              return (
                <section key={c.id} className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-sand-100 bg-sand-50 px-5 py-3">
                    <h2 className="text-sm font-bold text-primary-800">{classLabel(c)}</h2>
                    <span className="text-xs text-gray-400">{rows.length} matière{rows.length !== 1 ? 's' : ''}</span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-5 py-4 text-center text-sm text-gray-400">
                      Aucune matière assignée.{' '}
                      <a href={`/school/academics/assignments?class_id=${c.id}`} className="text-primary-600 hover:underline">Ajouter des matières →</a>
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {rows.map((cs, idx) => {
                          const tsa = cs.teacher_subject_assignments
                          const current = (Array.isArray(tsa) ? tsa[0] : tsa)?.teacher_id ?? ''
                          return (
                            <tr key={cs.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                              <td className="px-4 py-2.5">
                                <span className="font-medium text-gray-900">{cs.subjects?.name ?? '—'}</span>
                                {cs.subjects?.coefficient != null && <span className="ml-2 text-xs text-gray-400">coeff. {cs.subjects.coefficient}</span>}
                                {!current && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Non assigné</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <form action={assignTeacher} className="flex items-center justify-end gap-2">
                                  <input type="hidden" name="class_subject_id" value={cs.id} />
                                  <input type="hidden" name="redirect_to" value={MATRIX_PATH} />
                                  <input type="hidden" name="year" value={selectedYear} />
                                  <select
                                    name="teacher_id"
                                    defaultValue={current}
                                    aria-label={`Enseignant pour ${cs.subjects?.name ?? 'la matière'} en ${classLabel(c)}`}
                                    className="block rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                                  >
                                    <option value="">— Aucun —</option>
                                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.last_name} {t.first_name}</option>)}
                                  </select>
                                  <button type="submit" className="rounded px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 hover:text-primary-800 transition-colors">
                                    Enregistrer
                                  </button>
                                </form>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
