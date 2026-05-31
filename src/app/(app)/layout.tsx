import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './_sidebar'
import { TenantUnavailable } from './_tenant-unavailable'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // School name + tenant status for the sidebar header — take the first active
  // membership. Fails gracefully: if no membership exists the sidebar shows ''.
  const { data: membership } = await supabase
    .from('school_memberships')
    .select('schools(name, subscription_status)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const membershipSchool =
    (membership?.schools as unknown as { name: string; subscription_status: string } | null) ?? null
  const schoolName = membershipSchool?.name ?? ''

  // ── Tenant lifecycle gate ───────────────────────────────────────────────────
  // A school user whose tenant is suspended or archived is blocked from every
  // school module; data is left untouched. Super admins are never gated — they
  // are identified by global_role and manage tenants from /super-admin.
  if (membershipSchool?.subscription_status === 'suspended' ||
      membershipSchool?.subscription_status === 'archived') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('id', user.id)
      .maybeSingle()

    if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') {
      return (
        <TenantUnavailable
          status={membershipSchool.subscription_status as 'suspended' | 'archived'}
          schoolName={membershipSchool.name}
          userEmail={user.email ?? ''}
        />
      )
    }
  }

  // Unread notification count for the bell badge.
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  return (
    <div className="flex min-h-screen bg-sand-100 print:bg-white">
      <div className="print:hidden">
        <Sidebar
          schoolName={schoolName}
          userEmail={user.email ?? ''}
          unreadCount={unreadCount ?? 0}
        />
      </div>

      {/*
        pt-14 clears the fixed mobile header rendered inside <Sidebar>.
        On lg+ the mobile header is hidden so no top offset is needed.
        print:pt-0 removes that offset when printing.
      */}
      <main className="flex-1 pt-14 lg:pt-0 print:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
    </div>
  )
}
