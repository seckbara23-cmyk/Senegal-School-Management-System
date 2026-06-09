import * as Sentry from '@sentry/nextjs'

// Thin wrapper so callers never have to think about Sentry being a no-op (it is
// when no DSN is configured) and so logging never throws into a real code path.
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    // Never let error-reporting break the request.
  }
}
