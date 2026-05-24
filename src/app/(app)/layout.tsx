import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Unread notification count for the topbar badge.
  // Fails gracefully — if the table doesn't exist yet (migration not run),
  // the count will be null and the badge is simply hidden.
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  const badgeCount = unreadCount ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <a href="/dashboard" className="text-xl font-semibold text-gray-900 hover:text-indigo-700">
              School Management System
            </a>
            <div className="flex items-center space-x-4">
              <a
                href="/notifications"
                className="relative inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
                aria-label={`Notifications${badgeCount > 0 ? ` (${badgeCount} non lues)` : ''}`}
              >
                {/* Bell icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </a>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-gray-500 hover:text-gray-900 text-sm"
                >
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}