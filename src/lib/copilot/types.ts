// ─── ScolaTech Copilot — shared types (V1, deterministic, read-only) ──────────

export type CopilotIntent =
  | 'school_overview'
  | 'academic'
  | 'finance'
  | 'attendance'
  | 'at_risk'
  | 'admissions'
  | 'transport'
  | 'timetable'
  | 'homework'
  | 'student_360'
  | 'help'
  | 'unknown'

// V1 ships only the school-admin copilot. The matrix is built to extend to
// teacher / parent copilots later without changing callers.
export type CopilotRole = 'school_admin'

export type RoutedQuery = {
  intent: CopilotIntent
  entities: { studentName?: string }
}

export type CopilotSection = { heading?: string; lines: string[] }
export type CopilotLink = { label: string; href: string }

export type CopilotAnswer = {
  intent: CopilotIntent
  title: string
  summary: string
  sections: CopilotSection[]
  links: CopilotLink[]
  notice?: string
  suggestions?: string[]
}
