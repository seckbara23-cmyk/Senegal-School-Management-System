// ─── In-memory sliding-window rate limiter (best-effort, per-instance) ────────
//
// Zero-dependency, zero-schema guard for public endpoints (e.g. payment
// webhooks). Per serverless instance, so it caps a single-source flood hitting a
// warm instance rather than giving a hard global guarantee — adequate as a DoS /
// cost backstop layered on top of dedupe + authoritative re-verification. For a
// hard global limit, back it with a table later.

const buckets = new Map<string, number[]>()

// Returns true if the call is ALLOWED, false if it should be rejected (429).
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) { buckets.set(key, recent); return false }
  recent.push(now)
  buckets.set(key, recent)

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    buckets.forEach((times, k) => { if (times.every((t) => now - t >= windowMs)) buckets.delete(k) })
  }
  return true
}

export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim() || 'unknown'
  return 'unknown'
}
