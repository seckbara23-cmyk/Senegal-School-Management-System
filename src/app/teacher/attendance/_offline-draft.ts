// ─── Offline attendance draft storage ──────────────────────────────────────────
//
// A deliberately tiny localStorage layer for the attendance-taking form only.
// It is NOT a general offline cache: the service worker still serves app routes
// network-only, so the teacher must load the attendance page while online. The
// realistic window this covers is "page already open, connection drops while
// marking the register". The draft survives a reload and lets the teacher push
// it with a manual "Sync now" once the connection returns.
//
// One draft per (class, date) — the same key the server enforces uniqueness on
// (attendance_sessions_class_date_unique), so we never accumulate competing
// drafts for the same register.

export type AttendanceDraftStatus = 'present' | 'absent' | 'late' | 'excused'

export type AttendanceDraft = {
  version: 1
  classId: string
  sessionDate: string
  // Teacher (DB) id when known — purely informational, lets us ignore a draft
  // that belongs to a different signed-in teacher on a shared device.
  teacherId: string | null
  records: Record<string, AttendanceDraftStatus>
  notes: string
  // ISO timestamp of the last local save.
  timestamp: string
  // true once the teacher tried to save while offline — drives the "Sync now"
  // call-to-action when the connection returns.
  pendingSync: boolean
}

const PREFIX = 'attendance-draft:v1:'

export function draftKey(classId: string, sessionDate: string): string {
  return `${PREFIX}${classId}:${sessionDate}`
}

export function loadDraft(classId: string, sessionDate: string): AttendanceDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(draftKey(classId, sessionDate))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AttendanceDraft
    // Guard against shape drift / tampering — only trust an exact v1 match.
    if (
      parsed.version !== 1 ||
      parsed.classId !== classId ||
      parsed.sessionDate !== sessionDate ||
      typeof parsed.records !== 'object' ||
      parsed.records === null
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveDraft(draft: AttendanceDraft): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(draftKey(draft.classId, draft.sessionDate), JSON.stringify(draft))
  } catch {
    // Quota exceeded or storage disabled — non-fatal; the form still works online.
  }
}

export function clearDraft(classId: string, sessionDate: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftKey(classId, sessionDate))
  } catch {
    // Non-fatal.
  }
}
