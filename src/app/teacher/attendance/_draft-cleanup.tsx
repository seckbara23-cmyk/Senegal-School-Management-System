'use client'

import { useEffect } from 'react'
import { clearDraft } from './_offline-draft'

// Mounted on the saved-session detail page. Landing here means a real
// attendance_session now exists for this (class, date), so any local draft for
// the same register is stale and must be removed — this is the "synced" signal
// that completes the offline → sync lifecycle.
export function AttendanceDraftCleanup({
  classId,
  sessionDate,
}: {
  classId: string
  sessionDate: string
}) {
  useEffect(() => {
    clearDraft(classId, sessionDate)
  }, [classId, sessionDate])

  return null
}
