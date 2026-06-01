'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NotificationBell } from '@/components/NotificationBell'
import type { NotificationPreview } from '@/lib/notifications'

const P = {
  home:     'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  invoices: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 3.75 3.75 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  payments: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  reports:  'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  bars:     'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  x:        'M6 18L18 6M6 6l12 12',
  signout:  'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
}

const NAV = [
  { label: 'Tableau de bord', href: '/finance-officer',          icon: P.home,     exact: true  },
  { label: 'Factures',        href: '/finance-officer/invoices', icon: P.invoices, exact: false },
  { label: 'Paiements',       href: '/finance-officer/payments', icon: P.payments, exact: false },
  { label: 'Rapports',        href: '/finance-officer/reports',  icon: P.reports,  exact: false },
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
  userEmail:   string
  unreadCount: number
  recent:      NotificationPreview[]
}

export function FinanceOfficerNav({ schoolName, userEmail, unreadCount, recent }: Props) {
  const pathname = usePathname()
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
        <p className="text-sm font-medium text-white truncate">Bureau du comptable</p>
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
          <p className="text-xs text-white/60">Portail Finance</p>
        </div>
        <div className="ml-auto flex items-center">
          <div className="hidden lg:block">
            <NotificationBell unreadCount={unreadCount} items={recent} role="finance_officer" variant="dark" align="left" />
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
          <NotificationBell unreadCount={unreadCount} items={recent} role="finance_officer" variant="dark" align="right" />
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
