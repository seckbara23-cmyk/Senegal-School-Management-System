import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import {
  setMembershipStatus,
  linkEntityToUser,
  unlinkEntityFromUser,
} from '../actions'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-SN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtLogin(iso: string | null | undefined) {
  if (!iso) return 'Jamais connecté'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ROLE_LABEL: Record<string, string> = {
  school_admin:    'Administrateur',
  teacher:         'Enseignant',
  finance_officer: 'Agent financier',
  parent:          'Parent',
  student:         'Élève',
}

const ROLE_COLOR: Record<string, string> = {
  school_admin:    'bg-primary-100 text-primary-700',
  teacher:         'bg-emerald-100 text-emerald-700',
  finance_officer: 'bg-amber-100 text-amber-700',
  parent:          'bg-sky-100 text-sky-700',
  student:         'bg-gray-100 text-gray-600',
}

const ENTITY_LABEL: Record<string, string> = {
  teacher: 'Dossier enseignant',
  parent:  'Dossier parent',
  student: 'Dossier élève',
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Membership = {
  role:       string
  status:     string
  created_at: string
}

type LinkedEntity = {
  id:         string
  first_name: string
  last_name:  string
  profile_id: string | null
}

type UnlinkedEntity = {
  id:               string
  first_name:       string
  last_name:        string
  admission_number?: string
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Props = {
  params:      { userId: string }
  searchParams: { error?: string }
}

export default async function SchoolUserDetailPage({ params, searchParams }: Props) {
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

  // Verify the target user is in this school
  const { data: memberData } = await supabase
    .from('school_memberships')
    .select('role, status, created_at')
    .eq('user_id', params.userId)
    .eq('school_id', schoolId)

  if (!memberData || memberData.length === 0) notFound()
  const memberships = memberData as Membership[]

  // Fetch profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('id', params.userId)
    .maybeSingle()

  type Profile = { id: string; full_name: string | null; email: string | null; created_at: string }
  const profile = profileData as Profile | null

  // Fetch last_sign_in_at via admin API (service role bypasses auth schema restriction)
  const adminClient = createAdminClient()
  const { data: authUserData } = await adminClient.auth.admin.getUserById(params.userId)
  const lastSignIn = authUserData?.user?.last_sign_in_at ?? null

  // Fetch linked entities (teacher / parent / student)
  const [tRes, pRes, sRes] = await Promise.all([
    supabase.from('teachers').select('id, first_name, last_name, profile_id').eq('profile_id', params.userId).eq('school_id', schoolId).maybeSingle(),
    supabase.from('parents').select('id, first_name, last_name, profile_id').eq('profile_id', params.userId).eq('school_id', schoolId).maybeSingle(),
    supabase.from('students').select('id, first_name, last_name, profile_id').eq('profile_id', params.userId).eq('school_id', schoolId).maybeSingle(),
  ])
  const linkedTeacher = tRes.data as LinkedEntity | null
  const linkedParent  = pRes.data as LinkedEntity | null
  const linkedStudent = sRes.data as LinkedEntity | null

  // Determine roles that need entity linking
  const roles = memberships.map((m) => m.role)
  const isActive = memberships.some((m) => m.status === 'active')
  const newStatus = isActive ? 'inactive' : 'active'
  const createdAt = memberships.reduce((earliest, m) =>
    m.created_at < earliest ? m.created_at : earliest, memberships[0].created_at)

  // For unlinked entity pickers — fetch only what's relevant to this user's roles
  let unlinkedTeachers: UnlinkedEntity[] = []
  let unlinkedParents:  UnlinkedEntity[] = []
  let unlinkedStudents: UnlinkedEntity[] = []

  if (roles.includes('teacher') && !linkedTeacher) {
    const { data } = await supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('school_id', schoolId)
      .is('profile_id', null)
      .eq('status', 'active')
      .order('last_name', { ascending: true })
    unlinkedTeachers = (data ?? []) as UnlinkedEntity[]
  }
  if (roles.includes('parent') && !linkedParent) {
    const { data } = await supabase
      .from('parents')
      .select('id, first_name, last_name')
      .eq('school_id', schoolId)
      .is('profile_id', null)
      .eq('status', 'active')
      .order('last_name', { ascending: true })
    unlinkedParents = (data ?? []) as UnlinkedEntity[]
  }
  if (roles.includes('student') && !linkedStudent) {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, admission_number')
      .eq('school_id', schoolId)
      .is('profile_id', null)
      .eq('status', 'active')
      .order('last_name', { ascending: true })
    unlinkedStudents = (data ?? []) as UnlinkedEntity[]
  }

  const displayName = profile?.full_name ?? profile?.email ?? 'Utilisateur inconnu'
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/users" className="text-primary-300 hover:text-white text-sm">
            ← Comptes utilisateurs
          </a>
        </div>
        <div className="flex items-start gap-4 mt-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold text-white">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{displayName}</h1>
            <p className="text-primary-300 text-sm mt-0.5 truncate">{profile?.email ?? '—'}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {memberships.map((m) => (
                <span key={m.role} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLOR[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              ))}
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isActive ? 'bg-emerald-500/20 text-emerald-100' : 'bg-red-500/20 text-red-200'}`}>
                {isActive ? '● Actif' : '● Inactif'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {searchParams.error === 'entity' && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Ce dossier n&apos;est pas disponible ou est déjà lié à un autre compte.
        </div>
      )}

      {/* ── Info strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Créé le</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(createdAt)}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Dernière connexion</p>
          <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{fmtLogin(lastSignIn)}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-4 py-4 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Identifiant</p>
          <p className="text-xs font-mono text-gray-500 mt-1 break-all">{params.userId}</p>
        </div>
      </div>

      {/* ── Linked entities ──────────────────────────────────────────────────── */}
      {(roles.includes('teacher') || roles.includes('parent') || roles.includes('student')) && (
        <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Dossiers liés
            </p>
          </div>
          <div className="divide-y divide-sand-100">

            {/* Teacher */}
            {roles.includes('teacher') && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {ENTITY_LABEL.teacher}
                </p>
                {linkedTeacher ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {linkedTeacher.last_name} {linkedTeacher.first_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Accès au portail enseignant actif</p>
                    </div>
                    <form action={unlinkEntityFromUser}>
                      <input type="hidden" name="user_id" value={params.userId} />
                      <input type="hidden" name="role"    value="teacher" />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Délier
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Aucun dossier lié — le portail enseignant est inaccessible.</p>
                    {unlinkedTeachers.length > 0 ? (
                      <form action={linkEntityToUser} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={params.userId} />
                        <input type="hidden" name="role"    value="teacher" />
                        <select
                          name="entity_id"
                          required
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                        >
                          <option value="">— Sélectionner un enseignant —</option>
                          {unlinkedTeachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.last_name} {t.first_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                        >
                          Lier
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Aucun dossier enseignant disponible à lier.{' '}
                        <a href="/school/teachers" className="underline hover:text-primary-600">Gérer les enseignants →</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Parent */}
            {roles.includes('parent') && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {ENTITY_LABEL.parent}
                </p>
                {linkedParent ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {linkedParent.last_name} {linkedParent.first_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Accès au portail parent actif</p>
                    </div>
                    <form action={unlinkEntityFromUser}>
                      <input type="hidden" name="user_id" value={params.userId} />
                      <input type="hidden" name="role"    value="parent" />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Délier
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Aucun dossier lié — le portail parent est inaccessible.</p>
                    {unlinkedParents.length > 0 ? (
                      <form action={linkEntityToUser} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={params.userId} />
                        <input type="hidden" name="role"    value="parent" />
                        <select
                          name="entity_id"
                          required
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                        >
                          <option value="">— Sélectionner un parent —</option>
                          {unlinkedParents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.last_name} {p.first_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                        >
                          Lier
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Aucun dossier parent disponible à lier.{' '}
                        <a href="/school/parents" className="underline hover:text-primary-600">Gérer les parents →</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Student */}
            {roles.includes('student') && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {ENTITY_LABEL.student}
                </p>
                {linkedStudent ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {linkedStudent.last_name} {linkedStudent.first_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Accès au portail élève actif</p>
                    </div>
                    <form action={unlinkEntityFromUser}>
                      <input type="hidden" name="user_id" value={params.userId} />
                      <input type="hidden" name="role"    value="student" />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Délier
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Aucun dossier lié — le portail élève est inaccessible.</p>
                    {unlinkedStudents.length > 0 ? (
                      <form action={linkEntityToUser} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={params.userId} />
                        <input type="hidden" name="role"    value="student" />
                        <select
                          name="entity_id"
                          required
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                        >
                          <option value="">— Sélectionner un élève —</option>
                          {unlinkedStudents.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.last_name} {s.first_name}{s.admission_number ? ` (${s.admission_number})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                        >
                          Lier
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Aucun dossier élève disponible à lier.{' '}
                        <a href="/school/students" className="underline hover:text-primary-600">Gérer les élèves →</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Danger zone ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-red-100 bg-red-50 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-red-500">
            Gestion du compte
          </p>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isActive ? 'Désactiver le compte' : 'Réactiver le compte'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isActive
                ? 'L\'utilisateur ne pourra plus se connecter, mais ses données sont conservées.'
                : 'L\'utilisateur pourra de nouveau accéder à son portail.'}
            </p>
          </div>
          <form action={setMembershipStatus}>
            <input type="hidden" name="user_id"    value={params.userId} />
            <input type="hidden" name="new_status" value={newStatus} />
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
