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

// en/wo (Phase 10F) ───────────────────────────────────────────────────────────
// Single-phrasing localized builders (variant cycling is a French feature). Same
// data-gated structure as fr; the teacher reviews and edits before approval.

function joinList(names: string[], conj: string): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} ${conj} ${names[names.length - 1]}`
}

function buildEn(i: CommentInput): string {
  const n = i.firstName, a = i.average
  let t = a === null ? `${n}'s assessment data is insufficient to compute a mark this term.`
    : a >= 16 ? `${n} has an excellent term with an average of ${a}/20.`
    : a >= 14 ? `${n} achieves good results this term, with an average of ${a}/20.`
    : a >= 12 ? `${n} shows satisfactory results, with an average of ${a}/20.`
    : a >= 10 ? `${n} obtains an average of ${a}/20 — fair results that need consolidating.`
    : `${n} is struggling this term, with an average of ${a}/20.`
  if (a !== null && i.previousAverage !== null) {
    const d = Math.round((a - i.previousAverage) * 10) / 10
    if (d >= 1) t += ` Clear progress (+${d} from the previous term).`
    else if (d <= -1) t += ` Results are down (${d}) from the previous term.`
    else t += ' Results are stable compared with the previous term.'
  }
  if (i.rank !== null && i.classSize > 1) {
    if (i.rank <= 3) t += ` ${n} ranks among the top of the class (${i.rank}/${i.classSize}).`
    else if (i.rank / i.classSize <= 0.5) t += ` The ranking (${i.rank}/${i.classSize}) places ${n} in the top half of the class.`
  }
  if (i.strongSubjects.length) t += ` Results are especially solid in ${joinList(i.strongSubjects, 'and')}.`
  if (i.weakSubjects.length) t += ` Sustained effort is expected in ${joinList(i.weakSubjects, 'and')}.`
  if (i.absences >= 5 || (i.attendanceRate !== null && i.attendanceRate < 85)) t += ` Attendance must improve (${i.absences} absence${i.absences > 1 ? 's' : ''} recorded).`
  else if (i.absences >= 1 || i.lates >= 3) t += ` Attendance should be watched (${i.absences} absence${i.absences > 1 ? 's' : ''}${i.lates > 0 ? `, ${i.lates} late arrival${i.lates > 1 ? 's' : ''}` : ''}).`
  else if (i.attendanceRate !== null && i.attendanceRate >= 98) t += ' Attendance is exemplary.'
  if (a !== null) t += a >= 14 ? ' Keep it up.' : a >= 10 ? ' Regular effort will bring progress.' : ' Close support and sustained work are needed.'
  return t
}

function buildWo(i: CommentInput): string {
  const n = i.firstName, a = i.average
  let t = a === null ? `Jukki yu ${n} doy-uñu ngir jël moyenn ci trimestre bii.`
    : a >= 16 ? `${n} def na trimestre bu rafet, moyenn bu ${a}/20.`
    : a >= 14 ? `${n} am na njariñ yu baax ci trimestre bii, moyenn bu ${a}/20.`
    : a >= 12 ? `${n} am na njariñ yu doy, moyenn bu ${a}/20.`
    : a >= 10 ? `${n} am na moyenn bu ${a}/20, njariñ yu war a dëgëral.`
    : `${n} am na jafe-jafe ci trimestre bii, moyenn bu ${a}/20.`
  if (a !== null && i.previousAverage !== null) {
    const d = Math.round((a - i.previousAverage) * 10) / 10
    if (d >= 1) t += ` Yokkute bu leer (+${d} ci trimestre bi weesu).`
    else if (d <= -1) t += ` Njariñ yi wàññiku nañu (${d}) ci trimestre bi weesu.`
    else t += ' Njariñ yi sax nañu ni trimestre bi weesu.'
  }
  if (i.rank !== null && i.classSize > 1) {
    if (i.rank <= 3) t += ` ${n} nekk na ci njiit yi ci kalaas bi (${i.rank}/${i.classSize}).`
    else if (i.rank / i.classSize <= 0.5) t += ` Classement bi (${i.rank}/${i.classSize}) teg na ${n} ci genn-wàll bu njëkk bi.`
  }
  if (i.strongSubjects.length) t += ` Njariñ yi dëgër nañu lool ci ${joinList(i.strongSubjects, 'ak')}.`
  if (i.weakSubjects.length) t += ` Coono bu sax ñu ngi xaar ci ${joinList(i.weakSubjects, 'ak')}.`
  if (i.absences >= 5 || (i.attendanceRate !== null && i.attendanceRate < 85)) t += ` Teew bi war na gën a baax (${i.absences} absence).`
  else if (i.absences >= 1 || i.lates >= 3) t += ` War nañoo topp teew bi (${i.absences} absence${i.lates > 0 ? `, ${i.lates} yeegu` : ''}).`
  else if (i.attendanceRate !== null && i.attendanceRate >= 98) t += ' Teew bi mat na sëkk.'
  if (a !== null) t += a >= 14 ? ' Wéyal noonu.' : a >= 10 ? ' Liggéey bu sax dina indi yokkute.' : ' Ndimbal ak liggéey bu sax a soxla.'
  return t
}

export function generateBulletinComment(input: CommentInput): string {
  const v = input.variant ?? 0
  let text: string
  if (input.locale === 'en') text = buildEn(input)
  else if (input.locale === 'wo') text = buildWo(input)
  else {
    // French (canonical) — variant-aware, byte-identical to the original.
    text = [openingFr(input, v), trendFr(input, v), rankFr(input, v), subjectsFr(input, v), attendanceFr(input, v), closingFr(input, v)].join('')
  }
  text = text.replace(/\s+/g, ' ').trim()

  // Teacher's own observation is appended verbatim (never altered/invented).
  const obs = input.observations.trim()
  if (obs) text += ` ${obs}`

  return text
}
