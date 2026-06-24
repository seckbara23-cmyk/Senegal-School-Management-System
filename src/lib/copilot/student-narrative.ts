// ─── Student Narrative Engine (Phase 10B — deterministic, no LLM) ────────────
//
// THE single narrative service shared by the Copilot, the student profile and the
// parent portal. Pure: it consumes an already-built snapshot (the Context Builder
// output) and produces grounded French summaries (academic / attendance / finance
// / risk) + recommendations derived from the existing risk factors. It NEVER
// accesses the database. Same snapshot ⇒ same narrative.

import type { RiskLevel } from '@/lib/academic/risk-engine'
import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'

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

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'
const RISK_LABEL: Record<RiskLevel, string> = { low: 'faible', medium: 'moyen', high: 'élevé' }

// Reuses the Phase 10A CopilotMetadata contract (provider-agnostic envelope).
const NARRATIVE_SOURCES: CopilotSource[] = [
  { kind: 'student_record', label: 'Dossier élève' },
  { kind: 'risk_engine', label: 'Moteur de risque' },
  { kind: 'finance', label: 'Finance' },
]

// Risk reasons are emitted by our own deterministic engine, so bucketing them by
// their French tokens is reliable.
function categorize(reasons: string[]) {
  const academic: string[] = [], attendance: string[] = [], finance: string[] = [], other: string[] = []
  for (const r of reasons) {
    const n = r.toLowerCase()
    if (/(moyenne|mati[èe]re|[ée]chec|classement|point|baisse)/.test(n)) academic.push(r)
    else if (/(absence|retard)/.test(n)) attendance.push(r)
    else if (/(solde|facture|frais)/.test(n)) finance.push(r)
    else other.push(r)
  }
  return { academic, attendance, finance, other }
}

function appreciation(avg: number): string {
  if (avg >= 14) return 'très bon niveau'
  if (avg >= 12) return 'bon niveau'
  if (avg >= 10) return 'niveau moyen'
  if (avg >= 8) return 'en difficulté'
  return 'en grande difficulté'
}

export function generateStudentNarrative(input: StudentNarrativeInput): StudentNarrative {
  const cat = categorize(input.reasons)

  // ── Academic ────────────────────────────────────────────────────────────────
  const academicLines: string[] = []
  let academicTone: NarrativeTone = 'neutral'
  if (input.average !== null) {
    academicLines.push(`Moyenne générale : ${input.average}/20 (${appreciation(input.average)}).`)
    academicTone = input.average >= 12 ? 'positive' : input.average >= 10 ? 'neutral' : input.average >= 8 ? 'warning' : 'critical'
  } else {
    academicLines.push('Aucune moyenne disponible pour la période active.')
  }
  academicLines.push(...cat.academic)

  // ── Attendance ────────────────────────────────────────────────────────────────
  const attendanceLines: string[] = cat.attendance.length > 0 ? cat.attendance : ['Assiduité sans signal particulier.']
  const attendanceTone: NarrativeTone = cat.attendance.length === 0 ? 'positive'
    : cat.attendance.some((r) => /(8|9|\d{2})\s*absence/.test(r.toLowerCase())) ? 'critical' : 'warning'

  // ── Finance ─────────────────────────────────────────────────────────────────
  const financeLines: string[] = []
  let financeTone: NarrativeTone = 'positive'
  if (input.outstanding > 0) {
    financeLines.push(`Solde dû : ${fmt(input.outstanding)}.`)
    financeTone = cat.finance.some((r) => /retard/.test(r.toLowerCase())) ? 'critical' : 'warning'
  } else {
    financeLines.push('Situation financière à jour.')
  }
  for (const r of cat.finance) if (!financeLines.includes(r)) financeLines.push(r)

  // ── Risk ──────────────────────────────────────────────────────────────────────
  const riskTone: NarrativeTone = input.level === 'high' ? 'critical' : input.level === 'medium' ? 'warning' : 'positive'
  const riskLines: string[] = [`Niveau de risque global : ${RISK_LABEL[input.level]} (score ${input.score}/100).`, ...cat.other]

  const sections: NarrativeSection[] = [
    { key: 'academic', heading: 'Scolarité', lines: academicLines, tone: academicTone },
    { key: 'attendance', heading: 'Assiduité', lines: attendanceLines, tone: attendanceTone },
    { key: 'finance', heading: 'Finance', lines: financeLines, tone: financeTone },
    { key: 'risk', heading: 'Suivi & risque', lines: riskLines, tone: riskTone },
  ]

  // Recommendations are the risk engine's grounded interventions (deduped).
  const recommendations = input.actions.length > 0
    ? Array.from(new Set(input.actions))
    : ['Aucune action particulière — poursuivre le suivi habituel.']

  const headline = `${input.className} · ${input.average !== null ? `moyenne ${input.average}/20 · ` : ''}risque ${RISK_LABEL[input.level]}${input.outstanding > 0 ? ` · ${fmt(input.outstanding)} dû` : ''}.`

  const confidence: CopilotConfidence = input.average === null ? 'medium' : 'high'
  const meta: CopilotMetadata = {
    provider: 'deterministic',
    sources: NARRATIVE_SOURCES,
    confidence,
    generatedAt: new Date().toISOString(),
  }

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
