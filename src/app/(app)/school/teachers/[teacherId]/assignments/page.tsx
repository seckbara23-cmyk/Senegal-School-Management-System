import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { assignTeacherToClassSubject, removeTeacherAssignment } from '../../actions'

const ERROR_MSG: Record<string, string> = {
  readonly:  'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  inactive:  "Cet enseignant est inactif. Réactivez-le avant de l'affecter à une matière.",
  duplicate: 'Cette matière de classe est déjà affectée à un enseignant.',
  invalid:   'Données invalides. Vérifiez votre sélection.',
  server:    'Erreur serveur. Veuillez réessayer.',
}

type Props = {
  params: { teacherId: string }
  searchParams: { error?: string; created?: string; removed?: string }
}

type Teacher = {
  id: string; first_name: string; last_name: string; employee_number: string; status: string
}

type ClassSubjectRow = {
  id: string
  class_id: string
  subject_id: string
  classes: { name: string; level: string | null } | null
  subjects: { name: string; code: string | null } | null
  academic_years: { name: string; is_active: boolean } | null
  teacher_subject_assignments: { teacher_id: string }[]
}

function classLabel(r: ClassSubjectRow): string {
  return [r.classes?.name, r.classes?.level].filter(Boolean).join(' ') || '—'
}

export default async function TeacherAssignmentsPage({ params, searchParams }: Props) {
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

  // Teacher must belong to this school.
  const { data: teacherData } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, employee_number, status')
    .eq('id', params.teacherId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!teacherData) notFound()
  const teacher = teacherData as Teacher

  // Every class-subject in the school, with its (optional) teacher assignment.
  const { data: csData } = await supabase
    .from('class_subjects')
    .select(`
      id, class_id, subject_id,
      classes!class_id ( name, level ),
      subjects!subject_id ( name, code ),
      academic_years!academic_year_id ( name, is_active ),
      teacher_subject_assignments!class_subject_id ( teacher_id )
    `)
    .eq('school_id', schoolId)

  const rows = (csData ?? []) as unknown as ClassSubjectRow[]

  const current   = rows.filter((r) => r.teacher_subject_assignments[0]?.teacher_id === teacher.id)
  const available = rows.filter((r) => r.teacher_subject_assignments.length === 0)

  // Group current assignments by academic year (active first).
  const yearMap = new Map<string, { yearName: string; isActive: boolean; items: ClassSubjectRow[] }>()
  for (const r of current) {
    const key = r.academic_years?.name ?? '—'
    if (!yearMap.has(key)) yearMap.set(key, { yearName: key, isActive: r.academic_years?.is_active ?? false, items: [] })
    yearMap.get(key)!.items.push(r)
  }
  const currentGroups = Array.from(yearMap.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.yearName.localeCompare(b.yearName)
  })
  for (const g of currentGroups) {
    g.items.sort((a, b) => classLabel(a).localeCompare(classLabel(b)) || (a.subjects?.name ?? '').localeCompare(b.subjects?.name ?? ''))
  }

  // Group available class-subjects by class (active year first) for the <optgroup>.
  const classMap = new Map<string, { label: string; yearName: string; isActive: boolean; items: ClassSubjectRow[] }>()
  for (const r of available) {
    if (!classMap.has(r.class_id)) {
      classMap.set(r.class_id, {
        label: classLabel(r),
        yearName: r.academic_years?.name ?? '',
        isActive: r.academic_years?.is_active ?? false,
        items: [],
      })
    }
    classMap.get(r.class_id)!.items.push(r)
  }
  const availableGroups = Array.from(classMap.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.label.localeCompare(b.label)
  })
  for (const g of availableGroups) {
    g.items.sort((a, b) => (a.subjects?.name ?? '').localeCompare(b.subjects?.name ?? ''))
  }

  const errorMsg = searchParams.error ? (ERROR_MSG[searchParams.error] ?? 'Erreur inconnue.') : null
  const isActive = teacher.status === 'active'
  const displayName = `${teacher.last_name} ${teacher.first_name}`

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/teachers/${teacher.id}`} className="text-primary-300 hover:text-white text-sm">
            ← {displayName}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Affectations</h1>
        <p className="mt-0.5 text-sm text-primary-300 font-mono">{teacher.employee_number}</p>
      </div>

      {/* ── Feedback ────────────────────────────────────────────────────────── */}
      {errorMsg && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      {searchParams.created && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Affectation ajoutée.
        </div>
      )}
      {searchParams.removed && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Affectation retirée.
        </div>
      )}

      {!isActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Cet enseignant est inactif. Réactivez son dossier pour pouvoir lui affecter des matières.
        </div>
      )}

      {/* ── Assign form ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Ajouter une affectation</p>
        </div>
        <div className="px-5 py-4">
          {availableGroups.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune matière de classe disponible.{' '}
              <a href="/school/academics/assignments" className="text-primary-600 hover:underline">
                Créez des matières de classe
              </a>{' '}
              ou retirez une affectation existante d&apos;un autre enseignant.
            </p>
          ) : (
            <form action={assignTeacherToClassSubject} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="teacher_id" value={teacher.id} />
              <div className="flex-1 min-w-[240px]">
                <label htmlFor="class_subject_id" className="block text-xs font-medium text-gray-600 mb-1">
                  Classe &amp; matière
                </label>
                <select
                  id="class_subject_id"
                  name="class_subject_id"
                  disabled={!isActive}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 disabled:cursor-not-allowed disabled:bg-gray-50"
                >
                  {availableGroups.map((g, gi) => (
                    <optgroup key={gi} label={`${g.label}${g.yearName ? ` — ${g.yearName}` : ''}`}>
                      {g.items.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.subjects?.name ?? '—'}{r.subjects?.code ? ` (${r.subjects.code})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={!isActive}
                className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Affecter
              </button>
            </form>
          )}
          <p className="mt-3 text-xs text-gray-400">
            Seules les matières de classe non encore affectées apparaissent. Les matières de classe se créent dans{' '}
            <a href="/school/academics/assignments" className="underline hover:text-primary-600">Académique → Attributions</a>.
          </p>
        </div>
      </div>

      {/* ── Current assignments ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Matières affectées</p>
          <p className="text-xs text-gray-400">{current.length} matière{current.length !== 1 ? 's' : ''}</p>
        </div>

        {currentGroups.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-500">Aucune affectation pour le moment.</p>
            <p className="text-xs text-gray-400 mt-1">Utilisez le formulaire ci-dessus pour affecter une matière de classe.</p>
          </div>
        ) : (
          <div className="divide-y divide-sand-100">
            {currentGroups.map((group) => (
              <div key={group.yearName}>
                <div className="flex items-center gap-2 px-5 py-2 bg-sand-50/60">
                  <p className="text-xs font-semibold text-gray-600">{group.yearName}</p>
                  {group.isActive && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">En cours</span>
                  )}
                </div>
                <div className="divide-y divide-sand-50">
                  {group.items.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-bold text-primary-600">
                        {r.subjects?.code?.slice(0, 3) ?? r.subjects?.name?.slice(0, 2).toUpperCase() ?? '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.subjects?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{classLabel(r)}</p>
                      </div>
                      <form action={removeTeacherAssignment}>
                        <input type="hidden" name="teacher_id" value={teacher.id} />
                        <input type="hidden" name="class_subject_id" value={r.id} />
                        <button type="submit" className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline">
                          Retirer
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
