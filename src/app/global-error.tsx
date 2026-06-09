'use client'

import { useEffect } from 'react'
import { captureError } from '@/lib/monitoring'

// Root-level error boundary. It replaces the root layout entirely, so the app's
// global stylesheet is NOT loaded here — we use inline styles (Senegal palette)
// to stay self-contained. Catches errors thrown in the root layout itself.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureError(error, { boundary: 'global-error', digest: error.digest })
  }, [error])

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F7F3EB', color: '#1f2937' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 460, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#0F7B45', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>!</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Une erreur est survenue</h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 }}>
              Une erreur inattendue s&apos;est produite. Vous pouvez réessayer ou revenir à l&apos;accueil.
              {error.digest ? ` (réf. ${error.digest})` : ''}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => reset()}
                style={{ background: '#0F7B45', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Réessayer
              </button>
              <a
                href="/dashboard"
                style={{ background: '#fff', color: '#374151', border: '1px solid #DDD8CE', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
              >
                Accueil
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
