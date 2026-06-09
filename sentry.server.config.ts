import * as Sentry from '@sentry/nextjs'

// Server-side Sentry init. No-ops when SENTRY_DSN is unset, so it is safe in any
// environment (local/preview without a DSN simply does nothing).
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
})
