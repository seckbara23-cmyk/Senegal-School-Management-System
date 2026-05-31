import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SuperAdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (profile?.global_role !== 'super_admin') {
    redirect('/dashboard')
  }

  const { data: schools, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name, slug, email, subscription_status, created_at')
    .neq('subscription_status', 'archived')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
        <p className="text-gray-600">Manage all schools and platform settings</p>
      </div>

      {/* ── Platform tools ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white shadow rounded-lg p-6 flex flex-col">
          <h2 className="text-base font-semibold text-gray-900">Journaux d&apos;audit</h2>
          <p className="mt-1 text-sm text-gray-500 flex-1">
            Historique des actions sur la plateforme : créations, modifications, suppressions et connexions.
          </p>
          <a
            href="/super-admin/audit-logs"
            className="mt-4 self-start inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Voir les journaux
          </a>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Schools</h2>
          <div className="flex items-center gap-2">
            <a href="/super-admin/schools" className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">
              Tout gérer
            </a>
            <a href="/super-admin/schools/new" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm">
              Add School
            </a>
          </div>
        </div>

        {schoolsError && (
          <p className="text-red-600 text-sm">Failed to load schools. Please try again.</p>
        )}

        {!schoolsError && schools && schools.length > 0 ? (
          <div className="space-y-4">
            {schools.map((school) => (
              <div key={school.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-medium">{school.name}</h3>
                  <p className="text-sm text-gray-600">{school.email}</p>
                </div>
                <div className="flex space-x-2 items-center">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    school.subscription_status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {school.subscription_status}
                  </span>
                  <a href={`/super-admin/schools/${school.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm">
                    Manage
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !schoolsError && <p className="text-gray-600">No schools found.</p>
        )}
      </div>
    </div>
  )
}
