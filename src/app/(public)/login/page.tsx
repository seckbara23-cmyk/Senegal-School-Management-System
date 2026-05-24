'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Only allow relative paths that start with a single '/'.
// Rejects '//' (protocol-relative), absolute URLs, ':' (any protocol),
// and /login itself to prevent open redirect and redirect loops.
function getSafeRedirect(value: string | null): string {
  if (!value) return '/dashboard'
  let path: string
  try { path = decodeURIComponent(value) } catch { return '/dashboard' }
  if (!path.startsWith('/') || path.startsWith('//')) return '/dashboard'
  if (path.includes(':'))                              return '/dashboard'
  if (path === '/login' || path.startsWith('/login/')) return '/dashboard'
  return path
}

// ─── Form (needs Suspense boundary for useSearchParams in Next.js 14) ─────────

function LoginForm() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const router       = useRouter()
  const searchParams = useSearchParams()

  function clearError() {
    if (error) setError(null)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Resolve the redirect target before the network call so the value is
    // never present in the URL while Supabase SDK processes the auth response.
    const redirectPath = getSafeRedirect(searchParams.get('redirectTo'))

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? "Une erreur inattendue s'est produite. Veuillez réessayer.")
        return
      }

      router.push(redirectPath)
      router.refresh()
    } catch {
      setError("Une erreur inattendue s'est produite. Veuillez réessayer.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleLogin} noValidate>
      <div className="rounded-md shadow-sm -space-y-px">
        <div>
          <label htmlFor="email" className="sr-only">
            Adresse email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? 'true' : undefined}
            className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            placeholder="Adresse email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError() }}
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? 'true' : undefined}
            className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError() }}
          />
        </div>
      </div>

      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-red-50 border border-red-200 p-3"
        >
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={loading}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Connexion en cours…' : 'Se connecter'}
        </button>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Connexion
          </h2>
        </div>
        {/* Suspense is required by Next.js 14 for components using useSearchParams */}
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
