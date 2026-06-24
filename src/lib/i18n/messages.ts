// ─── Deterministic translation catalogs (Phase 10F) ──────────────────────────
//
// Wording-only dictionaries for the generated text (risk engine + the four
// Copilot narratives). French is canonical and reproduces the original strings
// byte-for-byte; English is complete; Wolof is a PILOT (review by a native
// speaker recommended). Entries are functions so each language handles its own
// grammar/pluralisation while the engines keep ALL business logic. No LLM, no
// external API — same input + locale ⇒ same output.

import type { Locale } from './locale'
import type { RiskLevel } from '@/lib/academic/risk-engine'

type V = Record<string, string | number | null | boolean>
type Entry = Record<Locale, (v: V) => string>
type Catalog = Record<string, Entry>

// Static-string helper (no interpolation).
const s = (fr: string, en: string, wo: string): Entry => ({ fr: () => fr, en: () => en, wo: () => wo })

function make(cat: Catalog) {
  return (locale: Locale, key: string, v: V = {}): string => {
    const e = cat[key]
    if (!e) return key
    return (e[locale] ?? e.fr)(v)
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────
export const fmtFCFA = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'

const LEVEL: Record<RiskLevel, Record<Locale, string>> = {
  low: { fr: 'faible', en: 'low', wo: 'tuuti' },
  medium: { fr: 'moyen', en: 'medium', wo: 'diggu' },
  high: { fr: 'élevé', en: 'high', wo: 'kawe' },
}
export const riskLevelLabel = (locale: Locale, level: RiskLevel) => LEVEL[level][locale] ?? LEVEL[level].fr

export function fmtDateShort(locale: Locale, iso: string | null): string {
  if (!iso) return ''
  const map: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB', wo: 'fr-FR' }
  return new Date(iso).toLocaleDateString(map[locale] ?? 'fr-FR', { day: 'numeric', month: 'short' })
}

// ── Risk engine ───────────────────────────────────────────────────────────────
const RISK: Catalog = {
  avgVeryLow:  { fr: (v) => `Moyenne très faible (${v.avg}/20)`, en: (v) => `Very low average (${v.avg}/20)`, wo: (v) => `Moyenn bu suuf lool (${v.avg}/20)` },
  avgBelow:    { fr: (v) => `Moyenne sous la moyenne (${v.avg}/20)`, en: (v) => `Below-average mark (${v.avg}/20)`, wo: (v) => `Moyenn bu suuf (${v.avg}/20)` },
  avgBorder:   { fr: (v) => `Moyenne juste (${v.avg}/20)`, en: (v) => `Borderline average (${v.avg}/20)`, wo: (v) => `Moyenn bu tolloo (${v.avg}/20)` },
  dropMajor:   { fr: (v) => `Baisse de ${v.d} points par rapport au trimestre précédent`, en: (v) => `Drop of ${v.d} points from the previous term`, wo: (v) => `Wàññ bu réy ci ${v.d} poñ ci trimestre bi weesu` },
  dropMinor:   { fr: (v) => `Légère baisse de ${v.d} point${Number(v.d) > 1 ? 's' : ''}`, en: (v) => `Slight drop of ${v.d} point${Number(v.d) > 1 ? 's' : ''}`, wo: (v) => `Wàññ bu tuuti ci ${v.d} poñ` },
  failedMany:  { fr: (v) => `${v.n} matières en échec`, en: (v) => `${v.n} subjects failing`, wo: (v) => `${v.n} matiere yu ñàkk` },
  failedFew:   { fr: (v) => `${v.n} matière${Number(v.n) > 1 ? 's' : ''} en échec`, en: (v) => `${v.n} subject${Number(v.n) > 1 ? 's' : ''} failing`, wo: (v) => `${v.n} matiere bu ñàkk` },
  rankDrop:    s('Recul important au classement', 'Significant drop in class ranking', 'Wàññ bu réy ci classement bi'),
  absences:    { fr: (v) => `${v.n} absences`, en: (v) => `${v.n} absences`, wo: (v) => `${v.n} absence` },
  lates:       { fr: (v) => `${v.n} retards`, en: (v) => `${v.n} late arrivals`, wo: (v) => `${v.n} yeegu` },
  overdue:     { fr: (v) => `Solde en retard : ${v.amount}`, en: (v) => `Overdue balance: ${v.amount}`, wo: (v) => `Bor bu weesu jamono: ${v.amount}` },
  unpaid:      { fr: (v) => `${v.n} facture${Number(v.n) > 1 ? 's' : ''} impayée${Number(v.n) > 1 ? 's' : ''}`, en: (v) => `${v.n} unpaid invoice${Number(v.n) > 1 ? 's' : ''}`, wo: (v) => `${v.n} faktur bu ñu fey-ul` },
  discipline:  { fr: (v) => `${v.n} incident${Number(v.n) > 1 ? 's' : ''} de discipline`, en: (v) => `${v.n} discipline incident${Number(v.n) > 1 ? 's' : ''}`, wo: (v) => `${v.n} jafe-jafe ci jikko` },
  // actions
  planSupport:      s('Mettre en place un plan de soutien scolaire', 'Set up an academic support plan', 'Defar benn plan ndimbal ci njàng'),
  checkAbsences:    s('Vérifier les causes des absences/retards avec la famille', 'Review absence/lateness causes with the family', 'Seet li waral absence/yeegu ak njaboot'),
  contactFees:      s('Contacter la famille pour régulariser les frais', 'Contact the family to settle the fees', 'Jokkoo ak njaboot ngir fey bor bi'),
  summonParents:    s('Convoquer les parents', 'Call the parents in', 'Woo waajur yi'),
  closeFollowup:    s('Suivi rapproché par le professeur principal', 'Close follow-up by the lead teacher', 'Topp gu gëdd ci jàngalekat bu mag'),
  individualMeeting: s('Point individuel avec l’élève', 'One-on-one with the student', 'Waxtaan ak xale bi'),
  principalFollowup: s('Suivi par le professeur principal', 'Follow-up by the lead teacher', 'Topp ci jàngalekat bu mag'),
}
export const trRisk = make(RISK)

// ── Student narrative ─────────────────────────────────────────────────────────
const STUDENT: Catalog = {
  headScolarite: s('Scolarité', 'Academics', 'Njàng'),
  headAssiduite: s('Assiduité', 'Attendance', 'Teew'),
  headFinance:   s('Finance', 'Finance', 'Xaalis'),
  headRisque:    s('Suivi & risque', 'Monitoring & risk', 'Topp & risk'),
  appr14: s('très bon niveau', 'very good level', 'xam-xam bu baax lool'),
  appr12: s('bon niveau', 'good level', 'xam-xam bu baax'),
  appr10: s('niveau moyen', 'average level', 'xam-xam bu diggu'),
  appr8:  s('en difficulté', 'struggling', 'am jafe-jafe'),
  appr0:  s('en grande difficulté', 'in serious difficulty', 'am jafe-jafe bu réy'),
  acadLine:  { fr: (v) => `Moyenne générale : ${v.avg}/20 (${v.appr}).`, en: (v) => `Overall average: ${v.avg}/20 (${v.appr}).`, wo: (v) => `Moyenn gu mag: ${v.avg}/20 (${v.appr}).` },
  acadNone:  s('Aucune moyenne disponible pour la période active.', 'No average available for the current term.', 'Amul moyenn ci jamono ji.'),
  attNone:   s('Assiduité sans signal particulier.', 'Attendance with no particular concern.', 'Teew bu baax, amul jafe-jafe.'),
  finDue:    { fr: (v) => `Solde dû : ${v.amount}.`, en: (v) => `Balance due: ${v.amount}.`, wo: (v) => `Bor: ${v.amount}.` },
  finOk:     s('Situation financière à jour.', 'Account up to date.', 'Xaalis bi yemboo na.'),
  riskLine:  { fr: (v) => `Niveau de risque global : ${v.level} (score ${v.score}/100).`, en: (v) => `Overall risk level: ${v.level} (score ${v.score}/100).`, wo: (v) => `Risk gu mag: ${v.level} (njumte ${v.score}/100).` },
  recNone:   s('Aucune action particulière — poursuivre le suivi habituel.', 'No specific action — continue the usual follow-up.', 'Amul lu war — topp ci li ñu dund.'),
  headline:  {
    fr: (v) => `${v.className} · ${v.avg !== null ? `moyenne ${v.avg}/20 · ` : ''}risque ${v.level}${v.out ? ` · ${v.amount} dû` : ''}.`,
    en: (v) => `${v.className} · ${v.avg !== null ? `average ${v.avg}/20 · ` : ''}${v.level} risk${v.out ? ` · ${v.amount} due` : ''}.`,
    wo: (v) => `${v.className} · ${v.avg !== null ? `moyenn ${v.avg}/20 · ` : ''}risk ${v.level}${v.out ? ` · ${v.amount} bor` : ''}.`,
  },
  recHead: s('Actions recommandées', 'Recommended actions', 'Jëf yu ñu digal'),
}
export const trStudent = make(STUDENT)
export function studentAppreciation(locale: Locale, avg: number): string {
  const k = avg >= 14 ? 'appr14' : avg >= 12 ? 'appr12' : avg >= 10 ? 'appr10' : avg >= 8 ? 'appr8' : 'appr0'
  return trStudent(locale, k)
}

// ── Executive narrative ───────────────────────────────────────────────────────
const EXEC: Catalog = {
  headline: { fr: (v) => `${v.students} élèves · assiduité ${v.rate}% · recouvrement ${v.collection}% · ${v.watch} élève(s) à surveiller.`, en: (v) => `${v.students} students · attendance ${v.rate}% · collection ${v.collection}% · ${v.watch} student(s) to watch.`, wo: (v) => `${v.students} xale · teew ${v.rate}% · ñakk ${v.collection}% · ${v.watch} xale yu ñu war topp.` },
  emptyHeadline: s('Données insuffisantes pour une synthèse — inscrivez des élèves pour l’activer.', 'Not enough data for a summary — enrol students to activate it.', 'Dataset bu doy-ul — bindal xale yi ngir tàmbali.'),
  emptyPriority: s('Terminer la configuration de l’école et inscrire les élèves.', 'Finish setting up the school and enrol students.', 'Mottali konfigurasiyon bi te bindal xale yi.'),
  attLow:    { fr: (v) => `Assiduité à ${v.rate}% (sous l’objectif de 90 %).`, en: (v) => `Attendance at ${v.rate}% (below the 90% target).`, wo: (v) => `Teew ci ${v.rate}% (suuf 90%).` },
  attWorst:  { fr: (v) => `Classe la moins assidue : ${v.name} (${v.rate}%).`, en: (v) => `Least-attending class: ${v.name} (${v.rate}%).`, wo: (v) => `Kalaas bi gën a ñàkk teew: ${v.name} (${v.rate}%).` },
  avgLow:    { fr: (v) => `Moyenne générale faible : ${v.avg}/20.`, en: (v) => `Low overall average: ${v.avg}/20.`, wo: (v) => `Moyenn gu mag bu suuf: ${v.avg}/20.` },
  passLow:   { fr: (v) => `Taux de réussite à ${v.rate}%.`, en: (v) => `Pass rate at ${v.rate}%.`, wo: (v) => `Taux teynu ci ${v.rate}%.` },
  weakSubj:  { fr: (v) => `Matière en difficulté : ${v.name} (${v.avg}/20).`, en: (v) => `Struggling subject: ${v.name} (${v.avg}/20).`, wo: (v) => `Matiere bu jafe: ${v.name} (${v.avg}/20).` },
  collLow:   { fr: (v) => `Recouvrement à ${v.rate}%${v.clause}.`, en: (v) => `Collection at ${v.rate}%${v.clause}.`, wo: (v) => `Ñakk ci ${v.rate}%${v.clause}.` },
  collLowClause: { fr: (v) => ` · ${v.amount} en attente`, en: (v) => ` · ${v.amount} outstanding`, wo: (v) => ` · ${v.amount} di xaar` },
  overdue:   { fr: (v) => `Impayés en retard : ${v.amount}.`, en: (v) => `Overdue unpaid fees: ${v.amount}.`, wo: (v) => `Bor bu weesu: ${v.amount}.` },
  riskHigh:  { fr: (v) => `${v.n} élève(s) à risque élevé.`, en: (v) => `${v.n} student(s) at high risk.`, wo: (v) => `${v.n} xale ci risk gu kawe.` },
  engLow:    { fr: (v) => `Engagement parental faible (${v.low}/${v.parents} familles peu actives).`, en: (v) => `Low parent engagement (${v.low}/${v.parents} families barely active).`, wo: (v) => `Njaboot yi ñàkk jëf (${v.low}/${v.parents}).` },
  admPending: { fr: (v) => `${v.n} candidature(s) en attente de traitement.`, en: (v) => `${v.n} application(s) awaiting processing.`, wo: (v) => `${v.n} ñaan yu di xaar.` },
  posAtt:    { fr: (v) => `Excellente assiduité (${v.rate}%).`, en: (v) => `Excellent attendance (${v.rate}%).`, wo: (v) => `Teew bu baax lool (${v.rate}%).` },
  posPass:   { fr: (v) => `Bon taux de réussite (${v.rate}%).`, en: (v) => `Good pass rate (${v.rate}%).`, wo: (v) => `Taux teynu bu baax (${v.rate}%).` },
  posAvg:    { fr: (v) => `Bonne moyenne générale (${v.avg}/20).`, en: (v) => `Good overall average (${v.avg}/20).`, wo: (v) => `Moyenn gu mag bu baax (${v.avg}/20).` },
  posBest:   { fr: (v) => `Classe en tête : ${v.name} (${v.avg}/20).`, en: (v) => `Top class: ${v.name} (${v.avg}/20).`, wo: (v) => `Kalaas bu jiitu: ${v.name} (${v.avg}/20).` },
  posColl:   { fr: (v) => `Recouvrement solide (${v.rate}%).`, en: (v) => `Strong collection (${v.rate}%).`, wo: (v) => `Ñakk bu dëgër (${v.rate}%).` },
  posNoRisk: s('Aucun élève à risque détecté.', 'No at-risk students detected.', 'Amul xale ci risk.'),
  posEng:    { fr: (v) => `Engagement parental encourageant (${v.engaged}/${v.parents} familles actives).`, en: (v) => `Encouraging parent engagement (${v.engaged}/${v.parents} active families).`, wo: (v) => `Njaboot yi ñëw ci jëf (${v.engaged}/${v.parents}).` },
  prRisk:    { fr: (v) => `Suivre ${v.n} élève(s) à risque élevé via la cellule de soutien${v.ex ? ` (ex. ${v.ex})` : ''}.`, en: (v) => `Follow ${v.n} high-risk student(s) via the support unit${v.ex ? ` (e.g. ${v.ex})` : ''}.`, wo: (v) => `Topp ${v.n} xale ci risk gu kawe${v.ex ? ` (mel ni ${v.ex})` : ''}.` },
  prOverdue: { fr: (v) => `Relancer les familles en retard de paiement (${v.amount}).`, en: (v) => `Chase families behind on payment (${v.amount}).`, wo: (v) => `Fattali njaboot yi weesu fey (${v.amount}).` },
  prAtt:     { fr: (v) => `Vérifier l’assiduité en ${v.name} (${v.rate}%).`, en: (v) => `Check attendance in ${v.name} (${v.rate}%).`, wo: (v) => `Seet teew bi ci ${v.name} (${v.rate}%).` },
  prAdm:     { fr: (v) => `Traiter ${v.n} candidature(s) en attente.`, en: (v) => `Process ${v.n} pending application(s).`, wo: (v) => `Saafara ${v.n} ñaan yu di xaar.` },
  prWeakSubj: { fr: (v) => `Organiser un soutien en ${v.name}.`, en: (v) => `Arrange support in ${v.name}.`, wo: (v) => `Defar ndimbal ci ${v.name}.` },
  prNone:    s('Aucune urgence cette semaine — maintenir le suivi habituel.', 'Nothing urgent this week — keep the usual follow-up.', 'Amul lu gaaw ci ayubés bii — topp ci li ñu dund.'),
  recAcad:   { fr: (v) => `Renforcer le soutien scolaire${v.clause}.`, en: (v) => `Strengthen academic support${v.clause}.`, wo: (v) => `Dolli ndimbal ci njàng${v.clause}.` },
  recAcadClause: { fr: (v) => ` (priorité : ${v.name})`, en: (v) => ` (priority: ${v.name})`, wo: (v) => ` (jëkk: ${v.name})` },
  recFinance: s('Déployer des rappels de paiement et proposer des échéanciers.', 'Roll out payment reminders and offer instalment plans.', 'Yónnee rappel fey te jox plan fey ci jamono.'),
  recAtt:    s('Mettre en place un suivi rapproché de l’assiduité.', 'Set up close attendance monitoring.', 'Defar topp gu gëdd ci teew bi.'),
  recEng:    s('Encourager l’usage du portail parent (notifications, messagerie).', 'Encourage use of the parent portal (notifications, messaging).', 'Xiir njaboot yi ci jëfandikoo portal bi.'),
  recPlans:  s('Introduire des échéanciers de paiement pour lisser la trésorerie.', 'Introduce payment instalments to smooth cash flow.', 'Tëral plan fey ngir yombal koppar gi.'),
  recNone:   s('Poursuivre la dynamique actuelle.', 'Keep up the current momentum.', 'Wéyal ni mu deme nii.'),
}
export const trExec = make(EXEC)

// ── Teacher narrative ─────────────────────────────────────────────────────────
const TEACHER: Catalog = {
  headCours:     s('Mes cours du jour', 'My lessons today', 'Sama jàng yu tey'),
  headClasses:   s('Mes classes', 'My classes', 'Sama kalaas yi'),
  headWatch:     s('Élèves à surveiller', 'Students to watch', 'Xale yu ñu war topp'),
  headDevoirs:   s('Devoirs récents', 'Recent homework', 'Devuwaar yu mujj'),
  headPresences: s('Présences à compléter', 'Attendance to complete', 'Teew yu ñu war mottali'),
  emptyHeadline: s('Aucune matière ne vous est encore assignée.', 'No subject is assigned to you yet.', 'Amul matiere ñu la jox.'),
  emptyClasses:  s('L’administrateur doit vous attribuer des matières dans les classes.', 'The administrator must assign you subjects in the classes.', 'Administrateur bi war na la jox matiere ci kalaas yi.'),
  emptyPriority: s('Contacter l’administration pour vos attributions.', 'Contact the administration about your assignments.', 'Jokkoo ak administrasiyon ngir say matiere.'),
  coursNone:  s('Aucun cours programmé aujourd’hui.', 'No lesson scheduled today.', 'Amul jàng tey.'),
  coursLine:  { fr: (v) => `${v.time} · ${v.subject} · ${v.classLabel}${v.room ? ` (${v.room})` : ''}`, en: (v) => `${v.time} · ${v.subject} · ${v.classLabel}${v.room ? ` (${v.room})` : ''}`, wo: (v) => `${v.time} · ${v.subject} · ${v.classLabel}${v.room ? ` (${v.room})` : ''}` },
  classLine:  { fr: (v) => `${v.label} · ${v.students} élève(s)${v.subjects ? ` · ${v.subjects}` : ''}`, en: (v) => `${v.label} · ${v.students} student(s)${v.subjects ? ` · ${v.subjects}` : ''}`, wo: (v) => `${v.label} · ${v.students} xale${v.subjects ? ` · ${v.subjects}` : ''}` },
  classesNone: s('Aucune classe.', 'No class.', 'Amul kalaas.'),
  watchLine:  { fr: (v) => `${v.name} (${v.classLabel}) — risque ${v.level}${v.reasons ? ` : ${v.reasons}` : ''}`, en: (v) => `${v.name} (${v.classLabel}) — ${v.level} risk${v.reasons ? ` : ${v.reasons}` : ''}`, wo: (v) => `${v.name} (${v.classLabel}) — risk ${v.level}${v.reasons ? ` : ${v.reasons}` : ''}` },
  watchNone:  s('Aucun élève à surveiller dans vos classes.', 'No student to watch in your classes.', 'Amul xale ñu war topp ci say kalaas.'),
  hwLine:     { fr: (v) => `${v.title} · ${v.classLabel} · ${v.due}`, en: (v) => `${v.title} · ${v.classLabel} · ${v.due}`, wo: (v) => `${v.title} · ${v.classLabel} · ${v.due}` },
  hwNone:     s('Aucun devoir publié.', 'No homework published.', 'Amul devuwaar bu ñu génne.'),
  attLine:    { fr: (v) => `${v.classLabel} — présences à saisir aujourd’hui`, en: (v) => `${v.classLabel} — attendance to record today`, wo: (v) => `${v.classLabel} — teew yu ñu war bind tey` },
  attOk:      s('Présences du jour à jour.', 'Today’s attendance is up to date.', 'Teew yu tey yemboo nañu.'),
  dueNone:    s('sans échéance', 'no due date', 'amul jamono'),
  dueOn:      { fr: (v) => `échéance ${v.date}`, en: (v) => `due ${v.date}`, wo: (v) => `jamono ${v.date}` },
  prAtt:      { fr: (v) => `Saisir les présences manquantes (${v.n} classe(s) aujourd’hui).`, en: (v) => `Record the missing attendance (${v.n} class(es) today).`, wo: (v) => `Bind teew yu des (${v.n} kalaas tey).` },
  prGrading:  { fr: (v) => `Terminer la notation de ${v.n} évaluation(s).`, en: (v) => `Finish grading ${v.n} assessment(s).`, wo: (v) => `Mottali nota ${v.n} kontaroli.` },
  prWatch:    { fr: (v) => `Accompagner ${v.n} élève(s) en difficulté${v.ex ? ` (ex. ${v.ex})` : ''}.`, en: (v) => `Support ${v.n} struggling student(s)${v.ex ? ` (e.g. ${v.ex})` : ''}.`, wo: (v) => `Dimbali ${v.n} xale yu am jafe-jafe${v.ex ? ` (mel ni ${v.ex})` : ''}.` },
  prNoHw:     s('Aucun devoir donné cette semaine — en prévoir si pertinent.', 'No homework set this week — plan some if relevant.', 'Amul devuwaar ci ayubés bii — xalaatal su soobee.'),
  prNone:     s('Aucune tâche urgente — tout est à jour. 👍', 'No urgent task — everything is up to date. 👍', 'Amul liggéey bu gaaw — lépp yemboo na. 👍'),
  headline:   { fr: (v) => `${v.classes} classe(s) · ${v.subjects} matière(s) · ${v.students} élève(s)${v.cours ? ` · ${v.cours} cours aujourd’hui` : ''}.`, en: (v) => `${v.classes} class(es) · ${v.subjects} subject(s) · ${v.students} student(s)${v.cours ? ` · ${v.cours} lesson(s) today` : ''}.`, wo: (v) => `${v.classes} kalaas · ${v.subjects} matiere · ${v.students} xale${v.cours ? ` · ${v.cours} jàng tey` : ''}.` },
}
export const trTeacher = make(TEACHER)

// ── Parent narrative ──────────────────────────────────────────────────────────
const PARENT: Catalog = {
  headEnfants:   s('Mes enfants', 'My children', 'Samay doom'),
  headScolarite: s('Scolarité', 'Academics', 'Njàng'),
  headPresences: s('Présences', 'Attendance', 'Teew'),
  headDevoirs:   s('Devoirs', 'Homework', 'Devuwaar'),
  headPaiements: s('Paiements', 'Payments', 'Fey'),
  headTransport: s('Transport', 'Transport', 'Transpoor'),
  headMessages:  s('Messages', 'Messages', 'Bataaxal'),
  emptyHeadline: s('Aucun enfant n’est encore rattaché à votre compte.', 'No child is linked to your account yet.', 'Amul doom bu boole ak sa kont.'),
  emptyEnfants:  s('Contactez l’administration de l’école pour lier votre enfant.', 'Contact the school administration to link your child.', 'Jokkoo ak ekol bi ngir boole sa doom.'),
  emptyPriority: s('Demander à l’école de rattacher votre enfant.', 'Ask the school to link your child.', 'Ñaanal ekol bi mu boole sa doom.'),
  appr14: s('très bon niveau', 'very good level', 'xam-xam bu baax lool'),
  appr12: s('bon niveau', 'good level', 'xam-xam bu baax'),
  appr10: s('niveau moyen', 'average level', 'xam-xam bu diggu'),
  appr0:  s('à soutenir', 'needs support', 'soxla ndimbal'),
  enfantLine: { fr: (v) => `${v.firstName} (${v.className})${v.avg !== null ? ` — moyenne ${v.avg}/20` : ''}${v.rate !== null ? ` · assiduité ${v.rate}%` : ''}${v.watch ? ' · à surveiller' : ''}`, en: (v) => `${v.firstName} (${v.className})${v.avg !== null ? ` — average ${v.avg}/20` : ''}${v.rate !== null ? ` · attendance ${v.rate}%` : ''}${v.watch ? ' · to watch' : ''}`, wo: (v) => `${v.firstName} (${v.className})${v.avg !== null ? ` — moyenn ${v.avg}/20` : ''}${v.rate !== null ? ` · teew ${v.rate}%` : ''}${v.watch ? ' · war topp' : ''}` },
  scolNone: { fr: (v) => `${v.tag}pas encore de notes pour la période.`, en: (v) => `${v.tag}no marks yet for the term.`, wo: (v) => `${v.tag}amul nota ci jamono ji.` },
  scolLine: { fr: (v) => `${v.tag}moyenne ${v.avg}/20 (${v.appr})${v.watch ? ` · ${v.watch}` : ''}.`, en: (v) => `${v.tag}average ${v.avg}/20 (${v.appr})${v.watch ? ` · ${v.watch}` : ''}.`, wo: (v) => `${v.tag}moyenn ${v.avg}/20 (${v.appr})${v.watch ? ` · ${v.watch}` : ''}.` },
  presNone: { fr: (v) => `${v.tag}aucune présence enregistrée.`, en: (v) => `${v.tag}no attendance recorded.`, wo: (v) => `${v.tag}amul teew bu ñu bind.` },
  presLine: { fr: (v) => `${v.tag}${v.rate}% de présence${v.extra ? ` (${v.extra})` : ' — assiduité parfaite'}.`, en: (v) => `${v.tag}${v.rate}% attendance${v.extra ? ` (${v.extra})` : ' — perfect attendance'}.`, wo: (v) => `${v.tag}${v.rate}% teew${v.extra ? ` (${v.extra})` : ' — teew bu mat'}.` },
  absWord:  { fr: (v) => `${v.n} absence(s)`, en: (v) => `${v.n} absence(s)`, wo: (v) => `${v.n} absence` },
  lateWord: { fr: (v) => `${v.n} retard(s)`, en: (v) => `${v.n} late arrival(s)`, wo: (v) => `${v.n} yeegu` },
  devNone:  { fr: (v) => `${v.tag}aucun devoir à venir.`, en: (v) => `${v.tag}no upcoming homework.`, wo: (v) => `${v.tag}amul devuwaar bu ñëw.` },
  devLine:  { fr: (v) => `${v.tag}${v.n} devoir(s) à venir${v.next ? ` — prochain : ${v.next}` : ''}.`, en: (v) => `${v.tag}${v.n} upcoming homework${v.next ? ` — next: ${v.next}` : ''}.`, wo: (v) => `${v.tag}${v.n} devuwaar bu ñëw${v.next ? ` — ci kanam: ${v.next}` : ''}.` },
  devNext:  { fr: (v) => `${v.subject} (${v.due})`, en: (v) => `${v.subject} (${v.due})`, wo: (v) => `${v.subject} (${v.due})` },
  devDueNone: s('sans échéance', 'no due date', 'amul jamono'),
  payOk:    { fr: (v) => `${v.tag}à jour.`, en: (v) => `${v.tag}up to date.`, wo: (v) => `${v.tag}yemboo na.` },
  payLine:  { fr: (v) => `${v.tag}${v.amount} à régler${v.due ? ` (échéance ${v.due})` : ''}${v.od ? ` · ${v.od} en retard` : ''}.`, en: (v) => `${v.tag}${v.amount} to pay${v.due ? ` (due ${v.due})` : ''}${v.od ? ` · ${v.od} overdue` : ''}.`, wo: (v) => `${v.tag}${v.amount} ñu war fey${v.due ? ` (jamono ${v.due})` : ''}${v.od ? ` · ${v.od} weesu` : ''}.` },
  transNone: { fr: (v) => `${v.tag}aucun transport scolaire.`, en: (v) => `${v.tag}no school transport.`, wo: (v) => `${v.tag}amul transpoor.` },
  transLine: { fr: (v) => `${v.tag}${v.route}${v.stop ? ` · arrêt ${v.stop}` : ''}${v.pickup ? ` · ramassage ${v.pickup}` : ''}.`, en: (v) => `${v.tag}${v.route}${v.stop ? ` · stop ${v.stop}` : ''}${v.pickup ? ` · pickup ${v.pickup}` : ''}.`, wo: (v) => `${v.tag}${v.route}${v.stop ? ` · taxaw ${v.stop}` : ''}${v.pickup ? ` · jël ${v.pickup}` : ''}.` },
  msgUnread: { fr: (v) => `${v.n} message(s) non lu(s).`, en: (v) => `${v.n} unread message(s).`, wo: (v) => `${v.n} bataaxal yu ñu jàng-ul.` },
  msgFrom:   { fr: (v) => `${v.from} : ${v.subject}`, en: (v) => `${v.from}: ${v.subject}`, wo: (v) => `${v.from} : ${v.subject}` },
  msgNone:   s('Aucun message non lu.', 'No unread message.', 'Amul bataaxal bu ñu jàng-ul.'),
  prOverdue: { fr: (v) => `Régler les frais en retard (${v.amount}).`, en: (v) => `Settle the overdue fees (${v.amount}).`, wo: (v) => `Fey bor bu weesu (${v.amount}).` },
  prMessages: { fr: (v) => `Lire ${v.n} message(s) des enseignants.`, en: (v) => `Read ${v.n} message(s) from teachers.`, wo: (v) => `Jàng ${v.n} bataaxal jàngalekat yi.` },
  prWatch:   { fr: (v) => `Suivre la situation de ${v.names}.`, en: (v) => `Keep an eye on ${v.names}.`, wo: (v) => `Topp njariñ ${v.names}.` },
  prHw:      { fr: (v) => `${v.n} devoir(s) à venir — vérifier avec ${v.who}.`, en: (v) => `${v.n} upcoming homework — check with ${v.who}.`, wo: (v) => `${v.n} devuwaar bu ñëw — seetal ak ${v.who}.` },
  prNone:    s('Tout est en ordre cette semaine. 👍', 'Everything is in order this week. 👍', 'Lépp yemboo na ci ayubés bii. 👍'),
  whoChildren: s('vos enfants', 'your children', 'say doom'),
  whoChild:    s('votre enfant', 'your child', 'sa doom'),
  headlineSingle: { fr: (v) => `${v.firstName} · ${v.className}${v.avg !== null ? ` · moyenne ${v.avg}/20` : ''}${v.rate !== null ? ` · assiduité ${v.rate}%` : ''}.`, en: (v) => `${v.firstName} · ${v.className}${v.avg !== null ? ` · average ${v.avg}/20` : ''}${v.rate !== null ? ` · attendance ${v.rate}%` : ''}.`, wo: (v) => `${v.firstName} · ${v.className}${v.avg !== null ? ` · moyenn ${v.avg}/20` : ''}${v.rate !== null ? ` · teew ${v.rate}%` : ''}.` },
  headlineAll: { fr: (v) => `${v.children} enfant(s)${v.watch ? ` · ${v.watch} à surveiller` : ''}${v.out ? ` · ${v.amount} à régler` : ''}${v.unread ? ` · ${v.unread} message(s) non lu(s)` : ''}.`, en: (v) => `${v.children} child(ren)${v.watch ? ` · ${v.watch} to watch` : ''}${v.out ? ` · ${v.amount} to pay` : ''}${v.unread ? ` · ${v.unread} unread message(s)` : ''}.`, wo: (v) => `${v.children} doom${v.watch ? ` · ${v.watch} war topp` : ''}${v.out ? ` · ${v.amount} ñu war fey` : ''}${v.unread ? ` · ${v.unread} bataaxal yu ñu jàng-ul` : ''}.` },
}
export const trParent = make(PARENT)
export function parentAppreciation(locale: Locale, avg: number): string {
  const k = avg >= 14 ? 'appr14' : avg >= 12 ? 'appr12' : avg >= 10 ? 'appr10' : 'appr0'
  return trParent(locale, k)
}
