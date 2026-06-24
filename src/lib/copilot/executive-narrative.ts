// ─── Executive Narrative Engine (Phase 10C — deterministic, no LLM) ──────────
//
// Pure: turns an ExecutiveSnapshot into a grounded French leadership summary
// (points d'attention / points positifs / priorités de la semaine /
// recommandations). NEVER accesses the database. Same snapshot ⇒ same narrative
// (only meta.generatedAt, taken from the snapshot, reflects load time). Reuses the
// Phase 10A CopilotMetadata contract for explainability.

import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { ExecutiveSnapshot } from './executive-snapshot'
import type { Locale } from '@/lib/i18n/locale'
import { trExec, fmtFCFA as fmtMoney } from '@/lib/i18n/messages'

export type ExecutiveNarrative = {
  headline: string
  attention: string[]
  positives: string[]
  priorities: string[]
  recommendations: string[]
  meta: CopilotMetadata
}

const SOURCES: CopilotSource[] = [
  { kind: 'analytics_academic', label: 'Analytique académique' },
  { kind: 'analytics_finance', label: 'Analytique financière' },
  { kind: 'engagement', label: 'Engagement parental' },
  { kind: 'risk_engine', label: 'Moteur de risque' },
  { kind: 'attendance', label: 'Présences' },
  { kind: 'admissions', label: 'Admissions' },
  { kind: 'transport', label: 'Transport' },
]

function deriveConfidence(s: ExecutiveSnapshot): CopilotConfidence {
  if (!s.hasData) return 'low'
  const grounded = [s.academic.gradedStudents > 0, s.attendance.rate !== null, s.finance.invoiced > 0].filter(Boolean).length
  return grounded === 3 ? 'high' : grounded >= 1 ? 'medium' : 'low'
}

export function generateExecutiveNarrative(s: ExecutiveSnapshot, locale: Locale = 'fr'): ExecutiveNarrative {
  const meta: CopilotMetadata = { provider: 'deterministic', locale, sources: SOURCES, confidence: deriveConfidence(s), generatedAt: s.generatedAt }

  if (!s.hasData) {
    return {
      headline: trExec(locale, 'emptyHeadline'),
      attention: [], positives: [],
      priorities: [trExec(locale, 'emptyPriority')],
      recommendations: [], meta,
    }
  }

  const a = s.academic, att = s.attendance, fin = s.finance, risk = s.risk, eng = s.engagement

  // ── Points d'attention ────────────────────────────────────────────────────────
  const attention: string[] = []
  if (att.rate !== null && att.rate < 90) attention.push(trExec(locale, 'attLow', { rate: att.rate }))
  if (att.worstClass && att.worstClass.rate < 80) attention.push(trExec(locale, 'attWorst', { name: att.worstClass.name, rate: att.worstClass.rate }))
  if (a.average !== null && a.average < 10) attention.push(trExec(locale, 'avgLow', { avg: a.average }))
  if (a.passRate !== null && a.passRate < 60) attention.push(trExec(locale, 'passLow', { rate: a.passRate }))
  if (a.weakSubject && a.weakSubject.average < 10) attention.push(trExec(locale, 'weakSubj', { name: a.weakSubject.name, avg: a.weakSubject.average }))
  if (fin.collectionRate < 70) attention.push(trExec(locale, 'collLow', { rate: fin.collectionRate, clause: fin.outstanding > 0 ? trExec(locale, 'collLowClause', { amount: fmtMoney(fin.outstanding) }) : '' }))
  if (fin.overdue > 0) attention.push(trExec(locale, 'overdue', { amount: fmtMoney(fin.overdue) }))
  if (risk.high > 0) attention.push(trExec(locale, 'riskHigh', { n: risk.high }))
  if (eng.parents > 0 && eng.low > eng.engaged) attention.push(trExec(locale, 'engLow', { low: eng.low, parents: eng.parents }))
  if (s.admissions.pending > 0) attention.push(trExec(locale, 'admPending', { n: s.admissions.pending }))

  // ── Points positifs ───────────────────────────────────────────────────────────
  const positives: string[] = []
  if (att.rate !== null && att.rate >= 95) positives.push(trExec(locale, 'posAtt', { rate: att.rate }))
  if (a.passRate !== null && a.passRate >= 75) positives.push(trExec(locale, 'posPass', { rate: a.passRate }))
  if (a.average !== null && a.average >= 12) positives.push(trExec(locale, 'posAvg', { avg: a.average }))
  if (a.bestClass && a.bestClass.average >= 12) positives.push(trExec(locale, 'posBest', { name: a.bestClass.name, avg: a.bestClass.average }))
  if (fin.collectionRate >= 90) positives.push(trExec(locale, 'posColl', { rate: fin.collectionRate }))
  if (risk.total === 0 && a.gradedStudents > 0) positives.push(trExec(locale, 'posNoRisk'))
  if (eng.parents > 0 && eng.engaged >= eng.low && eng.engaged > 0) positives.push(trExec(locale, 'posEng', { engaged: eng.engaged, parents: eng.parents }))

  // ── Priorités de la semaine ─────────────────────────────────────────────────────
  const priorities: string[] = []
  if (risk.high > 0) priorities.push(trExec(locale, 'prRisk', { n: risk.high, ex: risk.top[0] ? risk.top[0].name : '' }))
  if (fin.overdue > 0) priorities.push(trExec(locale, 'prOverdue', { amount: fmtMoney(fin.overdue) }))
  if (att.worstClass && att.worstClass.rate < 85) priorities.push(trExec(locale, 'prAtt', { name: att.worstClass.name, rate: att.worstClass.rate }))
  if (s.admissions.pending > 0) priorities.push(trExec(locale, 'prAdm', { n: s.admissions.pending }))
  if (a.weakSubject && a.weakSubject.average < 10) priorities.push(trExec(locale, 'prWeakSubj', { name: a.weakSubject.name }))
  if (priorities.length === 0) priorities.push(trExec(locale, 'prNone'))

  // ── Recommandations (du facteur de risque dominant + structurel) ───────────────
  const recommendations: string[] = []
  const f = risk.factors
  const maxFactor = Math.max(f.academic, f.attendance, f.finance)
  if (maxFactor > 0) {
    if (f.academic === maxFactor) recommendations.push(trExec(locale, 'recAcad', { clause: a.weakSubject ? trExec(locale, 'recAcadClause', { name: a.weakSubject.name }) : '' }))
    if (f.finance === maxFactor) recommendations.push(trExec(locale, 'recFinance'))
    if (f.attendance === maxFactor) recommendations.push(trExec(locale, 'recAtt'))
  }
  if (eng.parents > 0 && eng.low > 0) recommendations.push(trExec(locale, 'recEng'))
  if (fin.collectionRate < 70 && fin.activePlans === 0) recommendations.push(trExec(locale, 'recPlans'))
  if (recommendations.length === 0) recommendations.push(trExec(locale, 'recNone'))

  const headline = trExec(locale, 'headline', { students: s.roster.students, rate: att.rate ?? '—', collection: fin.collectionRate, watch: risk.total })

  return {
    headline,
    attention,
    positives,
    priorities: priorities.slice(0, 4),
    recommendations: Array.from(new Set(recommendations)).slice(0, 4),
    meta,
  }
}
