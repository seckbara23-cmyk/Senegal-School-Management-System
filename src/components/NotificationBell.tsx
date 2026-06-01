'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  formatRelativeTime,
  notificationTypeDot,
  notificationTypeLabel,
  type NotificationPreview,
} from '@/lib/notifications'
import { getNotificationHref, type NotificationRole } from '@/lib/notification-links'
import { markNotificationRead } from '@/app/notifications/actions'

const BELL_PATH =
  'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0'

type Props = {
  unreadCount: number
  items:       NotificationPreview[]
  /** Viewer role — controls where each notification deep-links to. */
  role:        NotificationRole
  /** Trigger icon colour. 'dark' = white icon (coloured headers), 'light' = gray icon (white headers). */
  variant?:    'dark' | 'light'
  /** Which edge the dropdown is anchored to. 'left' opens toward the content area (sidebars). */
  align?:      'left' | 'right'
}

export function NotificationBell({ unreadCount, items, role, variant = 'dark', align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Open a notification: mark it read (if unread) then navigate to its target.
  function handleOpen(n: NotificationPreview) {
    setOpen(false)
    const href = getNotificationHref(n, role)
    startTransition(async () => {
      if (n.read_at === null) {
        const fd = new FormData()
        fd.set('notificationId', n.id)
        try { await markNotificationRead(fd) } catch { /* best-effort */ }
      }
      router.push(href)
    })
  }

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const triggerColor =
    variant === 'light'
      ? 'text-gray-600 hover:bg-sand-100 hover:text-gray-900'
      : 'text-white/80 hover:bg-white/10 hover:text-white'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`}
        aria-expanded={open}
        className={`relative rounded-md p-2 transition-colors ${triggerColor}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d={BELL_PATH} />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent-400 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-sand-200 bg-white shadow-lg ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-sand-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
                {unreadCount} non lue{unreadCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* List */}
          {items.length > 0 ? (
            <ul className="max-h-80 divide-y divide-sand-100 overflow-y-auto">
              {items.map((n) => {
                const isUnread = n.read_at === null
                return (
                  <li key={n.id} className={isUnread ? 'bg-white' : 'bg-sand-50'}>
                    <button
                      type="button"
                      onClick={() => handleOpen(n)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-sand-100 transition-colors"
                    >
                      <span
                        className={`mt-1.5 block h-2 w-2 shrink-0 rounded-full ${isUnread ? notificationTypeDot(n.type) : 'bg-sand-300'}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                            {notificationTypeLabel(n.type)}
                          </span>
                          <time dateTime={n.created_at} className="shrink-0 text-[11px] text-gray-400">
                            {formatRelativeTime(n.created_at)}
                          </time>
                        </div>
                        <p className={`truncate text-sm ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                          {n.title}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">Aucune notification</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-sand-100 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline"
            >
              Voir toutes les notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
