'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markNotificationRead } from './actions'
import { notificationTypeDot, notificationTypeLabel, formatRelativeTime } from '@/lib/notifications'

type Props = {
  id:         string
  title:      string
  body:       string | null
  type:       string
  read_at:    string | null
  created_at: string
  href:       string
}

// A clickable notification card: opens its deep-link target and marks itself
// read (if unread) on activation. Keyboard accessible (Enter / Space).
export function NotificationCard({ id, title, body, type, read_at, created_at, href }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const isUnread = read_at === null

  function open() {
    startTransition(async () => {
      if (isUnread) {
        const fd = new FormData()
        fd.set('notificationId', id)
        try { await markNotificationRead(fd) } catch { /* best-effort */ }
      }
      router.push(href)
    })
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className={`flex cursor-pointer items-start gap-4 rounded-xl border px-5 py-4 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
        isUnread
          ? 'border-accent-300 bg-white shadow-sm hover:bg-sand-50'
          : 'border-sand-200 bg-sand-50 hover:bg-sand-100'
      }`}
    >
      <div className="mt-1 shrink-0">
        <span
          className={`block h-2.5 w-2.5 rounded-full ${isUnread ? notificationTypeDot(type) : 'bg-sand-300'}`}
          aria-label={isUnread ? 'Non lue' : 'Lue'}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {notificationTypeLabel(type)}
          </span>
          <time dateTime={created_at} className="text-xs text-gray-400">
            {formatRelativeTime(created_at)}
          </time>
        </div>

        <p className={`text-sm font-semibold ${isUnread ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </p>

        {body && (
          <p className={`mt-0.5 text-sm leading-relaxed ${isUnread ? 'text-gray-600' : 'text-gray-400'}`}>
            {body}
          </p>
        )}
      </div>

      {isUnread && (
        <span className="shrink-0 self-center text-xs font-medium text-primary-600">Ouvrir →</span>
      )}
    </article>
  )
}
