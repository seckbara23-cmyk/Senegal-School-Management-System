// ─── Copilot provider contract (Phase 10A — AI foundation) ───────────────────
//
// A provider turns an ALREADY-BUILT context into an answer. It receives the
// routed query + the context the Context Builder fetched — and deliberately NO
// database client. This is the seam where a future Claude/OpenAI provider plugs
// in: it would serialise `context` into a prompt and never touch the DB itself.
//
// Pipeline (unchanged): Intent Router → Permissions → Context Builder → Provider
// → Response. Providers own only the final step.

import type { CopilotAnswer, CopilotConfidence, CopilotMetadata, CopilotSource, RoutedQuery } from './types'
import type { CopilotContext } from './context-builder'

// The provider input. No `supabase`/client field by design — providers cannot
// reach the database; all data must already be in `context`.
export type CopilotRequest = {
  query: string
  routed: RoutedQuery
  context: CopilotContext
  locale?: string
}

export interface CopilotProvider {
  id: string
  label: string
  generate(req: CopilotRequest): Promise<CopilotAnswer>
}

// ── Explainability derivation (deterministic, from context only) ─────────────
// Which data domains fed each context kind — surfaced as the answer's sources.
const SOURCE_MAP: Record<CopilotContext['kind'], CopilotSource[]> = {
  school_overview:    [{ kind: 'analytics_executive', label: 'Résumé exécutif' }],
  academic:           [{ kind: 'analytics_academic', label: 'Analytique académique' }],
  finance:            [{ kind: 'analytics_finance', label: 'Analytique financière' }],
  attendance:         [{ kind: 'attendance', label: 'Présences' }],
  at_risk:            [{ kind: 'risk_engine', label: 'Moteur de risque' }],
  admissions:         [{ kind: 'admissions', label: 'Admissions' }],
  transport:          [{ kind: 'transport', label: 'Transport' }],
  timetable:          [{ kind: 'timetable', label: 'Emploi du temps' }],
  homework:           [{ kind: 'homework', label: 'Devoirs' }],
  student:            [{ kind: 'student_record', label: 'Dossier élève' }, { kind: 'risk_engine', label: 'Moteur de risque' }, { kind: 'finance', label: 'Finance' }],
  student_ambiguous:  [{ kind: 'students', label: 'Liste des élèves' }],
  student_not_found:  [{ kind: 'students', label: 'Liste des élèves' }],
  help:               [],
  unknown:            [],
}

// Confidence reflects how directly the answer is grounded in present data.
function deriveConfidence(ctx: CopilotContext): CopilotConfidence {
  switch (ctx.kind) {
    case 'unknown':
    case 'student_not_found':
      return 'low'
    case 'help':
    case 'student_ambiguous':
      return 'medium'
    case 'academic':
      return ctx.data.gradedStudents === 0 ? 'medium' : 'high'
    case 'attendance':
      return ctx.data.rate === null ? 'medium' : 'high'
    case 'admissions':
      return ctx.data.total === 0 ? 'medium' : 'high'
    default:
      return 'high'
  }
}

export function buildMetadata(providerId: string, ctx: CopilotContext, generatedAt: string, locale: string = 'fr'): CopilotMetadata {
  return {
    provider: providerId,
    locale,
    sources: SOURCE_MAP[ctx.kind] ?? [],
    confidence: deriveConfidence(ctx),
    generatedAt,
  }
}

export const CONFIDENCE_LABEL: Record<CopilotConfidence, string> = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' }
