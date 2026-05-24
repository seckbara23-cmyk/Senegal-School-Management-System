import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Maps implemented roles to their portal path.
// Roles not listed here have no portal yet and will show "Coming soon".
const ROLE_PATHS: Record<string, string> = {
  school_admin: '/school',
  teacher: '/teacher',
  finance_officer: '/finance-officer',
  parent: '/parent',
  student: '/student',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('id', user.id)
    .single()

  const { data: memberships, error: membershipsError } = await supabase
    .from('school_memberships')
    .select('id, role, school_id, schools(name, slug)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const isSuperAdmin = profile?.global_role === 'super_admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back, {profile?.full_name || user.email}</p>
      </div>

      {(profileError || membershipsError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">Failed to load account data. Please refresh the page.</p>
        </div>
      )}

      {isSuperAdmin && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Super Admin Panel</h2>
          <p className="text-gray-600">You have access to all schools and platform management.</p>
          <a
            href="/super-admin"
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Go to Super Admin
          </a>
        </div>
      )}

      {memberships && memberships.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Your Schools</h2>
          <div className="space-y-4">
            {memberships.map((membership) => {
              const school = membership.schools as unknown as { name: string; slug: string } | null
              const portalPath = ROLE_PATHS[membership.role] ?? null
              return (
                <div key={membership.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">{school?.name}</h3>
                    <p className="text-sm text-gray-600 capitalize">
                      {membership.role.replace(/_/g, ' ')}
                    </p>
                  </div>
                  {portalPath ? (
                    <a href={portalPath} className="text-indigo-600 hover:text-indigo-900 text-sm">
                      Access
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">Coming soon</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Notifications shortcut — always visible */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
            <p className="mt-1 text-sm text-gray-500">Vos alertes et messages récents.</p>
          </div>
          <a
            href="/notifications"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Voir
          </a>
        </div>
      </div>

      {!isSuperAdmin && (!memberships || memberships.length === 0) && !membershipsError && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">No School Access</h2>
          <p className="text-gray-600">
            You don&apos;t have access to any schools yet. Please contact your school administrator.
          </p>
        </div>
      )}
    </div>
  )
}
