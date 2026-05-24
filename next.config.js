/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseWs  = supabaseUrl
  ? supabaseUrl.replace(/^https?:\/\//, 'wss://')
  : ''
const connectSrc = ["'self'", supabaseUrl, supabaseWs]
  .filter(Boolean)
  .join(' ')

// 'unsafe-eval' is added only in development for webpack HMR.
const scriptSrc = isDev
  ? `'self' 'unsafe-inline' 'unsafe-eval'`
  : `'self' 'unsafe-inline'`

const csp = [
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
].filter(Boolean).join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: csp },
  // Prevent the page from being framed — clickjacking defence.
  // Redundant with frame-ancestors in CSP but kept for older browser support.
  { key: 'X-Frame-Options',           value: 'DENY' },
  // Stop browsers from MIME-sniffing the declared Content-Type.
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  // Send origin only for cross-origin requests; full URL for same-origin.
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  // Deny access to hardware APIs not required by this app.
  {
    key:   'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // HSTS: only apply in production — sending it on localhost permanently
  // forces HTTPS on localhost, which breaks dev tooling for months.
  ...(!isDev
    ? [
        {
          key:   'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
          // Note: add `; preload` only after submitting to the HSTS preload list
          // (https://hstspreload.org/) to avoid locking out HTTP-only visitors.
        },
      ]
    : []),
]

const nextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes except Next.js internals.
        // /_next/static and /_next/image are served by Vercel's CDN — adding
        // CSP / nosniff to those responses is unnecessary and can interfere
        // with CDN caching or asset delivery.
        source: '/((?!_next/).*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
