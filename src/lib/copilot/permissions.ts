// ─── Copilot permissions (RBAC-aware, extensible) ────────────────────────────
//
// V1: the school admin can use every read intent within THEIR school (tenant
// isolation is enforced separately by passing schoolId + RLS). The matrix exists
// so a future teacher/parent copilot can be granted a narrower set without
// touching the router or generator.

import type { CopilotIntent, CopilotRole } from './types'

export const ALL_INTENTS: CopilotIntent[] = [
  'school_overview', 'academic', 'finance', 'attendance', 'at_risk',
  'admissions', 'transport', 'timetable', 'homework', 'student_360', 'help', 'unknown',
]

const MATRIX: Record<CopilotRole, CopilotIntent[]> = {
  school_admin: ALL_INTENTS,
}

// help/unknown are always available (they expose no data).
export function canAccess(role: CopilotRole, intent: CopilotIntent): boolean {
  if (intent === 'help' || intent === 'unknown') return true
  return MATRIX[role]?.includes(intent) ?? false
}
