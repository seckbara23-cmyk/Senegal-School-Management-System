/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development'

// Content-Security-Policy is NOT set here.
// It is generated per-request in src/middleware.ts with a cryptographic nonce
// so that Next.js App Router's inline scripts can carry the nonce and
// 'unsafe-inline' can be removed from script-src entirely.
//
// All other security headers are static and can safely live here.

const securityHeaders = [
  // Prevent the page from being framed — clickjacking defence.
  // Redundant with frame-ancestors in CSP but kept for older browser support.
  { key: 'X-Frame-Options',        value: 'DENY' },
  // Stop browsers from MIME-sniffing the declared Content-Type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send origin only for cross-origin requests; full URL for same-origin.
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  // Deny access to hardware APIs not required by this app.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // HSTS: only apply in production — sending it on localhost permanently
  // forces HTTPS on localhost, which breaks dev tooling for months.
  ...(!isDev
    ? [
        {
          key: 'Strict-Transport-Security',
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
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
