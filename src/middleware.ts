import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ─── Route protection ─────────────────────────────────────────────────────────

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/school',
  '/teacher',
  '/parent',
  '/student',
  '/finance-officer',
  '/notifications',
  '/super-admin',
]

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

// ─── Nonce-based Content Security Policy ─────────────────────────────────────
//
// A fresh nonce is generated for every request so each page render has a
// unique token.  The nonce is threaded through in two ways:
//
//  1. REQUEST headers  (x-nonce + Content-Security-Policy)
//     Next.js App Router reads the CSP from the incoming request headers and
//     automatically applies the extracted nonce to its own inline <script>
//     tags (flight data, hydration bootstrap).  Server Components can also
//     read x-nonce via headers().get('x-nonce') if they need to pass the
//     nonce to a <Script> element.
//
//  2. RESPONSE header  (Content-Security-Policy)
//     This is what the browser enforces.
//
// Policy notes:
//  - 'strict-dynamic' trusts scripts loaded by any nonce'd script, so all
//    Next.js chunk files (/_next/static/…) are transitively trusted without
//    needing an explicit host allowlist.
//  - Older browsers that don't understand 'strict-dynamic' fall back to
//    'self', which covers same-origin scripts.
//  - 'unsafe-eval' is added only in development for webpack HMR.
//  - style-src keeps 'unsafe-inline' because Next.js and next/font inject
//    inline <style> tags that cannot easily carry a nonce.
//  - worker-src 'self' explicitly covers the PWA service worker.

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseWs  = supabaseUrl
    ? supabaseUrl.replace(/^https?:\/\//, 'wss://')
    : ''
  const connectSrc = ["'self'", supabaseUrl, supabaseWs]
    .filter(Boolean)
    .join(' ')

  // 'self' is included as a fallback for browsers that ignore 'strict-dynamic'.
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `connect-src ${connectSrc}`,
    `font-src 'self'`,
    `worker-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    !isDev && `upgrade-insecure-requests`,
  ]

  return directives.filter(Boolean).join('; ')
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  // Generate a cryptographically secure per-request nonce (128 bits of entropy).
  // Buffer is polyfilled in the Edge runtime by Next.js.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp   = buildCsp(nonce)

  // Attach nonce + CSP to the request headers that Next.js forwards to the
  // app server.  Next.js reads Content-Security-Policy from these request
  // headers and stamps its own inline scripts with the nonce automatically.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  // Initial response — carries the modified request headers so Server
  // Components and the Next.js rendering pipeline see the nonce.
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // ── Supabase SSR session handling ─────────────────────────────────────────
  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // Doing so can cause sessions to randomly expire.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: object }[]) {
          // Mutate cookies on the original request so subsequent reads in this
          // middleware invocation see the refreshed session.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          // Rebuild the request headers from the now-mutated request so the
          // nonce is preserved after the session refresh.
          const refreshedHeaders = new Headers(request.headers)
          refreshedHeaders.set('x-nonce', nonce)
          refreshedHeaders.set('Content-Security-Policy', csp)

          supabaseResponse = NextResponse.next({
            request: { headers: refreshedHeaders },
          })

          // Forward the new session cookies to the browser.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2]
            )
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // ── Apply CSP to the response the browser will receive ───────────────────
  // This MUST happen after the Supabase cookie logic because setAll() may
  // have replaced supabaseResponse with a new object.
  supabaseResponse.headers.set('Content-Security-Policy', csp)

  // IMPORTANT: Return supabaseResponse as-is to preserve session cookies.
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - image files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
