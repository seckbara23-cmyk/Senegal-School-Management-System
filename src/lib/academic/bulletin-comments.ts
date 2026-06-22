// ─── Bulletin comment generator (deterministic, data-grounded, versioned) ──────
//
// Produces a professional French appreciation for a report card from the
// student's REAL platform metrics only. It assembles sentence fragments that are
// each gated on actual data — it can never invent a grade, an attendance figure
// or a behaviour issue. The teacher reviews, edits, regenerates and approves;
// nothing here is auto-published.
//
// Architecture for future expansion:
//   • COMMENT_TEMPLATE_VERSION is stored with every generated comment.
//   • `variant` cycles alternative phrasings (the "Régénérer" button).
//   • `locale` is part of the contract; only 'fr' templates exist today, with
//     'wo' (Wolof) and 'en' (English) falling back to 'fr' until added. A real
//     LLM provider could later implement generate() behind the same signature.
//   • Same input + same variant ⇒ same output (deterministic, testable).

export type CommentLocale = 'fr' | 'wo' | 'en'

export const COMMENT_TEMPLATE_VERSION = 'fr-v1'

export type CommentInput = {
  firstName:        string
  average:          number | null   // /20
  previousAverage:  number | null   // /20, previous period (if any)
  rank:             number | null
  classSize:        number
  mention:          string | null
  attendanceRate:   number | null   // %
  absences:         number
  lates:            number
  strongSubjects:   string[]        // subject names with avg ≥ 14
  weakSubjects:     string[]        // subject names with avg < 10
  observations:     string          // teacher-entered note (verbatim, optional)
  locale?:          CommentLocale
  variant?:         number
}

function pick<T>(arr: T[], variant: number): T {
  return arr[((variant % arr.length) + arr.length) % arr.length]
}

function joinFr(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

// fr-v1 templates ─────────────────────────────────────────────────────────────

function openingFr(input: CommentInput, v: number): string {
  const { firstName: n, average: a } = input
  if (a === null) {
    return pick([
      `Les éléments d'évaluation de ${n} sont insuffisants pour établir une appréciation chiffrée ce trimestre.`,
      `Faute d'évaluations suffisantes, la moyenne de ${n} n'a pas pu être calculée pour cette période.`,
    ], v)
  }
  if (a >= 16) return pick([
    `${n} réalise un excellent trimestre avec une moyenne de ${a}/20.`,
    `Trimestre remarquable pour ${n}, qui obtient ${a}/20.`,
  ], v)
  if (a >= 14) return pick([
    `${n} obtient de bons résultats ce trimestre, avec une moyenne de ${a}/20.`,
    `${n} signe un bon trimestre (${a}/20).`,
  ], v)
  if (a >= 12) return pick([
    `${n} présente des résultats satisfaisants, avec une moyenne de ${a}/20.`,
    `Trimestre correct pour ${n} (${a}/20).`,
  ], v)
  if (a >= 10) return pick([
    `${n} obtient une moyenne de ${a}/20, des résultats justes qui méritent d'être consolidés.`,
    `${n} se maintient à ${a}/20 ; les acquis restent fragiles.`,
  ], v)
  return pick([
    `${n} rencontre des difficultés ce trimestre, avec une moyenne de ${a}/20.`,
    `Trimestre difficile pour ${n} (${a}/20), qui doit se ressaisir.`,
  ], v)
}

function trendFr(input: CommentInput, v: number): string {
  const { average: a, previousAverage: p } = input
  if (a === null || p === null) return ''
  const d = Math.round((a - p) * 10) / 10
  if (d >= 1)  return pick([` La progression est nette (${d > 0 ? '+' : ''}${d} point${Math.abs(d) > 1 ? 's' : ''} par rapport au trimestre précédent).`, ` On note une belle progression (+${d}).`], v)
  if (d <= -1) return pick([` Les résultats sont en recul (${d} point${Math.abs(d) > 1 ? 's' : ''}) par rapport au trimestre précédent.`, ` Une baisse est à signaler (${d}) par rapport au trimestre dernier.`], v)
  return pick([' Les résultats restent stables par rapport au trimestre précédent.', ' Le niveau se maintient par rapport au trimestre dernier.'], v)
}

function rankFr(input: CommentInput, v: number): string {
  const { rank: r, classSize: cs } = input
  if (r === null || cs <= 1) return ''
  if (r <= 3) return pick([` ${input.firstName} se classe parmi les premiers de la classe (${r}${r === 1 ? 'er' : 'e'}/${cs}).`, ` Très bon classement : ${r}${r === 1 ? 'er' : 'e'} sur ${cs}.`], v)
  if (r / cs <= 0.5) return pick([` Le classement (${r}e/${cs}) situe ${input.firstName} dans la première moitié de la classe.`], v)
  return ''
}

function subjectsFr(input: CommentInput, v: number): string {
  let s = ''
  if (input.strongSubjects.length > 0) s += pick([` Les résultats sont particulièrement solides en ${joinFr(input.strongSubjects)}.`, ` ${input.firstName} se distingue en ${joinFr(input.strongSubjects)}.`], v)
  if (input.weakSubjects.length > 0)   s += pick([` Un effort soutenu est attendu en ${joinFr(input.weakSubjects)}.`, ` Des difficultés persistent en ${joinFr(input.weakSubjects)} et nécessitent un travail régulier.`], v)
  return s
}

function attendanceFr(input: CommentInput, v: number): string {
  const { absences, lates, attendanceRate: rate } = input
  if (absences >= 5 || (rate !== null && rate < 85)) {
    return pick([` L'assiduité doit impérativement s'améliorer (${absences} absence${absences > 1 ? 's' : ''} relevée${absences > 1 ? 's' : ''}).`, ` Les absences répétées (${absences}) nuisent à la progression et doivent cesser.`], v)
  }
  if (absences >= 1 || lates >= 3) {
    return pick([` Une vigilance est recommandée sur l'assiduité (${absences} absence${absences > 1 ? 's' : ''}${lates > 0 ? `, ${lates} retard${lates > 1 ? 's' : ''}` : ''}).`], v)
  }
  if (rate !== null && rate >= 98) return pick([" L'assiduité est exemplaire.", ' Aucune absence à signaler, assiduité exemplaire.'], v)
  return ''
}

function closingFr(input: CommentInput, v: number): string {
  const a = input.average
  if (a === null) return ''
  if (a >= 14) return pick([' Continuez ainsi.', " Félicitations et encouragements à poursuivre les efforts."], v)
  if (a >= 10) return pick([' Des efforts réguliers permettront de progresser.', ' Le travail doit se poursuivre pour consolider les acquis.'], v)
  return pick([' Un accompagnement et un travail soutenu sont nécessaires pour redresser la situation.', ' Une mobilisation rapide est indispensable.'], v)
}

export function generateBulletinComment(input: CommentInput): string {
  const v = input.variant ?? 0
  // Only 'fr' is implemented; other locales fall back to French for now.
  const parts = [
    openingFr(input, v),
    trendFr(input, v),
    rankFr(input, v),
    subjectsFr(input, v),
    attendanceFr(input, v),
    closingFr(input, v),
  ]
  let text = parts.join('').replace(/\s+/g, ' ').trim()

  // Teacher's own observation is appended verbatim (never altered/invented).
  const obs = input.observations.trim()
  if (obs) text += ` ${obs}`

  return text
}
