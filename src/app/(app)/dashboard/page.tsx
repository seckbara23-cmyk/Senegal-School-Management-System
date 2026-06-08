import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Maps implemented roles to their portal landing path.
// Roles not listed here have no portal yet and will show "Coming soon".
// (The school-admin portal index at /school IS the admin dashboard.)
const ROLE_PATHS: Record<string, string> = {
  school_admin: '/school',
  teacher: '/teacher',
  finance_officer: '/finance-officer',
  parent: '/parent',
  student: '/student',
}

// Roles whose portal also requires a linked profile record (students/parents/
// teachers resolved via profile_id). Their portal guards bounce back to
// /dashboard when that record is missing, so we must confirm the link exists
// before auto-redirecting — otherwise the two redirects would loop forever.
const PROFILE_LINKED_TABLE: Record<string, string> = {
  student: 'students',
  parent:  'parents',
  teacher: 'teachers',
}

type Membership = {
  id: string
  role: string
  school_id: string
  schools: { name: string; slug: string } | null
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // ── Detect role/membership FIRST, then redirect before any UI renders ────────
  // The post-login auto-routing below must run before the hub markup so a
  // role-specific user never sees the generic dashboard (or its app shell) flash
  // before landing in their portal. Profile + memberships are fetched in
  // parallel so the redirect decision is reached in a single round-trip of
  // latency rather than two sequential queries.
  const [profileRes, membershipsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, global_role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('school_memberships')
      .select('id, role, school_id, schools(name, slug)')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ])

  const { data: profile, error: profileError }                 = profileRes
  const { data: membershipsData, error: membershipsError }     = membershipsRes
  const memberships  = (membershipsData ?? []) as unknown as Membership[]
  const isSuperAdmin = profile?.global_role === 'super_admin'

  // A user who belongs to exactly ONE school skips this selector and lands
  // straight in their role portal. Two-or-more memberships keep the selector so
  // the user can choose which school to enter. Super admins always see this hub
  // (it carries their platform-management panel), and on any load error we also
  // render the hub so the failure is visible rather than silently redirected.
  if (!isSuperAdmin && !profileError && !membershipsError && memberships.length === 1) {
    const m      = memberships[0]
    const target = ROLE_PATHS[m.role]
    if (target) {
      const linkedTable = PROFILE_LINKED_TABLE[m.role]
      let canEnter = true
      if (linkedTable) {
        // Mirror the portal guard's record check so the redirect can't loop.
        const { data: linkedRecord } = await supabase
          .from(linkedTable)
          .select('id')
          .eq('profile_id', user.id)
          .eq('school_id', m.school_id)
          .maybeSingle()
        canEnter = Boolean(linkedRecord)
      }
      // redirect() throws NEXT_REDIRECT — must run outside any try/catch, and
      // BEFORE the component returns any JSX so no hub UI is ever rendered.
      if (canEnter) redirect(target)
    }
  }

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

      {memberships.length > 0 && (
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

      {!isSuperAdmin && memberships.length === 0 && !membershipsError && (
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
