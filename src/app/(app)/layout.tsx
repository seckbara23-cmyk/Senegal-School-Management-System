import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './_sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // School name for the sidebar header — take the first active membership.
  // Fails gracefully: if no membership exists the sidebar shows 'Mon École'.
  const { data: membership } = await supabase
    .from('school_memberships')
    .select('schools(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const schoolName =
    (membership?.schools as unknown as { name: string } | null)?.name ?? ''

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
