import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { setTeacherStatus } from '../actions'

// Feedback for failures redirected from setTeacherStatus.
const ERROR_MESSAGES: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  status:   'Le statut n’a pas pu être mis à jour. Veuillez réessayer.',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-SN', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Teacher = {
  id:              string
  employee_number: string
  first_name:      string
  last_name:       string
  phone:           string | null
  email:           string | null
  status:          string
  profile_id:      string | null
  created_at:      string
  updated_at:      string
}

type Assignment = {
  id: string
  class_subjects: {
    id: string
    classes:        { id: string; name: string; level: string | null } | null
    subjects:       { id: string; name: string; code: string | null } | null
    academic_years: { id: string; name: string; is_active: boolean } | null
  } | null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params: { teacherId: string }
  searchParams: { error?: string }
}

export default async function TeacherDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminMembership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!adminMembership) redirect('/school')
  const schoolId = (adminMembership as { school_id: string }).school_id

  // Fetch teacher — must belong to this school
  const { data: teacherData } = await supabase
    .from('teachers')
    .select('id, employee_number, first_name, last_name, phone, email, status, profile_id, created_at, updated_at')
    .eq('id', params.teacherId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!teacherData) notFound()
  const teacher = teacherData as Teacher

  // Fetch linked user profile (if profile_id is set)
  let linkedProfile: { full_name: string | null; email: string | null } | null = null
  if (teacher.profile_id) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', teacher.profile_id)
      .maybeSingle()
    linkedProfile = (profileData as { full_name: string | null; email: string | null } | null)
  }

  // Fetch assignments with class + subject + academic year
  const { data: assignmentsData } = await supabase
    .from('teacher_subject_assignments')
    .select(`
      id,
      class_subjects (
        id,
        classes ( id, name, level ),
        subjects ( id, name, code ),
        academic_years ( id, name, is_active )
      )
    `)
    .eq('teacher_id', teacher.id)
    .eq('school_id', schoolId)

  const assignments = (assignmentsData ?? []) as unknown as Assignment[]

  // Group assignments by academic year — active year first
  const yearMap = new Map<string, { yearName: string; isActive: boolean; items: Assignment[] }>()
  for (const a of assignments) {
    const ay = a.class_subjects?.academic_years
    if (!ay) continue
    if (!yearMap.has(ay.id)) {
      yearMap.set(ay.id, { yearName: ay.name, isActive: ay.is_active, items: [] })
    }
    yearMap.get(ay.id)!.items.push(a)
  }
  const yearGroups = Array.from(yearMap.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.yearName.localeCompare(b.yearName)
  })

  const isActive  = teacher.status === 'active'
  const newStatus = isActive ? 'inactive' : 'active'
  const displayName = `${teacher.last_name} ${teacher.first_name}`
  const initials = [teacher.first_name[0], teacher.last_name[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase()
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/teachers" className="text-primary-300 hover:text-white text-sm">
            ← Enseignants
          </a>
        </div>
        <div className="flex items-start gap-4 mt-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold text-white">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{displayName}</h1>
            <p className="text-primary-300 text-sm mt-0.5 font-mono">{teacher.employee_number}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isActive ? 'bg-emerald-500/20 text-emerald-100' : 'bg-red-500/20 text-red-200'}`}>
                {isActive ? '● Actif' : '● Inactif'}
              </span>
              {teacher.profile_id && (
                <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-semibold text-sky-100">
                  Compte lié
                </span>
              )}
            </div>
          </div>
          <a
            href={`/school/teachers/${teacher.id}/edit`}
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
          >
            Modifier
          </a>
        </div>
      </div>

      {/* ── Error feedback (from setTeacherStatus) ──────────────────────────── */}
      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* ── Info strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Statut</p>
          <p className={`text-sm font-semibold mt-1 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
            {isActive ? 'Actif' : 'Inactif'}
          </p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Enregistré le</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(teacher.created_at)}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Identifiant</p>
          <p className="text-xs font-mono text-gray-500 mt-1 break-all">{teacher.id}</p>
        </div>
      </div>

      {/* ── Contact ─────────────────────────────────────────────────────────── */}
      {(teacher.phone || teacher.email) && (
        <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Contact</p>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            {teacher.phone && (
              <a
                href={`tel:${teacher.phone}`}
                className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {teacher.phone}
              </a>
            )}
            {teacher.email && (
              <a
                href={`mailto:${teacher.email}`}
                className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                {teacher.email}
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Compte portal ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Compte portail</p>
        </div>
        <div className="px-5 py-4">
          {teacher.profile_id && linkedProfile ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{linkedProfile.full_name ?? '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{linkedProfile.email ?? '—'}</p>
                <p className="text-xs text-emerald-600 mt-1">Accès au portail enseignant actif</p>
              </div>
              <a
                href={`/school/users/${teacher.profile_id}`}
                className="shrink-0 rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-600 hover:bg-primary-50 transition-colors"
              >
                Gérer le compte →
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Aucun compte portail lié.</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  L&apos;enseignant n&apos;a pas accès au portail enseignant.
                </p>
              </div>
              <a
                href={`/school/users/new?role=teacher`}
                className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                Créer un compte →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Affectations ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Registre des affectations
          </p>
          <p className="text-xs text-gray-400">{assignments.length} matière{assignments.length !== 1 ? 's' : ''}</p>
        </div>

        {yearGroups.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-gray-500">Aucune affectation en cours.</p>
            <p className="text-xs text-gray-400 mt-1">
              Les affectations sont gérées dans{' '}
              <a href="/school/academics/assignments" className="underline hover:text-primary-600">
                Académique → Affectations
              </a>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-sand-100">
            {yearGroups.map((group) => (
              <div key={group.yearName}>
                <div className="flex items-center gap-2 px-5 py-2 bg-sand-50/60">
                  <p className="text-xs font-semibold text-gray-600">{group.yearName}</p>
                  {group.isActive && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      En cours
                    </span>
                  )}
                </div>
                <div className="divide-y divide-sand-50">
                  {group.items.map((a) => {
                    const cls = a.class_subjects?.classes
                    const sub = a.class_subjects?.subjects
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-bold text-primary-600">
                          {sub?.code?.slice(0, 3) ?? sub?.name?.slice(0, 2).toUpperCase() ?? '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {sub?.name ?? '—'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {cls ? `${cls.name}${cls.level ? ` · ${cls.level}` : ''}` : '—'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Gestion du dossier ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-red-100 bg-red-50 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-red-500">
            Gestion du dossier
          </p>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isActive ? 'Désactiver l\'enseignant' : 'Réactiver l\'enseignant'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isActive
                ? 'Le dossier est conservé, mais l\'enseignant n\'apparaît plus dans les listes actives.'
                : 'Le dossier sera de nouveau visible et actif dans l\'établissement.'}
            </p>
          </div>
          <form action={setTeacherStatus}>
            <input type="hidden" name="teacher_id" value={teacher.id} />
            <input type="hidden" name="new_status"  value={newStatus} />
            <button
              type="submit"
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {isActive ? 'Désactiver' : 'Réactiver'}
            </button>
          </form>
        </div>
      </div>

    </div>
  )
}
