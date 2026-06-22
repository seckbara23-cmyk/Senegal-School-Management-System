// ─── Student risk engine (pure, derived, never persisted) ──────────────────────
//
// Maps a student's REAL platform signals (academic, attendance, finance and —
// when available — discipline) to a risk assessment. No score is ever stored;
// callers recompute on demand. View-only: it suggests interventions, it does not
// trigger them. Every reason/action is grounded in the input metrics.

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

function fmtFCFA(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'
}

export function assessRisk(input: RiskInput): RiskResult {
  let score = 0
  const reasons: string[] = []
  const actions = new Set<string>()

  // ── Academic ────────────────────────────────────────────────────────────────
  if (input.currentAverage !== null) {
    if (input.currentAverage < 8) { score += 30; reasons.push(`Moyenne très faible (${input.currentAverage}/20)`) }
    else if (input.currentAverage < 10) { score += 22; reasons.push(`Moyenne sous la moyenne (${input.currentAverage}/20)`) }
    else if (input.currentAverage < 12) { score += 8; reasons.push(`Moyenne juste (${input.currentAverage}/20)`) }
  }
  if (input.currentAverage !== null && input.previousAverage !== null) {
    const drop = Math.round((input.previousAverage - input.currentAverage) * 10) / 10
    if (drop >= 2) { score += 20; reasons.push(`Baisse de ${drop} points par rapport au trimestre précédent`) }
    else if (drop >= 1) { score += 10; reasons.push(`Légère baisse de ${drop} point${drop > 1 ? 's' : ''}`) }
  }
  if (input.failedSubjects >= 3) { score += 20; reasons.push(`${input.failedSubjects} matières en échec`) }
  else if (input.failedSubjects >= 1) { score += 10; reasons.push(`${input.failedSubjects} matière${input.failedSubjects > 1 ? 's' : ''} en échec`) }
  if (input.rank !== null && input.previousRank !== null && input.rank - input.previousRank >= 5) {
    score += 8; reasons.push('Recul important au classement')
  }
  if (input.failedSubjects >= 1 || (input.currentAverage !== null && input.currentAverage < 10)) {
    actions.add('Mettre en place un plan de soutien scolaire')
  }

  // ── Attendance ──────────────────────────────────────────────────────────────
  if (input.absences >= 8) { score += 20; reasons.push(`${input.absences} absences`) }
  else if (input.absences >= 4) { score += 12; reasons.push(`${input.absences} absences`) }
  else if (input.absences >= 1) { score += 4 }
  if (input.lates >= 5) { score += 8; reasons.push(`${input.lates} retards`) }
  if (input.absences >= 4 || input.lates >= 5) actions.add("Vérifier les causes des absences/retards avec la famille")

  // ── Finance ─────────────────────────────────────────────────────────────────
  if (input.overdueBalance > 0) { score += 10; reasons.push(`Solde en retard : ${fmtFCFA(input.overdueBalance)}`); actions.add('Contacter la famille pour régulariser les frais') }
  else if (input.unpaidInvoices >= 1) { score += 5; reasons.push(`${input.unpaidInvoices} facture${input.unpaidInvoices > 1 ? 's' : ''} impayée${input.unpaidInvoices > 1 ? 's' : ''}`) }

  // ── Behaviour (only if a discipline signal exists) ──────────────────────────
  if (input.disciplineIncidents >= 1) { score += 10; reasons.push(`${input.disciplineIncidents} incident${input.disciplineIncidents > 1 ? 's' : ''} de discipline`) }

  score = Math.min(100, score)
  const level: RiskLevel = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'

  if (level === 'high') { actions.add('Convoquer les parents'); actions.add('Suivi rapproché par le professeur principal') }
  else if (level === 'medium') { actions.add('Point individuel avec l’élève'); actions.add('Suivi par le professeur principal') }

  return { level, score, reasons, actions: Array.from(actions) }
}
