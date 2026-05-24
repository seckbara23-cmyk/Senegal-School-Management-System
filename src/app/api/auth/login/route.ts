import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// ─── Rate limit thresholds ────────────────────────────────────────────────────

const EMAIL_LIMIT = 5     // failed attempts per email per window
const IP_LIMIT    = 20    // failed attempts per IP per window (higher: shared IPs)
const WINDOW_MIN  = 15    // minutes
const WINDOW_MS   = WINDOW_MIN * 60 * 1000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(request: NextRequest): string | null {
  // x-forwarded-for may contain a comma-separated list; take the leftmost
  // value (the original client). Proxies append their own IP to the right.
  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return null
  const first = forwarded.split(',')[0].trim()
  return first || null
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Parse and validate request body ──────────────────────────────────────
  let email: string
  let password: string

  try {
    const body = await request.json() as { email?: unknown; password?: unknown }
    email    = (typeof body.email    === 'string' ? body.email    : '').toLowerCase().trim()
    password = (typeof body.password === 'string' ? body.password : '')
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 })
  }

  const ip          = getClientIp(request)
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()

  // ── 2. Service role client — bypasses RLS for login_attempts table ───────────
  // This key never leaves the server; the API route runs server-side only.
  const db = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── 3. Rate limit: by email ──────────────────────────────────────────────────
  const { count: emailCount, error: emailRlError } = await db
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('succeeded', false)
    .gte('attempted_at', windowStart)

  if (emailRlError) {
    // Fail open: log the problem but do not block the user if the DB is down.
    console.error('[rate-limit] email count error:', emailRlError.message)
  } else if ((emailCount ?? 0) >= EMAIL_LIMIT) {
    return NextResponse.json(
      { error: `Trop de tentatives de connexion. Veuillez réessayer dans ${WINDOW_MIN} minutes.` },
      { status: 429, headers: { 'Retry-After': String(WINDOW_MIN * 60) } }
    )
  }

  // ── 4. Rate limit: by IP (if available) ─────────────────────────────────────
  if (ip) {
    const { count: ipCount, error: ipRlError } = await db
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('succeeded', false)
      .gte('attempted_at', windowStart)

    if (!ipRlError && (ipCount ?? 0) >= IP_LIMIT) {
      return NextResponse.json(
        { error: `Trop de tentatives de connexion. Veuillez réessayer dans ${WINDOW_MIN} minutes.` },
        { status: 429, headers: { 'Retry-After': String(WINDOW_MIN * 60) } }
      )
    }
  }

  // ── 5. Attempt authentication via Supabase ───────────────────────────────────
  // Create an SSR-capable client so that signInWithPassword can write the
  // session cookie directly onto the API route response object.
  const response = NextResponse.json({ success: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2]
            )
          })
        },
      },
    }
  )

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

  // ── 6a. Auth failed — record the attempt and return a generic error ───────────
  if (authError) {
    // Await the insert so the attempt is definitely recorded before responding.
    // A missed insert means one "free" attempt — worth the small latency cost.
    await db.from('login_attempts').insert({ email, ip, succeeded: false })

    // Generic message — same for wrong email and wrong password so as not to
    // reveal whether the account exists.
    return NextResponse.json(
      { error: 'Identifiants incorrects. Veuillez vérifier votre email et votre mot de passe.' },
      { status: 401 }
    )
  }

  // ── 6b. Auth succeeded — clear the failed-attempt history for this email ─────
  // Allows the user to log in normally again after a lockout window expires
  // naturally, or immediately after a successful login resets the counter.
  // Best-effort: do not delay the success response if cleanup fails.
  db.from('login_attempts')
    .delete()
    .eq('email', email)
    .eq('succeeded', false)
    .then(
      () => { /* noop */ },
      (err: unknown) => console.error('[rate-limit] cleanup error:', err)
    )

  // The `response` object already carries the Supabase session cookies written
  // by the `setAll` callback above during signInWithPassword.
  return response
}
