// ─── Student Narrative Engine (Phase 10B — deterministic, no LLM) ────────────
//
// THE single narrative service shared by the Copilot, the student profile and the
// parent portal. Pure: it consumes an already-built snapshot (the Context Builder
// output) and produces grounded French summaries (academic / attendance / finance
// / risk) + recommendations derived from the existing risk factors. It NEVER
// accesses the database. Same snapshot ⇒ same narrative.

import type { RiskLevel } from '@/lib/academic/risk-engine'
import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { Locale } from '@/lib/i18n/locale'
import { trStudent, studentAppreciation, riskLevelLabel, fmtFCFA as fmtMoney } from '@/lib/i18n/messages'

// Structural input — satisfied by StudentSnapshot (risk + outstanding).
export type StudentNarrativeInput = {
  studentId: string
  firstName: string
  lastName: string
  className: string
  average: number | null
  level: RiskLevel
  score: number
  reasons: string[]
  actions: string[]
  outstanding: number
}

export type NarrativeTone = 'positive' | 'neutral' | 'warning' | 'critical'
export type NarrativeSectionKey = 'academic' | 'attendance' | 'finance' | 'risk'
export type NarrativeSection = { key: NarrativeSectionKey; heading: string; lines: string[]; tone: NarrativeTone }

export type StudentNarrative = {
  studentId: string
  name: string
  className: string
  headline: string
  level: RiskLevel
  sections: NarrativeSection[]
  recommendations: string[]
  meta: CopilotMetadata
}

// Reuses the Phase 10A CopilotMetadata contract (provider-agnostic envelope).
const NARRATIVE_SOURCES: CopilotSource[] = [
  { kind: 'student_record', label: 'Dossier élève' },
  { kind: 'risk_engine', label: 'Moteur de risque' },
  { kind: 'finance', label: 'Finance' },
]

// Risk reasons come from our own deterministic catalog, so bucketing by tokens is
// reliable across fr/en/wo (we control every wording).
function categorize(reasons: string[]) {
  const academic: string[] = [], attendance: string[] = [], finance: string[] = [], other: string[] = []
  for (const r of reasons) {
    const n = r.toLowerCase()
    if (/(moyenne|moyenn|mati[èe]re|matiere|[ée]chec|ñàkk|classement|ranking|point|poñ|baisse|drop|w[àa]ññ|average|subject|failing)/.test(n)) academic.push(r)
    else if (/(absence|retard|late|yeegu)/.test(n)) attendance.push(r)
    else if (/(solde|balance|facture|invoice|faktur|frais|fee|bor|overdue)/.test(n)) finance.push(r)
    else other.push(r)
  }
  return { academic, attendance, finance, other }
}

export function generateStudentNarrative(input: StudentNarrativeInput, locale: Locale = 'fr'): StudentNarrative {
  const cat = categorize(input.reasons)

  // ── Academic ────────────────────────────────────────────────────────────────
  const academicLines: string[] = []
  let academicTone: NarrativeTone = 'neutral'
  if (input.average !== null) {
    academicLines.push(trStudent(locale, 'acadLine', { avg: input.average, appr: studentAppreciation(locale, input.average) }))
    academicTone = input.average >= 12 ? 'positive' : input.average >= 10 ? 'neutral' : input.average >= 8 ? 'warning' : 'critical'
  } else {
    academicLines.push(trStudent(locale, 'acadNone'))
  }
  academicLines.push(...cat.academic)

  // ── Attendance ────────────────────────────────────────────────────────────────
  const attendanceLines: string[] = cat.attendance.length > 0 ? cat.attendance : [trStudent(locale, 'attNone')]
  const attendanceTone: NarrativeTone = cat.attendance.length === 0 ? 'positive'
    : cat.attendance.some((r) => /(8|9|\d{2})\s*(absence|yeegu)/.test(r.toLowerCase())) ? 'critical' : 'warning'

  // ── Finance ─────────────────────────────────────────────────────────────────
  const financeLines: string[] = []
  let financeTone: NarrativeTone = 'positive'
  if (input.outstanding > 0) {
    financeLines.push(trStudent(locale, 'finDue', { amount: fmtMoney(input.outstanding) }))
    financeTone = cat.finance.some((r) => /(retard|overdue|weesu)/.test(r.toLowerCase())) ? 'critical' : 'warning'
  } else {
    financeLines.push(trStudent(locale, 'finOk'))
  }
  for (const r of cat.finance) if (!financeLines.includes(r)) financeLines.push(r)

  // ── Risk ──────────────────────────────────────────────────────────────────────
  const riskTone: NarrativeTone = input.level === 'high' ? 'critical' : input.level === 'medium' ? 'warning' : 'positive'
  const riskLines: string[] = [trStudent(locale, 'riskLine', { level: riskLevelLabel(locale, input.level), score: input.score }), ...cat.other]

  const sections: NarrativeSection[] = [
    { key: 'academic', heading: trStudent(locale, 'headScolarite'), lines: academicLines, tone: academicTone },
    { key: 'attendance', heading: trStudent(locale, 'headAssiduite'), lines: attendanceLines, tone: attendanceTone },
    { key: 'finance', heading: trStudent(locale, 'headFinance'), lines: financeLines, tone: financeTone },
    { key: 'risk', heading: trStudent(locale, 'headRisque'), lines: riskLines, tone: riskTone },
  ]

  // Recommendations are the risk engine's grounded interventions (deduped).
  const recommendations = input.actions.length > 0
    ? Array.from(new Set(input.actions))
    : [trStudent(locale, 'recNone')]

  const headline = trStudent(locale, 'headline', {
    className: input.className, avg: input.average, level: riskLevelLabel(locale, input.level),
    out: input.outstanding > 0, amount: fmtMoney(input.outstanding),
  })

  const confidence: CopilotConfidence = input.average === null ? 'medium' : 'high'
  const meta: CopilotMetadata = { provider: 'deterministic', locale, sources: NARRATIVE_SOURCES, confidence, generatedAt: new Date().toISOString() }

  return {
    studentId: input.studentId,
    name: `${input.lastName} ${input.firstName}`.trim(),
    className: input.className,
    headline,
    level: input.level,
    sections,
    recommendations,
    meta,
  }
}
