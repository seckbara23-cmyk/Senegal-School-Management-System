// ─── Executive Narrative Engine (Phase 10C — deterministic, no LLM) ──────────
//
// Pure: turns an ExecutiveSnapshot into a grounded French leadership summary
// (points d'attention / points positifs / priorités de la semaine /
// recommandations). NEVER accesses the database. Same snapshot ⇒ same narrative
// (only meta.generatedAt, taken from the snapshot, reflects load time). Reuses the
// Phase 10A CopilotMetadata contract for explainability.

import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { ExecutiveSnapshot } from './executive-snapshot'

export type ExecutiveNarrative = {
  headline: string
  attention: string[]
  positives: string[]
  priorities: string[]
  recommendations: string[]
  meta: CopilotMetadata
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'

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

export function generateExecutiveNarrative(s: ExecutiveSnapshot): ExecutiveNarrative {
  const meta: CopilotMetadata = { provider: 'deterministic', sources: SOURCES, confidence: deriveConfidence(s), generatedAt: s.generatedAt }

  if (!s.hasData) {
    return {
      headline: 'Données insuffisantes pour une synthèse — inscrivez des élèves pour l’activer.',
      attention: [], positives: [],
      priorities: ['Terminer la configuration de l’école et inscrire les élèves.'],
      recommendations: [], meta,
    }
  }

  const a = s.academic, att = s.attendance, fin = s.finance, risk = s.risk, eng = s.engagement

  // ── Points d'attention ────────────────────────────────────────────────────────
  const attention: string[] = []
  if (att.rate !== null && att.rate < 90) attention.push(`Assiduité à ${att.rate}% (sous l’objectif de 90 %).`)
  if (att.worstClass && att.worstClass.rate < 80) attention.push(`Classe la moins assidue : ${att.worstClass.name} (${att.worstClass.rate}%).`)
  if (a.average !== null && a.average < 10) attention.push(`Moyenne générale faible : ${a.average}/20.`)
  if (a.passRate !== null && a.passRate < 60) attention.push(`Taux de réussite à ${a.passRate}%.`)
  if (a.weakSubject && a.weakSubject.average < 10) attention.push(`Matière en difficulté : ${a.weakSubject.name} (${a.weakSubject.average}/20).`)
  if (fin.collectionRate < 70) attention.push(`Recouvrement à ${fin.collectionRate}%${fin.outstanding > 0 ? ` · ${fmt(fin.outstanding)} en attente` : ''}.`)
  if (fin.overdue > 0) attention.push(`Impayés en retard : ${fmt(fin.overdue)}.`)
  if (risk.high > 0) attention.push(`${risk.high} élève(s) à risque élevé.`)
  if (eng.parents > 0 && eng.low > eng.engaged) attention.push(`Engagement parental faible (${eng.low}/${eng.parents} familles peu actives).`)
  if (s.admissions.pending > 0) attention.push(`${s.admissions.pending} candidature(s) en attente de traitement.`)

  // ── Points positifs ───────────────────────────────────────────────────────────
  const positives: string[] = []
  if (att.rate !== null && att.rate >= 95) positives.push(`Excellente assiduité (${att.rate}%).`)
  if (a.passRate !== null && a.passRate >= 75) positives.push(`Bon taux de réussite (${a.passRate}%).`)
  if (a.average !== null && a.average >= 12) positives.push(`Bonne moyenne générale (${a.average}/20).`)
  if (a.bestClass && a.bestClass.average >= 12) positives.push(`Classe en tête : ${a.bestClass.name} (${a.bestClass.average}/20).`)
  if (fin.collectionRate >= 90) positives.push(`Recouvrement solide (${fin.collectionRate}%).`)
  if (risk.total === 0 && a.gradedStudents > 0) positives.push('Aucun élève à risque détecté.')
  if (eng.parents > 0 && eng.engaged >= eng.low && eng.engaged > 0) positives.push(`Engagement parental encourageant (${eng.engaged}/${eng.parents} familles actives).`)

  // ── Priorités de la semaine ─────────────────────────────────────────────────────
  const priorities: string[] = []
  if (risk.high > 0) priorities.push(`Suivre ${risk.high} élève(s) à risque élevé via la cellule de soutien${risk.top[0] ? ` (ex. ${risk.top[0].name})` : ''}.`)
  if (fin.overdue > 0) priorities.push(`Relancer les familles en retard de paiement (${fmt(fin.overdue)}).`)
  if (att.worstClass && att.worstClass.rate < 85) priorities.push(`Vérifier l’assiduité en ${att.worstClass.name} (${att.worstClass.rate}%).`)
  if (s.admissions.pending > 0) priorities.push(`Traiter ${s.admissions.pending} candidature(s) en attente.`)
  if (a.weakSubject && a.weakSubject.average < 10) priorities.push(`Organiser un soutien en ${a.weakSubject.name}.`)
  if (priorities.length === 0) priorities.push('Aucune urgence cette semaine — maintenir le suivi habituel.')

  // ── Recommandations (du facteur de risque dominant + structurel) ───────────────
  const recommendations: string[] = []
  const f = risk.factors
  const maxFactor = Math.max(f.academic, f.attendance, f.finance)
  if (maxFactor > 0) {
    if (f.academic === maxFactor) recommendations.push(`Renforcer le soutien scolaire${a.weakSubject ? ` (priorité : ${a.weakSubject.name})` : ''}.`)
    if (f.finance === maxFactor) recommendations.push('Déployer des rappels de paiement et proposer des échéanciers.')
    if (f.attendance === maxFactor) recommendations.push('Mettre en place un suivi rapproché de l’assiduité.')
  }
  if (eng.parents > 0 && eng.low > 0) recommendations.push('Encourager l’usage du portail parent (notifications, messagerie).')
  if (fin.collectionRate < 70 && fin.activePlans === 0) recommendations.push('Introduire des échéanciers de paiement pour lisser la trésorerie.')
  if (recommendations.length === 0) recommendations.push('Poursuivre la dynamique actuelle.')

  const headline = `${s.roster.students} élèves · assiduité ${att.rate ?? '—'}% · recouvrement ${fin.collectionRate}% · ${risk.total} élève(s) à surveiller.`

  return {
    headline,
    attention,
    positives,
    priorities: priorities.slice(0, 4),
    recommendations: Array.from(new Set(recommendations)).slice(0, 4),
    meta,
  }
}
