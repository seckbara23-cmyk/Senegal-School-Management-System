import { requireFinanceOfficerCtx } from './_auth'
import { FinanceOfficerNav } from './_nav'
import { getNotificationSummary } from '@/lib/notifications'

export default async function FinanceOfficerLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, schoolName } = await requireFinanceOfficerCtx()

  const { unreadCount, recent } = await getNotificationSummary(supabase, userId)

  // userEmail for the footer
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen bg-sand-100">
      <FinanceOfficerNav
        schoolName={schoolName}
        userEmail={user?.email ?? ''}
        unreadCount={unreadCount}
        recent={recent}
      />
      <main className="flex-1 pt-14 lg:pt-0 lg:pl-52">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
