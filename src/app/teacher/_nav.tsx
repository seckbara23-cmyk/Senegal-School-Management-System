'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NotificationBell } from '@/components/NotificationBell'
import type { NotificationPreview } from '@/lib/notifications'

const P = {
  home:       'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  classes:    'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  grades:     'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  homework:   'M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z',
  messages:   'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
  attendance: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  bell:       'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  timetable:  'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z',
  bars:       'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  x:          'M6 18L18 6M6 6l12 12',
  help:       'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
  signout:    'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  cog:        'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527a1.125 1.125 0 01-1.449-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  copilot:    'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
}

const NAV = [
  { label: 'Tableau de bord', href: '/teacher',              icon: P.home,       exact: true  },
  { label: 'Copilot',          href: '/teacher/copilot',      icon: P.copilot,    exact: false },
  { label: 'Mes classes',      href: '/teacher/classes',      icon: P.classes,    exact: false },
  { label: 'Mes matières',     href: '/teacher/subjects',     icon: P.grades,     exact: false },
  { label: 'Notes',            href: '/teacher/grades',       icon: P.grades,     exact: false },
  { label: 'Présences',        href: '/teacher/attendance',   icon: P.attendance, exact: false },
  { label: 'Devoirs',          href: '/teacher/homework',     icon: P.homework,   exact: false },
  { label: 'Messages',         href: '/teacher/messages',     icon: P.messages,   exact: false },
  { label: 'Emploi du temps',  href: '/teacher/timetable',    icon: P.timetable,  exact: false },
  { label: 'Annonces',         href: '/teacher/announcements',icon: P.bell,       exact: false },
  { label: 'Préférences',      href: '/teacher/preferences',  icon: P.cog,        exact: false },
  { label: 'Aide',             href: '/teacher/help',         icon: P.help,       exact: false },
]

function Icon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

interface Props {
  schoolName:   string
  teacherName:  string
  userEmail:    string
  unreadCount:  number
  recent:       NotificationPreview[]
}

export function TeacherNav({ schoolName, teacherName, userEmail, unreadCount, recent }: Props) {
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
        <p className="text-sm font-medium text-white truncate">{teacherName}</p>
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
      <div className="flex h-16 shrink-0 items-center gap-3 bg-primary-600 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{displaySchool}</p>
          <p className="text-xs text-white/60">Portail Enseignant</p>
        </div>
        <div className="ml-auto flex items-center">
          <div className="hidden lg:block">
            <NotificationBell unreadCount={unreadCount} items={recent} role="teacher" variant="dark" align="left" />
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
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">{links}</nav>
      <div className="px-3 pb-4">{footer}</div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
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
          <NotificationBell unreadCount={unreadCount} items={recent} role="teacher" variant="dark" align="right" />
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64">{sidebarBody}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-52">{sidebarBody}</div>
    </>
  )
}
