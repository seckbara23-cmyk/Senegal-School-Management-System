import { createClient }      from '@/lib/supabase/server'
import { redirect }          from 'next/navigation'

// ─── Display helpers ───────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtLogin(iso: string | null | undefined) {
  if (!iso) return 'Jamais'
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffH  = Math.floor(diffMs / 3_600_000)
  if (diffH <  1)  return 'Il y a quelques min.'
  if (diffH < 24)  return `Il y a ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Hier'
  if (diffD <  7)  return `Il y a ${diffD} j`
  return d.toLocaleDateString('fr-SN', { day: 'numeric', month: 'short' })
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

// ─── Types ─────────────────────────────────────────────────────────────────────

type MembershipRow = {
  user_id:    string
  role:       string
  status:     string
  created_at: string
}

type ProfileRow = {
  id:        string
  full_name: string | null
  email:     string | null
}

type EntityRow = {
  profile_id: string | null
  first_name: string
  last_name:  string
}

type LastLoginRow = {
  user_id:         string
  last_sign_in_at: string | null
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function SchoolUsersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminMembership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!adminMembership) redirect('/school')
  const schoolId = (adminMembership as { school_id: string }).school_id

  // Fetch all memberships for this school
  const { data: memberData } = await supabase
    .from('school_memberships')
    .select('user_id, role, status, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  const memberRows = (memberData ?? []) as MembershipRow[]

  // Deduplicate by user_id — aggregate roles per user
  const userMap = new Map<string, {
    userId:    string
    roles:     string[]
    statuses:  string[]
    createdAt: string
  }>()
  for (const row of memberRows) {
    const existing = userMap.get(row.user_id)
    if (existing) {
      existing.roles.push(row.role)
      existing.statuses.push(row.status)
    } else {
      userMap.set(row.user_id, {
        userId:    row.user_id,
        roles:     [row.role],
        statuses:  [row.status],
        createdAt: row.created_at,
      })
    }
  }

  const userIds = Array.from(userMap.keys())

  // Fetch profiles (requires migration 023 RLS policy)
  let profileMap = new Map<string, ProfileRow>()
  if (userIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    for (const p of (profileData ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p)
    }
  }

  // Fetch last login times via SECURITY DEFINER RPC (migration 023)
  let lastLoginMap = new Map<string, string | null>()
  const { data: loginData } = await supabase.rpc('get_school_member_last_logins', {
    p_school_id: schoolId,
  })
  for (const row of (loginData ?? []) as LastLoginRow[]) {
    lastLoginMap.set(row.user_id, row.last_sign_in_at)
  }

  // Fetch linked entities (teachers / parents / students with profile_id in userIds)
  let entityMap = new Map<string, { name: string; type: string }>()
  if (userIds.length > 0) {
    const [tRes, pRes, sRes] = await Promise.all([
      supabase.from('teachers').select('profile_id, first_name, last_name').eq('school_id', schoolId).not('profile_id', 'is', null),
      supabase.from('parents').select('profile_id, first_name, last_name').eq('school_id', schoolId).not('profile_id', 'is', null),
      supabase.from('students').select('profile_id, first_name, last_name').eq('school_id', schoolId).not('profile_id', 'is', null),
    ])
    for (const t of (tRes.data ?? []) as EntityRow[]) {
      if (t.profile_id) entityMap.set(t.profile_id, { name: `${t.last_name} ${t.first_name}`, type: 'teacher' })
    }
    for (const p of (pRes.data ?? []) as EntityRow[]) {
      if (p.profile_id) entityMap.set(p.profile_id, { name: `${p.last_name} ${p.first_name}`, type: 'parent' })
    }
    for (const s of (sRes.data ?? []) as EntityRow[]) {
      if (s.profile_id) entityMap.set(s.profile_id, { name: `${s.last_name} ${s.first_name}`, type: 'student' })
    }
  }

  const users = Array.from(userMap.values())
  const totalUsers = users.length

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Comptes utilisateurs</h1>
            <p className="mt-0.5 text-sm text-primary-300">
              {totalUsers} compte{totalUsers !== 1 ? 's' : ''} dans cet établissement
            </p>
          </div>
          <a
            href="/school/users/new"
            className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
          >
            + Nouveau compte
          </a>
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {users.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun compte créé</p>
          <p className="mt-1 text-sm text-gray-400">Créez des comptes pour les enseignants, parents et élèves.</p>
          <a
            href="/school/users/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            + Nouveau compte
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Registre des comptes
            </p>
            <p className="text-xs text-gray-400">{totalUsers} compte{totalUsers !== 1 ? 's' : ''}</p>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Utilisateur</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Rôle(s)</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Dossier lié</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Dernière connexion</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Créé le</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {users.map((u) => {
                  const profile   = profileMap.get(u.userId)
                  const entity    = entityMap.get(u.userId)
                  const lastLogin = lastLoginMap.get(u.userId)
                  const isActive  = u.statuses.some((s) => s === 'active')

                  return (
                    <tr key={u.userId} className="odd:bg-white even:bg-sand-50 hover:bg-primary-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-gray-900">{profile?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{profile?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <span key={r} className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[r] ?? 'bg-gray-100 text-gray-600'}`}>
                              {ROLE_LABEL[r] ?? r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {entity ? (
                          <span className="text-sm text-gray-700">{entity.name}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {isActive ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                        {fmtLogin(lastLogin)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {fmtDate(u.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <a
                          href={`/school/users/${u.userId}`}
                          className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
                        >
                          Gérer →
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-sand-100 sm:hidden">
            {users.map((u) => {
              const profile   = profileMap.get(u.userId)
              const entity    = entityMap.get(u.userId)
              const lastLogin = lastLoginMap.get(u.userId)
              const isActive  = u.statuses.some((s) => s === 'active')

              return (
                <a
                  key={u.userId}
                  href={`/school/users/${u.userId}`}
                  className="flex items-start gap-3 px-4 py-4 hover:bg-primary-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                    {(profile?.full_name ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{profile?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{profile?.email ?? '—'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {u.roles.map((r) => (
                        <span key={r} className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[r] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    {entity && (
                      <p className="text-xs text-gray-400 mt-1">{entity.name}</p>
                    )}
                  </div>
                  <span className="text-gray-300 shrink-0 mt-1">→</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
