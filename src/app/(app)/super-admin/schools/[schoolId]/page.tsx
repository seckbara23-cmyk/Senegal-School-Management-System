import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { SchoolLifecycle } from './_lifecycle'
import { SchoolAdmins, type AdminView } from './_admins'

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive:  'bg-gray-100 text-gray-600 border-gray-200',
  suspended: 'bg-amber-50 text-amber-700 border-amber-200',
  archived:  'bg-gray-100 text-gray-500 border-gray-200',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', inactive: 'Inactive', suspended: 'Suspendue', archived: 'Archivée',
}

const ERROR_MESSAGES: Record<string, string> = {
  last_admin: "Impossible : une école doit conserver au moins un administrateur actif.",
  status:     "Erreur lors de la mise à jour du statut. Veuillez réessayer.",
  remove:     "Erreur lors du retrait de l'administrateur. Veuillez réessayer.",
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Jamais'
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 sm:col-span-2 sm:mt-0 text-sm ${mono ? 'font-mono' : ''} ${value ? 'text-gray-900' : 'italic text-gray-400'}`}>
        {value || 'Non renseigné'}
      </dd>
    </div>
  )
}

type Props = {
  params: { schoolId: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function SuperAdminSchoolDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  const errorKey = typeof searchParams.error === 'string' ? searchParams.error : ''
  const errorMessage = ERROR_MESSAGES[errorKey] ?? ''

  const { data: schoolData } = await supabase
    .from('schools')
    .select('id, name, slug, address, phone, email, subscription_status, created_at')
    .eq('id', params.schoolId)
    .maybeSingle()

  if (!schoolData) notFound()

  type SchoolRow = {
    id: string; name: string; slug: string; address: string | null; phone: string | null
    email: string | null; subscription_status: string; created_at: string
  }
  const school = schoolData as SchoolRow

  // Tenant snapshot: admins + headline counts (all scoped to this school)
  const [adminRes, studentCountRes, teacherCountRes] = await Promise.all([
    supabase
      .from('school_memberships')
      .select('user_id, status, profiles!user_id(email, full_name)')
      .eq('school_id', school.id)
      .eq('role', 'school_admin'),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', school.id),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', school.id),
  ])

  type AdminRow = { user_id: string; status: string; profiles: { email: string | null; full_name: string | null } | null }
  const admins = (adminRes.data ?? []) as unknown as AdminRow[]
  const studentCount = studentCountRes.count ?? 0
  const teacherCount = teacherCountRes.count ?? 0

  // Enrich each admin with last sign-in time via the Admin API (best-effort).
  const adminClient = createAdminClient()
  const adminViews: AdminView[] = await Promise.all(
    admins.map(async (a): Promise<AdminView> => {
      let lastLogin = '—'
      try {
        const { data } = await adminClient.auth.admin.getUserById(a.user_id)
        lastLogin = fmtDateTime(data.user?.last_sign_in_at)
      } catch {
        // best-effort: leave as '—'
      }
      return {
        userId:    a.user_id,
        fullName:  a.profiles?.full_name ?? null,
        email:     a.profiles?.email ?? null,
        status:    a.status,
        lastLogin,
      }
    })
  )

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <nav className="text-sm text-gray-500">
        <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
        <span className="mx-2">/</span>
        <Link href="/super-admin/schools" className="hover:text-indigo-600 hover:underline">Écoles</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">{school.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{school.name}</h1>
          <p className="mt-0.5 font-mono text-sm text-gray-500">{school.slug}</p>
        </div>
        <span className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_BADGE[school.subscription_status] ?? STATUS_BADGE.inactive}`}>
          {STATUS_LABEL[school.subscription_status] ?? school.subscription_status}
        </span>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Lifecycle controls */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cycle de vie de l&apos;établissement</h2>
        </div>
        <div className="px-5 py-4">
          <SchoolLifecycle schoolId={school.id} status={school.subscription_status} />
          <p className="mt-3 text-xs text-gray-400">
            {school.subscription_status === 'active' && 'Établissement actif : fonctionnement normal.'}
            {school.subscription_status === 'suspended' && "Suspendu : les utilisateurs de l'école sont bloqués ; les données sont conservées."}
            {school.subscription_status === 'archived' && 'Archivé : tenant historique, masqué de la liste active.'}
            {school.subscription_status === 'inactive' && 'Inactif.'}
          </p>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 overflow-hidden rounded-xl shadow-sm">
        <div className="bg-indigo-600 px-4 py-4 text-center">
          <p className="text-2xl font-bold text-white">{studentCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">Élèves</p>
        </div>
        <div className="bg-indigo-700 px-4 py-4 text-center">
          <p className="text-2xl font-bold text-white">{teacherCount}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Enseignants</p>
        </div>
        <div className="bg-gray-700 px-4 py-4 text-center">
          <p className="text-2xl font-bold text-white">{admins.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-300">Administrateurs</p>
        </div>
      </div>

      {/* Details */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Informations</h2>
        </div>
        <dl className="divide-y divide-gray-100">
          <Field label="Identifiant" value={school.slug} mono />
          <Field label="Adresse" value={school.address} />
          <Field label="Téléphone" value={school.phone} />
          <Field label="Email" value={school.email} />
          <Field label="Créée le" value={fmtDate(school.created_at)} />
        </dl>
      </div>

      {/* Admins */}
      <SchoolAdmins schoolId={school.id} admins={adminViews} />

      <Link href="/super-admin/schools" className="inline-block text-sm text-gray-600 hover:text-gray-900 hover:underline">← Toutes les écoles</Link>
    </div>
  )
}
