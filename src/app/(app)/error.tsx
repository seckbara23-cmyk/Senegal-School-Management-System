'use client'

import { useEffect } from 'react'

// Error boundary for the authenticated (app) area. Rendered inside the root
// layout, so the design system applies. Sentry capture is wired in lib/monitoring.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Logged so it surfaces in server/browser consoles and Vercel logs.
    console.error('[app-error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-gray-500">
          Impossible d&apos;afficher cette page pour le moment. Réessayez ; si le problème persiste, contactez le support.
          {error.digest ? ` (réf. ${error.digest})` : ''}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Réessayer
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-sand-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-sand-50"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  )
}
