import * as Sentry from '@sentry/nextjs'

// Browser Sentry init. No-ops without a public DSN. Session Replay is
// intentionally omitted to keep the CSP and client bundle minimal.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
})
