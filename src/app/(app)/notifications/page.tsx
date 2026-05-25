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

const TYPE_LABEL: Record<string, string> = {
  info:    'Info',
  success: 'Succès',
  warning: 'Attention',
  error:   'Erreur',
  system:  'Système',
}

const TYPE_DOT: Record<string, string> = {
  info:    'bg-primary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
  system:  'bg-gray-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(filter: string, page: number): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  if (page > 1)         params.set('page', String(page))
  const qs = params.toString()
  return `/notifications${qs ? '?' + qs : ''}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  if (mins < 1)   return "À l'instant"
  if (mins < 60)  return `Il y a ${mins} min`
  if (hours < 24) return `Il y a ${hours} h`
  if (days === 1) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { filter?: string; page?: string }
}

export default async function NotificationsPage({ searchParams }: Props) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const filter = searchParams.filter === 'unread' ? 'unread' : 'all'
  const page   = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const isUnreadFilter = filter === 'unread'

  const [unreadResult, totalResult, listResult] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),

    isUnreadFilter
      ? supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null)
      : supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),

    (isUnreadFilter
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
          .range(offset, offset + PAGE_SIZE - 1)),
  ])

  const unreadCount   = unreadResult.count ?? 0
  const totalCount    = totalResult.count  ?? 0
  const totalPages    = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const notifications = (listResult.data ?? []) as Notification[]
  const queryError    = listResult.error

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Notifications</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {unreadCount > 0
            ? `${unreadCount} non lue${unreadCount !== 1 ? 's' : ''}`
            : 'Tout est à jour'}
        </p>

        {unreadCount > 0 && (
          <div className="mt-4 pt-4 border-t border-primary-700 flex items-center justify-between gap-3">
            <p className="text-sm text-primary-300">
              <span className="font-semibold text-white">{unreadCount}</span>{' '}
              notification{unreadCount !== 1 ? 's' : ''} non lue{unreadCount !== 1 ? 's' : ''}
            </p>
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="rounded-lg border border-primary-600 bg-primary-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 transition-colors"
              >
                Tout marquer comme lu
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg border border-sand-200 bg-sand-50 p-1">
        <a
          href={buildUrl('all', 1)}
          className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Toutes
          {totalCount > 0 && filter === 'all' && (
            <span className="ml-1.5 text-xs text-gray-400">({totalCount})</span>
          )}
        </a>
        <a
          href={buildUrl('unread', 1)}
          className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Non lues
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.2rem] h-5 rounded-full bg-accent-300 px-1 text-[10px] font-bold text-primary-800">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </a>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {queryError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Impossible de charger les notifications. Veuillez rafraîchir la page.
          </p>
        </div>
      )}

      {/* ── Notification list ───────────────────────────────────────────────── */}
      {!queryError && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => {
            const isUnread = n.read_at === null
            const dotClass = TYPE_DOT[n.type] ?? TYPE_DOT.info
            const typeLabel = TYPE_LABEL[n.type] ?? n.type

            return (
              <article
                key={n.id}
                className={`flex items-start gap-4 rounded-xl border px-5 py-4 transition-colors ${
                  isUnread
                    ? 'border-accent-300 bg-white shadow-sm'
                    : 'border-sand-200 bg-sand-50'
                }`}
              >
                {/* Colored dot indicator */}
                <div className="mt-1 shrink-0">
                  <span
                    className={`block h-2.5 w-2.5 rounded-full ${isUnread ? dotClass : 'bg-sand-300'}`}
                    aria-label={isUnread ? 'Non lue' : 'Lue'}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {typeLabel}
                    </span>
                    <time
                      dateTime={n.created_at}
                      className="text-xs text-gray-400"
                    >
                      {formatDate(n.created_at)}
                    </time>
                  </div>

                  <p className={`text-sm font-semibold ${isUnread ? 'text-gray-900' : 'text-gray-500'}`}>
                    {n.title}
                  </p>

                  {n.body && (
                    <p className={`mt-0.5 text-sm leading-relaxed ${isUnread ? 'text-gray-600' : 'text-gray-400'}`}>
                      {n.body}
                    </p>
                  )}
                </div>

                {isUnread && (
                  <form action={markNotificationRead} className="shrink-0">
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline whitespace-nowrap"
                    >
                      Lu ✓
                    </button>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!queryError && notifications.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-200">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">
            {filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs mx-auto">
            {filter === 'unread'
              ? 'Vous avez tout lu. Bravo !'
              : 'Les annonces et alertes de votre école apparaîtront ici.'}
          </p>
          {filter === 'unread' && (
            <a href={buildUrl('all', 1)} className="mt-3 inline-block text-sm text-primary-600 hover:underline">
              Voir toutes les notifications
            </a>
          )}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {!queryError && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} sur {totalCount}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a href={buildUrl(filter, page - 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                ← Précédent
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                ← Précédent
              </span>
            )}
            <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
            {page < totalPages ? (
              <a href={buildUrl(filter, page + 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                Suivant →
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                Suivant →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
