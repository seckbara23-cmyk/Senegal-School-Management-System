'use client'

// Branded, online-reachable offline notice at /offline. This is the
// Tailwind/design-system version of the page; the service worker serves the
// self-contained static /offline.html when a navigation actually fails while
// the device is offline (the Next-rendered route can't be reached then).
//
// No auth, no data fetching — safe to render in any connection state.

export const dynamic = 'force-static'

const BUILDING_ICON =
  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sand-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-sand-200 bg-white p-8 text-center shadow-xl shadow-primary-900/5">
        {/* Brand mark */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-sm">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={BUILDING_ICON} />
          </svg>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Vous êtes hors ligne
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          ScolaTech nécessite une connexion internet pour accéder aux données de
          votre établissement. Vérifiez votre connexion puis réessayez.
        </p>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
        >
          Réessayer
        </button>
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wider text-gray-400">
        ScolaTech — Gestion scolaire
      </p>
    </main>
  )
}
