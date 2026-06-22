'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NotificationBell } from '@/components/NotificationBell'
import type { NotificationPreview } from '@/lib/notifications'

const P = {
  home:       'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  bulletin:   'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  attendance: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  finance:    'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  transport:  'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  bell:       'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  homework:   'M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z',
  messages:   'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
  timetable:  'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z',
  bars:       'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  x:          'M6 18L18 6M6 6l12 12',
  exam:       'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  help:       'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
  signout:    'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
}

const NAV = [
  { label: 'Tableau de bord', href: '/parent',               icon: P.home,       exact: true  },
  { label: 'Bulletins',       href: '/parent/bulletins',     icon: P.bulletin,   exact: false },
  { label: 'Examens',         href: '/parent/exams',         icon: P.exam,       exact: false },
  { label: 'Présences',       href: '/parent/attendance',    icon: P.attendance, exact: false },
  { label: 'Devoirs',         href: '/parent/homework',      icon: P.homework,   exact: false },
  { label: 'Messages',        href: '/parent/messages',      icon: P.messages,   exact: false },
  { label: 'Emploi du temps', href: '/parent/timetable',     icon: P.timetable,  exact: false },
  { label: 'Finance',         href: '/parent/finance',       icon: P.finance,    exact: false },
  { label: 'Transport',       href: '/parent/transport',     icon: P.transport,  exact: false },
  { label: 'Annonces',        href: '/parent/announcements', icon: P.bell,       exact: false },
  { label: 'Aide',            href: '/parent/help',          icon: P.help,       exact: false },
]

function Icon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

interface Props {
  schoolName:  string
  parentName:  string
  userEmail:   string
  unreadCount: number
  recent:      NotificationPreview[]
}

export function ParentNav({ schoolName, parentName, userEmail, unreadCount, recent }: Props) {
  const pathname  = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const displaySchool = schoolName || 'Mon École'
  const initials = displaySchool.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  const links = NAV.map((item) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
    return (
      <a
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? 'bg-white/95 text-primary-700 shadow-sm'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon d={item.icon} />
        <span className="flex-1 truncate">{item.label}</span>
      </a>
    )
  })

  const footer = (
    <div className="mt-auto border-t border-white/10 pt-4">
      <div className="mb-3 px-1">
        <p className="text-sm font-medium text-white truncate">{parentName}</p>
        <p className="text-xs text-white/50 truncate mt-0.5">{userEmail}</p>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Icon d={P.signout} />
          Déconnexion
        </button>
      </form>
    </div>
  )

  const sidebarBody = (
    <div className="flex h-full flex-col bg-primary-700">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center gap-3 bg-primary-600 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{displaySchool}</p>
          <p className="text-xs text-white/60">Portail Parent</p>
        </div>
        <div className="ml-auto flex items-center">
          <div className="hidden lg:block">
            <NotificationBell unreadCount={unreadCount} items={recent} role="parent" variant="dark" align="left" />
          </div>
          <button
            className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          >
            <Icon d={P.x} />
          </button>
        </div>
      </div>
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">{links}</nav>
      {/* Footer */}
      <div className="px-3 pb-4">{footer}</div>
    </div>
  )

  return (
    <>
      {/* ── Mobile fixed top bar ─────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center gap-3 border-b border-primary-600 bg-primary-700 px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Ouvrir le menu"
        >
          <Icon d={P.bars} />
        </button>
        <span className="text-sm font-semibold text-white truncate">{displaySchool}</span>
        <div className="ml-auto">
          <NotificationBell unreadCount={unreadCount} items={recent} role="parent" variant="dark" align="right" />
        </div>
      </div>

      {/* ── Mobile drawer overlay ────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64">{sidebarBody}</div>
        </div>
      )}

      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-52">{sidebarBody}</div>
    </>
  )
}
