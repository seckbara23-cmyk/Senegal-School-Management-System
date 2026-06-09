import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './_sidebar'
import { TenantUnavailable } from './_tenant-unavailable'
import { getNotificationSummary } from '@/lib/notifications'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // School context for the sidebar header + tenant lifecycle gate. We consider
  // ALL active memberships (a user may belong to more than one school), so a
  // suspended tenant cannot be bypassed by a nondeterministic single-row pick.
  const { data: membershipsData } = await supabase
    .from('school_memberships')
    .select('schools(name, subscription_status)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  type MSchool = { name: string; subscription_status: string }
  const schools = ((membershipsData ?? []) as unknown as { schools: MSchool | null }[])
    .map((m) => m.schools)
    .filter((s): s is MSchool => s !== null)

  const writableSchool = schools.find((s) => s.subscription_status === 'active') ?? null
  const blockedSchool =
    schools.find((s) => s.subscription_status === 'suspended' || s.subscription_status === 'archived') ?? null
  // Prefer an active school's name for the sidebar; fall back to any membership.
  const schoolName = (writableSchool ?? schools[0])?.name ?? ''

  // ── Tenant lifecycle gate ───────────────────────────────────────────────────
  // Block only when the user has NO active school — i.e. EVERY tenant they
  // belong to is suspended or archived. A user who also belongs to an active
  // school keeps access to it (data stays isolated by RLS + per-action write
  // guards). Super admins are never gated — they manage tenants from
  // /super-admin and are identified by global_role.
  if (schools.length > 0 && !writableSchool && blockedSchool) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('id', user.id)
      .maybeSingle()

    if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') {
      return (
        <TenantUnavailable
          status={blockedSchool.subscription_status as 'suspended' | 'archived'}
          schoolName={blockedSchool.name}
          userEmail={user.email ?? ''}
        />
      )
    }
  }

  // Unread count + recent notifications for the header bell.
  const { unreadCount, recent } = await getNotificationSummary(supabase, user.id)

  return (
    <div className="flex min-h-screen bg-sand-100 print:bg-white">
      <div className="print:hidden">
        <Sidebar
          schoolName={schoolName}
          userEmail={user.email ?? ''}
          unreadCount={unreadCount}
          recent={recent}
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
