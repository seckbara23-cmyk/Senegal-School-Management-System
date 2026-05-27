import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { CreateUserForm, type EntityOption } from '../_form'

const ROLE_LABELS: Record<string, string> = {
  school_admin:    'Administrateur',
  teacher:         'Enseignant',
  finance_officer: 'Agent financier',
  parent:          'Parent',
  student:         'Élève',
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  school_admin:    'Accès complet à l\'administration scolaire',
  teacher:         'Saisie des présences, notes et évaluations',
  finance_officer: 'Gestion des frais, factures et paiements',
  parent:          'Consultation du suivi de son/ses enfant(s)',
  student:         'Consultation des notes, présences et bulletins',
}

const VALID_ROLES = ['school_admin', 'teacher', 'finance_officer', 'parent', 'student']

type Props = {
  searchParams: { role?: string | string[] }
}

export default async function NewSchoolUserPage({ searchParams }: Props) {
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

  const rawRole = Array.isArray(searchParams.role) ? searchParams.role[0] : searchParams.role
  const role = rawRole && VALID_ROLES.includes(rawRole) ? rawRole : null

  // ── Step 2: full form ──────────────────────────────────────────────────────
  if (role) {
    let entityOptions: EntityOption[] = []

    if (role === 'teacher') {
      const { data } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
        .eq('school_id', schoolId)
        .is('profile_id', null)
        .eq('status', 'active')
        .order('last_name', { ascending: true })

      entityOptions = ((data ?? []) as { id: string; first_name: string; last_name: string }[])
        .map((t) => ({ id: t.id, name: `${t.last_name} ${t.first_name}` }))
    } else if (role === 'parent') {
      const { data } = await supabase
        .from('parents')
        .select('id, first_name, last_name')
        .eq('school_id', schoolId)
        .is('profile_id', null)
        .eq('status', 'active')
        .order('last_name', { ascending: true })

      entityOptions = ((data ?? []) as { id: string; first_name: string; last_name: string }[])
        .map((p) => ({ id: p.id, name: `${p.last_name} ${p.first_name}` }))
    } else if (role === 'student') {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, admission_number')
        .eq('school_id', schoolId)
        .is('profile_id', null)
        .eq('status', 'active')
        .order('last_name', { ascending: true })

      entityOptions = ((data ?? []) as { id: string; first_name: string; last_name: string; admission_number: string }[])
        .map((s) => ({ id: s.id, name: `${s.last_name} ${s.first_name} (${s.admission_number})` }))
    }

    return (
      <div className="space-y-6 pb-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/school/users" className="text-primary-300 hover:text-white text-sm">
              ← Comptes utilisateurs
            </a>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Nouveau compte</h1>
          <p className="mt-0.5 text-sm text-primary-300">
            Création et provisionnement d&apos;un compte portail
          </p>
        </div>

        {/* ── Progress indicator ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-200 text-xs font-bold text-primary-700">✓</span>
            <span className="text-sm text-gray-500">Rôle</span>
          </div>
          <div className="flex-1 h-px bg-sand-300" />
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">2</span>
            <span className="text-sm font-semibold text-gray-900">Informations</span>
          </div>
        </div>

        {/* ── Form card ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
          <CreateUserForm role={role} entityOptions={entityOptions} />
        </div>

      </div>
    )
  }

  // ── Step 1: role selector ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/users" className="text-primary-300 hover:text-white text-sm">
            ← Comptes utilisateurs
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouveau compte</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Sélectionnez le rôle pour ce compte
        </p>
      </div>

      {/* ── Progress indicator ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">1</span>
          <span className="text-sm font-semibold text-gray-900">Rôle</span>
        </div>
        <div className="flex-1 h-px bg-sand-300" />
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sand-200 text-xs font-bold text-gray-400">2</span>
          <span className="text-sm text-gray-400">Informations</span>
        </div>
      </div>

      {/* ── Role picker card ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Quel rôle aura cet utilisateur ?</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Le rôle détermine les sections du portail auxquelles l&apos;utilisateur aura accès.
          </p>
        </div>
        <div className="divide-y divide-sand-100">
          {VALID_ROLES.map((r) => (
            <a
              key={r}
              href={`/school/users/new?role=${r}`}
              className="flex items-center gap-4 px-6 py-4 hover:bg-primary-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-700">
                  {ROLE_LABELS[r]}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {ROLE_DESCRIPTIONS[r]}
                </p>
              </div>
              <span className="text-gray-300 group-hover:text-primary-400 shrink-0">→</span>
            </a>
          ))}
        </div>
      </div>

    </div>
  )
}
