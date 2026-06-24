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

// ── Explainability metadata (Phase 10A) ──────────────────────────────────────
// Attached to every answer so the UI (and audit) can show WHERE an answer came
// from, HOW confident it is, and WHEN it was produced — provider-agnostic, so a
// future LLM provider populates the same shape. Fully derived, never persisted.
export type CopilotConfidence = 'high' | 'medium' | 'low'
export type CopilotSource = { kind: string; label: string }
export type CopilotMetadata = {
  provider: string        // provider id that produced the answer (e.g. 'deterministic')
  sources: CopilotSource[]
  confidence: CopilotConfidence
  generatedAt: string     // ISO 8601
}

export type CopilotAnswer = {
  intent: CopilotIntent
  title: string
  summary: string
  sections: CopilotSection[]
  links: CopilotLink[]
  notice?: string
  suggestions?: string[]
  meta?: CopilotMetadata
}
