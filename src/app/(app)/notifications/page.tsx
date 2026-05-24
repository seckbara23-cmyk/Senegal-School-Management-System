import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { markNotificationRead, markAllNotificationsRead } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Notification = {
  id: string
  title: string
  body: string | null
  type: string
  read_at: string | null
  created_at: string
  school_id: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const TYPE_BADGE: Record<string, string> = {
  info:    'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error:   'bg-red-100 text-red-800',
  system:  'bg-gray-100 text-gray-800',
}

const TYPE_LABELS: Record<string, string> = {
  info:    'Info',
  success: 'Succès',
  warning: 'Attention',
  error:   'Erreur',
  system:  'Système',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPageUrl(params: { filter?: string; page?: number }): string {
  const qs = new URLSearchParams()
  if (params.filter) qs.set('filter', params.filter)
  if (params.page && params.page > 1) qs.set('page', String(params.page))
  const query = qs.toString()
  return `/notifications${query ? `?${query}` : ''}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function NotificationCard({ notification }: { notification: Notification }) {
  const isUnread = notification.read_at === null
  const badgeClass = TYPE_BADGE[notification.type] ?? TYPE_BADGE.info
  const typeLabel = TYPE_LABELS[notification.type] ?? notification.type

  const formattedDate = new Intl.DateTimeFormat('fr-SN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(notification.created_at))

  return (
    <article className={`bg-white rounded-lg shadow-sm border ${isUnread ? 'border-indigo-200' : 'border-gray-100'} p-4 flex gap-4`}>
      {/* Unread indicator */}
      <div className="flex-shrink-0 pt-1">
        {isUnread
          ? <span className="block w-2.5 h-2.5 rounded-full bg-indigo-500" aria-label="Non lu" />
          : <span className="block w-2.5 h-2.5 rounded-full bg-transparent" aria-hidden="true" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
            {typeLabel}
          </span>
          <time className="text-xs text-gray-400" dateTime={notification.created_at}>
            {formattedDate}
          </time>
        </div>

        <p className={`text-sm font-medium ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>
          {notification.title}
        </p>

        {notification.body && (
          <p className="mt-0.5 text-sm text-gray-500">{notification.body}</p>
        )}
      </div>

      {isUnread && (
        <div className="flex-shrink-0 self-start">
          <form action={markNotificationRead}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <button
              type="submit"
              className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
            >
              Marquer lu
            </button>
          </form>
        </div>
      )}
    </article>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string; page?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const filter   = searchParams.filter === 'unread' ? 'unread' : 'all'
  const page     = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset   = (page - 1) * PAGE_SIZE

  // ── Parallel queries ──────────────────────────────────────────────────────
  const [unreadResult, totalResult, logsResult] = await Promise.all([
    // Unread count (for badge / tab label)
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),

    // Total count for current filter (for pagination)
    filter === 'unread'
      ? supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null)
      : supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),

    // Paginated notifications for current filter
    filter === 'unread'
      ? supabase
          .from('notifications')
          .select('id, title, body, type, read_at, created_at, school_id')
          .eq('user_id', user.id)
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)
      : supabase
          .from('notifications')
          .select('id, title, body, type, read_at, created_at, school_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1),
  ])

  const unreadCount = unreadResult.count ?? 0
  const totalCount  = totalResult.count ?? 0
  const totalPages  = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const notifications = (logsResult.data ?? []) as Notification[]
  const queryError  = logsResult.error

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 text-sm">
            {unreadCount > 0
              ? `${unreadCount} notification${unreadCount !== 1 ? 's' : ''} non lue${unreadCount !== 1 ? 's' : ''}`
              : 'Tout est à jour'}
          </p>
        </div>

        {unreadCount > 0 && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Tout marquer comme lu
            </button>
          </form>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 border-b border-gray-200">
        <a
          href={buildPageUrl({ filter: 'all' })}
          className={`pb-3 px-1 text-sm font-medium border-b-2 -mb-px ${
            filter === 'all'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Toutes
        </a>
        <a
          href={buildPageUrl({ filter: 'unread' })}
          className={`pb-3 px-1 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Non lues
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
              {unreadCount}
            </span>
          )}
        </a>
      </div>

      {/* ── Error state ── */}
      {queryError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
          <p className="text-sm text-red-700">
            Impossible de charger les notifications. Veuillez rafraîchir la page.
          </p>
        </div>
      )}

      {/* ── Notification list ── */}
      {!queryError && notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map((n) => (
            <NotificationCard key={n.id} notification={n} />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!queryError && notifications.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-gray-500 text-sm">
            {filter === 'unread'
              ? 'Aucune notification non lue.'
              : 'Aucune notification pour le moment.'}
          </p>
        </div>
      )}

      {/* ── Pagination ── */}
      {!queryError && totalPages > 1 && (
        <nav className="flex justify-between items-center pt-2" aria-label="Pagination">
          {page > 1 ? (
            <a
              href={buildPageUrl({ filter: filter === 'unread' ? 'unread' : undefined, page: page - 1 })}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              ← Précédent
            </a>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 text-sm text-gray-400 cursor-default">
              ← Précédent
            </span>
          )}

          <span className="text-sm text-gray-600">
            Page {page} / {totalPages}
          </span>

          {page < totalPages ? (
            <a
              href={buildPageUrl({ filter: filter === 'unread' ? 'unread' : undefined, page: page + 1 })}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Suivant →
            </a>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 text-sm text-gray-400 cursor-default">
              Suivant →
            </span>
          )}
        </nav>
      )}
    </div>
  )
}
