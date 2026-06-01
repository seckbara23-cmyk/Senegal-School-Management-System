import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { markAllNotificationsRead } from './actions'
import { NotificationCard } from './_card'
import { getNotificationHref, type NotificationRole } from '@/lib/notification-links'

// ─── Types ────────────────────────────────────────────────────────────────────

type Notification = {
  id: string
  title: string
  body: string | null
  type: string
  read_at: string | null
  created_at: string
  school_id: string | null
  metadata: Record<string, unknown> | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(filter: string, page: number): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  if (page > 1)         params.set('page', String(page))
  const qs = params.toString()
  return `/notifications${qs ? '?' + qs : ''}`
}

// Resolve the user's "home" portal for the role-aware back link. Super admins
// take precedence; otherwise the highest-privilege active membership wins.
// finance_officer has no dedicated portal yet → neutral /dashboard.
async function resolvePortal(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ href: string; label: string; role: NotificationRole }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', userId)
    .maybeSingle()

  if ((profile as { global_role: string } | null)?.global_role === 'super_admin') {
    return { href: '/super-admin', label: 'Retour au Super Admin', role: 'super_admin' }
  }

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('status', 'active')

  const roles = new Set(((memberships ?? []) as { role: string }[]).map((m) => m.role))

  if (roles.has('school_admin'))    return { href: '/school',   label: "Retour à l'administration",     role: 'school_admin' }
  if (roles.has('teacher'))         return { href: '/teacher',  label: 'Retour au portail enseignant',  role: 'teacher' }
  if (roles.has('parent'))          return { href: '/parent',   label: 'Retour au portail parent',      role: 'parent' }
  if (roles.has('student'))         return { href: '/student',  label: 'Retour au portail étudiant',    role: 'student' }
  if (roles.has('finance_officer')) return { href: '/finance-officer', label: 'Retour au portail finance', role: 'finance_officer' }
  // any other / no active role
  return { href: '/dashboard', label: 'Retour au tableau de bord', role: 'finance_officer' }
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

  const [portal, unreadResult, totalResult, listResult] = await Promise.all([
    resolvePortal(supabase, user.id),

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
          .select('id, title, body, type, read_at, created_at, school_id, metadata')
          .eq('user_id', user.id)
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)
      : supabase
          .from('notifications')
          .select('id, title, body, type, read_at, created_at, school_id, metadata')
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

      {/* ── Role-aware back link ────────────────────────────────────────────── */}
      <Link
        href={portal.href}
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {portal.label}
      </Link>

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
          {notifications.map((n) => (
            <NotificationCard
              key={n.id}
              id={n.id}
              title={n.title}
              body={n.body}
              type={n.type}
              read_at={n.read_at}
              created_at={n.created_at}
              href={getNotificationHref({ type: n.type, metadata: n.metadata }, portal.role)}
            />
          ))}
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
