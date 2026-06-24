// ─── Student risk engine (pure, derived, never persisted) ──────────────────────
//
// Maps a student's REAL platform signals (academic, attendance, finance and —
// when available — discipline) to a risk assessment. No score is ever stored;
// callers recompute on demand. View-only: it suggests interventions, it does not
// trigger them. Every reason/action is grounded in the input metrics.

import type { Locale } from '@/lib/i18n/locale'
import { trRisk, fmtFCFA } from '@/lib/i18n/messages'

export type RiskLevel = 'low' | 'medium' | 'high'

export type RiskInput = {
  currentAverage:      number | null  // /20, current period
  previousAverage:     number | null  // /20, previous period (if any)
  failedSubjects:      number         // subjects with avg < 10 this period
  rank:                number | null
  previousRank:        number | null
  classSize:           number
  absences:            number
  lates:               number
  unpaidInvoices:      number
  overdueBalance:      number         // FCFA
  disciplineIncidents: number         // 0 when no discipline module
}

export type RiskResult = {
  level:   RiskLevel
  score:   number      // 0–100
  reasons: string[]
  actions: string[]
}

// Phase 10F: wording comes from the deterministic i18n catalog (default 'fr' →
// byte-identical to the original). Business logic is unchanged.
export function assessRisk(input: RiskInput, locale: Locale = 'fr'): RiskResult {
  let score = 0
  const reasons: string[] = []
  const actions = new Set<string>()

  // ── Academic ────────────────────────────────────────────────────────────────
  if (input.currentAverage !== null) {
    if (input.currentAverage < 8) { score += 30; reasons.push(trRisk(locale, 'avgVeryLow', { avg: input.currentAverage })) }
    else if (input.currentAverage < 10) { score += 22; reasons.push(trRisk(locale, 'avgBelow', { avg: input.currentAverage })) }
    else if (input.currentAverage < 12) { score += 8; reasons.push(trRisk(locale, 'avgBorder', { avg: input.currentAverage })) }
  }
  if (input.currentAverage !== null && input.previousAverage !== null) {
    const drop = Math.round((input.previousAverage - input.currentAverage) * 10) / 10
    if (drop >= 2) { score += 20; reasons.push(trRisk(locale, 'dropMajor', { d: drop })) }
    else if (drop >= 1) { score += 10; reasons.push(trRisk(locale, 'dropMinor', { d: drop })) }
  }
  if (input.failedSubjects >= 3) { score += 20; reasons.push(trRisk(locale, 'failedMany', { n: input.failedSubjects })) }
  else if (input.failedSubjects >= 1) { score += 10; reasons.push(trRisk(locale, 'failedFew', { n: input.failedSubjects })) }
  if (input.rank !== null && input.previousRank !== null && input.rank - input.previousRank >= 5) {
    score += 8; reasons.push(trRisk(locale, 'rankDrop'))
  }
  if (input.failedSubjects >= 1 || (input.currentAverage !== null && input.currentAverage < 10)) {
    actions.add(trRisk(locale, 'planSupport'))
  }

  // ── Attendance ──────────────────────────────────────────────────────────────
  if (input.absences >= 8) { score += 20; reasons.push(trRisk(locale, 'absences', { n: input.absences })) }
  else if (input.absences >= 4) { score += 12; reasons.push(trRisk(locale, 'absences', { n: input.absences })) }
  else if (input.absences >= 1) { score += 4 }
  if (input.lates >= 5) { score += 8; reasons.push(trRisk(locale, 'lates', { n: input.lates })) }
  if (input.absences >= 4 || input.lates >= 5) actions.add(trRisk(locale, 'checkAbsences'))

  // ── Finance ─────────────────────────────────────────────────────────────────
  if (input.overdueBalance > 0) { score += 10; reasons.push(trRisk(locale, 'overdue', { amount: fmtFCFA(input.overdueBalance) })); actions.add(trRisk(locale, 'contactFees')) }
  else if (input.unpaidInvoices >= 1) { score += 5; reasons.push(trRisk(locale, 'unpaid', { n: input.unpaidInvoices })) }

  // ── Behaviour (only if a discipline signal exists) ──────────────────────────
  if (input.disciplineIncidents >= 1) { score += 10; reasons.push(trRisk(locale, 'discipline', { n: input.disciplineIncidents })) }

  score = Math.min(100, score)
  const level: RiskLevel = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'

  if (level === 'high') { actions.add(trRisk(locale, 'summonParents')); actions.add(trRisk(locale, 'closeFollowup')) }
  else if (level === 'medium') { actions.add(trRisk(locale, 'individualMeeting')); actions.add(trRisk(locale, 'principalFollowup')) }

  return { level, score, reasons, actions: Array.from(actions) }
}
