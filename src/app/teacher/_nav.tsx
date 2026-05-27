'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const P = {
  home:       'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  classes:    'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  grades:     'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  attendance: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  bell:       'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  bars:       'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  x:          'M6 18L18 6M6 6l12 12',
  signout:    'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
}

const NAV = [
  { label: 'Tableau de bord', href: '/teacher',              icon: P.home,       exact: true  },
  { label: 'Mes classes',      href: '/teacher/classes',      icon: P.classes,    exact: false },
  { label: 'Notes',            href: '/teacher/grades',       icon: P.grades,     exact: false },
  { label: 'Présences',        href: '/teacher/attendance',   icon: P.attendance, exact: false },
  { label: 'Annonces',         href: '/teacher/announcements',icon: P.bell,       exact: false },
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
}

export function TeacherNav({ schoolName, teacherName, userEmail }: Props) {
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
        <button
          className="ml-auto rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
        >
          <Icon d={P.x} />
        </button>
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
        <span className="ml-auto text-xs font-medium text-white/50">Portail Enseignant</span>
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
