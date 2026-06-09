'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
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

// ─── Shared brand tokens ──────────────────────────────────────────────────────
// Senegal-inspired gold accent for the textile pattern and identity marks
// (Tailwind utilities cover everything else via the design system).
const GOLD = '#D9A441'

// EduSen mark — the same building glyph used in the landing page header.
const BUILDING_ICON =
  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'

function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={BUILDING_ICON} />
    </svg>
  )
}

// ─── Login form (authentication logic intentionally unchanged) ─────────────────
// Needs a Suspense boundary for useSearchParams in Next.js 14.

function LoginForm() {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showReset, setShowReset]       = useState(false)
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

  const inputClass =
    'block w-full rounded-lg border border-sand-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 ' +
    'placeholder-gray-400 shadow-sm transition-colors focus:border-primary-600 focus:outline-none ' +
    'focus:ring-2 focus:ring-primary-600/30'

  return (
    <form className="space-y-5" onSubmit={handleLogin} noValidate>
      {/* Email */}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
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
          className={inputClass}
          placeholder="vous@ecole.sn"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearError() }}
        />
      </div>

      {/* Password */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Mot de passe
          </label>
          <button
            type="button"
            onClick={() => setShowReset((v) => !v)}
            aria-expanded={showReset}
            aria-controls="reset-hint"
            className="rounded text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-600/40"
          >
            Mot de passe oublié ?
          </button>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? 'true' : undefined}
            className={inputClass + ' pr-11'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError() }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-primary-600"
          >
            {showPassword ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
        {showReset && (
          <p id="reset-hint" className="mt-2 rounded-lg bg-sand-100 px-3 py-2 text-xs leading-relaxed text-gray-600">
            {`Contactez l'administrateur de votre établissement pour réinitialiser votre mot de passe.`}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {loading ? 'Connexion en cours…' : 'Se connecter'}
      </button>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full bg-sand-50 lg:grid lg:grid-cols-2">

      {/* ── Brand panel (desktop only) ───────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-primary-700 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        {/* Decorative Senegalese-textile diamond pattern */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
          <defs>
            <pattern id="diamonds" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="46" height="46" fill="none" />
              <rect x="14" y="14" width="18" height="18" fill={GOLD} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#diamonds)" />
        </svg>
        {/* Soft glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-600/40 blur-3xl" aria-hidden="true" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
            <BrandMark className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">EduSen</span>
        </div>

        {/* Messaging + hero image */}
        <div className="relative max-w-lg">
          <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-100 ring-1 ring-white/15">
            Logiciel de gestion scolaire
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-snug tracking-tight text-white xl:text-[2.05rem]">
            Plateforme de gestion scolaire pour les établissements sénégalais
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-primary-100">
            Centralisez la gestion des élèves, enseignants, parents, notes, présences et paiements dans un espace sécurisé.
          </p>

          {/* Hero image — the visual centerpiece. Native ratio is 3:2, so
              object-cover keeps it crisp without stretching, and the fixed
              aspect-ratio box reserves space to prevent layout shift. */}
          <div className="relative mt-9 aspect-[3/2] w-full overflow-hidden rounded-2xl shadow-2xl shadow-primary-950/40 ring-1 ring-white/15">
            <Image
              src="/Images/School.png"
              alt="Établissement scolaire moderne au Sénégal"
              fill
              priority
              sizes="(min-width: 1024px) 44vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>

        {/* Footer accent */}
        <div className="relative flex items-center gap-2 text-sm font-medium text-primary-200">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} aria-hidden="true" />
          Conçu pour les écoles du Sénégal
        </div>
      </aside>

      {/* ── Authentication column ────────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">

          {/* Compact brand (mobile only) */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
                <BrandMark className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">EduSen</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Plateforme de gestion scolaire pour les établissements sénégalais
            </p>
          </div>

          {/* Login card */}
          <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-xl shadow-primary-900/5 sm:p-8">
            {/* Gold + green identity bar */}
            <div className="mb-6 flex items-center gap-1.5" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-primary-600" />
              <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: GOLD }} />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Connexion</h2>
            <p className="mt-1.5 text-sm text-gray-500">
              Accédez à votre espace de gestion scolaire.
            </p>

            <div className="mt-7">
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>
          </div>

          {/* Card footer */}
          <p className="mt-6 text-center text-xs font-medium uppercase tracking-wider text-gray-400">
            Administration • Enseignants • Parents
          </p>
        </div>
      </div>
    </main>
  )
}
