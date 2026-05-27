'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// ─── SVG icon paths (Heroicons outline, 24px viewBox) ────────────────────────

const P = {
  home:     'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  key:      'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  students: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  teachers: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  parents:  'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  classes:  'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  clock:    'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  document:  'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  academic:  'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25',
  megaphone: 'M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46',
  money:    'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  bell:     'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  bars:     'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  x:        'M6 18L18 6M6 6l12 12',
  signout:  'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  building:  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  calendar:  'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 16.5v2.25',
}

function Icon({ path, className = 'h-5 w-5 shrink-0' }: { path: string; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

// ─── Nav items config ─────────────────────────────────────────────────────────

type NavItem = {
  label: string
  href?: string
  iconPath: string
  soon?: boolean
}

const MAIN_NAV: NavItem[] = [
  { label: 'Tableau de bord', href: '/school',               iconPath: P.home     },
  { label: 'Élèves',          href: '/school/students',      iconPath: P.students },
  { label: 'Enseignants',          href: '/school/teachers',  iconPath: P.teachers },
  { label: 'Parents',          href: '/school/parents',       iconPath: P.parents  },
  { label: 'Comptes',          href: '/school/users',         iconPath: P.key      },
  { label: 'Années scolaires', href: '/school/academic-years', iconPath: P.calendar },
  { label: 'Classes',          href: '/school/classes',      iconPath: P.classes  },
  { label: 'Présences',        href: '/school/attendance',   iconPath: P.clock      },
  { label: 'Annonces',         href: '/school/announcements', iconPath: P.megaphone  },
  { label: 'Académique',       href: '/school/academics',    iconPath: P.academic   },
  { label: 'Notes & bulletins',  href: '/school/academics/bulletins', iconPath: P.document },
  { label: 'Paiements',         href: '/school/finance',     iconPath: P.money    },
]

const BOTTOM_NAV: NavItem[] = [
  { label: 'Notifications', href: '/notifications', iconPath: P.bell },
]

// ─── Active-state helper ─────────────────────────────────────────────────────

function isActive(href: string, pathname: string): boolean {
  if (href === '/school') return pathname === '/school'
  return pathname === href || pathname.startsWith(href + '/')
}

// ─── Single nav item ─────────────────────────────────────────────────────────

function NavRow({
  item,
  pathname,
  unreadCount = 0,
  onClick,
}: {
  item: NavItem
  pathname: string
  unreadCount?: number
  onClick?: () => void
}) {
  const active = item.href ? isActive(item.href, pathname) : false

  if (item.soon) {
    return (
      <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/40 cursor-not-allowed select-none">
        <Icon path={item.iconPath} />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/40">
          Bientôt
        </span>
      </span>
    )
  }

  return (
    <a
      href={item.href!}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-white/95 text-primary-700 shadow-sm'
          : 'text-white/80 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon path={item.iconPath} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.href === '/notifications' && unreadCount > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center min-w-[1.2rem] h-5 rounded-full bg-accent-400 px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </a>
  )
}

// ─── Sidebar component ────────────────────────────────────────────────────────

type SidebarProps = {
  schoolName: string
  userEmail:  string
  unreadCount: number
}

export function Sidebar({ schoolName, userEmail, unreadCount }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const displayName = schoolName || 'Mon École'
  // Show first two initials for the avatar chip
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const sidebarContent = (
    <div className="flex h-full flex-col bg-primary-700">
      {/* School header */}
      <div className="flex h-16 shrink-0 items-center gap-3 bg-primary-600 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{displayName}</p>
          <p className="text-xs text-white/60">Administration scolaire</p>
        </div>
        {/* Close button — mobile only */}
        <button
          className="ml-auto rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
        >
          <Icon path={P.x} className="h-5 w-5" />
        </button>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {MAIN_NAV.map((item) => (
          <NavRow
            key={item.label}
            item={item}
            pathname={pathname}
            onClick={() => setOpen(false)}
          />
        ))}

        <div className="my-3 border-t border-white/10" />

        {BOTTOM_NAV.map((item) => (
          <NavRow
            key={item.label}
            item={item}
            pathname={pathname}
            unreadCount={unreadCount}
            onClick={() => setOpen(false)}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
            {userEmail.slice(0, 1).toUpperCase()}
          </div>
          <p className="flex-1 truncate text-xs text-white/70">{userEmail}</p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Déconnexion"
              className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Icon path={P.signout} className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* ── Desktop sidebar (always visible) ──────────────────────────────── */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {/* ── Mobile: fixed top header ───────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-sand-200 bg-white px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="rounded-md p-2 text-gray-600 hover:bg-sand-100 hover:text-gray-900"
        >
          <Icon path={P.bars} className="h-5 w-5" />
        </button>

        <span className="text-sm font-semibold text-primary-700">
          {displayName}
        </span>

        <a
          href="/notifications"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          className="relative rounded-md p-2 text-gray-600 hover:bg-sand-100 hover:text-gray-900"
        >
          <Icon path={P.bell} className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent-400" />
          )}
        </a>
      </header>

      {/* ── Mobile: overlay + slide-in drawer ─────────────────────────────── */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-72 lg:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
