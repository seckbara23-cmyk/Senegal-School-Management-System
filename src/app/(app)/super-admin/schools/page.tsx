import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive:  'bg-gray-100 text-gray-600 border-gray-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active', inactive: 'Inactive', suspended: 'Suspendue',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function SuperAdminSchoolsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  const { data: schools } = await supabase
    .from('schools')
    .select('id, name, slug, email, subscription_status, created_at')
    .order('created_at', { ascending: false })

  type SchoolRow = {
    id: string; name: string; slug: string; email: string | null
    subscription_status: string; created_at: string
  }
  const rows = (schools ?? []) as SchoolRow[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav className="mb-1 text-sm text-gray-500">
            <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-gray-900">Écoles</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Écoles</h1>
          <p className="mt-0.5 text-sm text-gray-500">{rows.length} établissement{rows.length !== 1 ? 's' : ''} sur la plateforme</p>
        </div>
        <Link
          href="/super-admin/schools/new"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Nouvelle école
        </Link>
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune école</p>
          <p className="mt-1 text-sm text-gray-400">Créez la première école pour démarrer.</p>
          <Link href="/super-admin/schools/new" className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Créer une école
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Identifiant</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Créée le</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s, idx) => (
                <tr key={s.id} className={`border-b border-gray-100 hover:bg-indigo-50/40 ${idx % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/schools/${s.id}`} className="font-medium text-gray-900 hover:text-indigo-700 hover:underline">{s.name}</Link>
                    {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-500">{s.slug}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500">{fmtDate(s.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[s.subscription_status] ?? STATUS_BADGE.inactive}`}>
                      {STATUS_LABEL[s.subscription_status] ?? s.subscription_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/super-admin/schools/${s.id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-900 hover:underline">Gérer →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
