// ─── Transport module shared helpers ─────────────────────────────────────────
//
// Pure presentation/formatting helpers and label maps shared across the school
// transport pages, the parent portal view, and the dashboard. No 'use server'
// here — this module exports plain values/functions (status labels, money/date
// formatting, document-expiry math), so it can be imported by both server
// components and server actions.

export const EXPIRY_WINDOW_DAYS = 30

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  active:      'Actif',
  maintenance: 'Maintenance',
  inactive:    'Inactif',
}

export const VEHICLE_STATUS_CLASS: Record<string, string> = {
  active:      'bg-primary-50 text-primary-700',
  maintenance: 'bg-amber-50 text-amber-700',
  inactive:    'bg-stone-100 text-stone-500',
}

export const SIMPLE_STATUS_LABEL: Record<string, string> = {
  active:   'Actif',
  inactive: 'Inactif',
}

export const SIMPLE_STATUS_CLASS: Record<string, string> = {
  active:   'bg-primary-50 text-primary-700',
  inactive: 'bg-stone-100 text-stone-500',
}

/** Format a CFA franc integer amount (no decimals). */
export function fmtFCFA(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

/** Format an ISO date (or YYYY-MM-DD) as a short French date. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Strip seconds from a Postgres TIME value (HH:MM:SS → HH:MM). */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return '—'
  return t.slice(0, 5)
}

/**
 * Whole days from today (UTC date-only) until the given date. Negative when the
 * date is already past, null when no date is set. Used for document-expiry
 * alerts on the dashboard.
 */
export function daysUntil(date: string | null | undefined, todayIso: string): number | null {
  if (!date) return null
  const target = new Date(date + 'T00:00:00Z').getTime()
  const today  = new Date(todayIso + 'T00:00:00Z').getTime()
  if (isNaN(target) || isNaN(today)) return null
  return Math.round((target - today) / 86_400_000)
}

/** True when a date is within the expiry window (including already-expired). */
export function isExpiringSoon(date: string | null | undefined, todayIso: string): boolean {
  const d = daysUntil(date, todayIso)
  return d !== null && d <= EXPIRY_WINDOW_DAYS
}
