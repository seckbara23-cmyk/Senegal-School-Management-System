// ─── Shared attendance helpers (Phase 1B) ────────────────────────────────────
//
// Centralises the status vocabulary and the single attendance-rate definition
// so every screen (dashboard, class summary, student profile) agrees.
//
// Assiduité / attendance rate = (présents + retards + justifiés) / total
//                             = (total − absences) / total.
// Only an outright "absent" counts against the rate.

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent:  'Absent',
  late:    'Retard',
  excused: 'Justifié',
}

// Solid badge (filled) — used on rosters / history rows.
export const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent:  'bg-red-100 text-red-700',
  late:    'bg-amber-100 text-amber-700',
  excused: 'bg-sky-100 text-sky-700',
}

export type AttendanceCounts = {
  present: number
  absent:  number
  late:    number
  excused: number
  total:   number
}

export function emptyCounts(): AttendanceCounts {
  return { present: 0, absent: 0, late: 0, excused: 0, total: 0 }
}

export function isAttendanceStatus(v: unknown): v is AttendanceStatus {
  return v === 'present' || v === 'absent' || v === 'late' || v === 'excused'
}

/** Accumulate a single status into a counts object (mutates and returns it). */
export function addStatus(counts: AttendanceCounts, status: string): AttendanceCounts {
  if (isAttendanceStatus(status)) {
    counts[status] += 1
    counts.total += 1
  }
  return counts
}

/** Tally an array of records' statuses into a fresh counts object. */
export function tallyStatuses(records: { status: string }[]): AttendanceCounts {
  return records.reduce((acc, r) => addStatus(acc, r.status), emptyCounts())
}

/**
 * Attendance rate as a 0–100 integer, or null when there are no records.
 * Accepts anything carrying `absent` + `total`.
 */
export function attendanceRate(c: { absent: number; total: number }): number | null {
  return c.total > 0 ? Math.round(((c.total - c.absent) / c.total) * 100) : null
}

/** Colour tone for a rate, matching the green/sand/gold system. */
export function rateTone(rate: number | null): 'emerald' | 'amber' | 'red' | 'gray' {
  if (rate === null) return 'gray'
  if (rate >= 90) return 'emerald'
  if (rate >= 75) return 'amber'
  return 'red'
}

export const RATE_TEXT_CLASS: Record<'emerald' | 'amber' | 'red' | 'gray', string> = {
  emerald: 'text-emerald-700',
  amber:   'text-amber-700',
  red:     'text-red-700',
  gray:    'text-gray-400',
}

export const RATE_BAR_CLASS: Record<'emerald' | 'amber' | 'red' | 'gray', string> = {
  emerald: 'bg-emerald-500',
  amber:   'bg-amber-500',
  red:     'bg-red-500',
  gray:    'bg-gray-300',
}

/** YYYY-MM → e.g. "juin 2026" (fr). */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map((n) => parseInt(n, 10))
  if (!y || !m) return ym
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year:  'numeric',
    timeZone: 'UTC',
  })
}
