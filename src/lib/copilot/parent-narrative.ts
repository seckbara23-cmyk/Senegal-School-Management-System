// ─── Parent Narrative Engine (Phase 10E — deterministic, no LLM) ─────────────
//
// Pure: turns a ParentSnapshot into grounded, plain-French sections for the
// parent Copilot. NEVER accesses the database; same snapshot ⇒ same narrative
// (only meta.generatedAt, from the snapshot, reflects load time). Reuses the
// Phase 10A CopilotMetadata contract. Supports a single-child focus for
// multi-child parents.

import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { ParentSnapshot, ChildSummary } from './parent-snapshot'

export type ParentSectionKey = 'enfants' | 'scolarite' | 'presences' | 'devoirs' | 'paiements' | 'transport' | 'messages'
export type ParentSection = { key: ParentSectionKey; heading: string; lines: string[] }

export type ParentNarrative = {
  headline: string
  sections: ParentSection[]
  priorities: string[]
  meta: CopilotMetadata
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA'
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'sans échéance')

const SOURCES: CopilotSource[] = [
  { kind: 'children', label: 'Mes enfants' },
  { kind: 'grades', label: 'Notes' },
  { kind: 'attendance', label: 'Présences' },
  { kind: 'homework', label: 'Devoirs' },
  { kind: 'finance', label: 'Paiements' },
  { kind: 'transport', label: 'Transport' },
  { kind: 'messages', label: 'Messages' },
  { kind: 'risk_engine', label: 'Suivi' },
]

function appreciation(avg: number): string {
  if (avg >= 14) return 'très bon niveau'
  if (avg >= 12) return 'bon niveau'
  if (avg >= 10) return 'niveau moyen'
  return 'à soutenir'
}

const tag = (c: ChildSummary, multi: boolean) => (multi ? `${c.firstName} : ` : '')

export function generateParentNarrative(s: ParentSnapshot, opts?: { childId?: string }): ParentNarrative {
  const confidence: CopilotConfidence = !s.hasChildren ? 'low' : s.children.some((c) => c.average !== null) ? 'high' : 'medium'
  const meta: CopilotMetadata = { provider: 'deterministic', sources: SOURCES, confidence, generatedAt: s.generatedAt }

  if (!s.hasChildren) {
    return {
      headline: 'Aucun enfant n’est encore rattaché à votre compte.',
      sections: [{ key: 'enfants', heading: 'Mes enfants', lines: ['Contactez l’administration de l’école pour lier votre enfant.'] }],
      priorities: ['Demander à l’école de rattacher votre enfant.'],
      meta,
    }
  }

  const children = opts?.childId ? s.children.filter((c) => c.studentId === opts.childId) : s.children
  const multi = s.children.length > 1

  const enfants = children.map((c) => `${c.firstName} (${c.className})${c.average !== null ? ` — moyenne ${c.average}/20` : ''}${c.attendance.rate !== null ? ` · assiduité ${c.attendance.rate}%` : ''}${c.level !== 'low' ? ' · à surveiller' : ''}`)

  const scolarite = children.map((c) => {
    if (c.average === null) return `${tag(c, multi)}pas encore de notes pour la période.`
    const w = c.watch.length ? ` · ${c.watch.slice(0, 2).join(' ; ')}` : ''
    return `${tag(c, multi)}moyenne ${c.average}/20 (${appreciation(c.average)})${w}.`
  })

  const presences = children.map((c) => {
    if (c.attendance.rate === null) return `${tag(c, multi)}aucune présence enregistrée.`
    const extra = [c.attendance.absent ? `${c.attendance.absent} absence(s)` : '', c.attendance.late ? `${c.attendance.late} retard(s)` : ''].filter(Boolean).join(', ')
    return `${tag(c, multi)}${c.attendance.rate}% de présence${extra ? ` (${extra})` : ' — assiduité parfaite'}.`
  })

  const devoirs = children.map((c) => {
    if (c.homework.upcoming === 0) return `${tag(c, multi)}aucun devoir à venir.`
    const next = c.homework.next ? ` — prochain : ${c.homework.next.subject} (${fmtDate(c.homework.next.due)})` : ''
    return `${tag(c, multi)}${c.homework.upcoming} devoir(s) à venir${next}.`
  })

  const paiements = children.map((c) => {
    if (c.finance.outstanding <= 0) return `${tag(c, multi)}à jour.`
    const od = c.finance.overdue > 0 ? ` · ${fmt(c.finance.overdue)} en retard` : ''
    const due = c.finance.nextDue ? ` (échéance ${fmtDate(c.finance.nextDue.due)})` : ''
    return `${tag(c, multi)}${fmt(c.finance.outstanding)} à régler${due}${od}.`
  })

  const transport = children.map((c) => {
    if (!c.transport) return `${tag(c, multi)}aucun transport scolaire.`
    const pick = c.transport.pickup ? ` · ramassage ${c.transport.pickup.slice(0, 5)}` : ''
    return `${tag(c, multi)}${c.transport.route}${c.transport.stop ? ` · arrêt ${c.transport.stop}` : ''}${pick}.`
  })

  const messages = s.messages.unread > 0
    ? [`${s.messages.unread} message(s) non lu(s).`, ...s.messages.unreadFrom.map((m) => `${m.from} : ${m.subject}`)]
    : ['Aucun message non lu.']

  const sections: ParentSection[] = [
    { key: 'enfants', heading: 'Mes enfants', lines: enfants },
    { key: 'scolarite', heading: 'Scolarité', lines: scolarite },
    { key: 'presences', heading: 'Présences', lines: presences },
    { key: 'devoirs', heading: 'Devoirs', lines: devoirs },
    { key: 'paiements', heading: 'Paiements', lines: paiements },
    { key: 'transport', heading: 'Transport', lines: transport },
    { key: 'messages', heading: 'Messages', lines: messages },
  ]

  // Priorities scoped to the visible children (+ parent-level messages).
  const overdue = children.reduce((a, c) => a + c.finance.overdue, 0)
  const upcomingHw = children.reduce((a, c) => a + c.homework.upcoming, 0)
  const watch = children.filter((c) => c.level !== 'low')
  const priorities: string[] = []
  if (overdue > 0) priorities.push(`Régler les frais en retard (${fmt(overdue)}).`)
  if (s.messages.unread > 0) priorities.push(`Lire ${s.messages.unread} message(s) des enseignants.`)
  if (watch.length > 0) priorities.push(`Suivre la situation de ${watch.map((c) => c.firstName).slice(0, 3).join(', ')}.`)
  if (upcomingHw > 0) priorities.push(`${upcomingHw} devoir(s) à venir — vérifier avec ${multi && !opts?.childId ? 'vos enfants' : 'votre enfant'}.`)
  if (priorities.length === 0) priorities.push('Tout est en ordre cette semaine. 👍')

  const single = opts?.childId && children[0]
  const headline = single
    ? `${children[0].firstName} · ${children[0].className}${children[0].average !== null ? ` · moyenne ${children[0].average}/20` : ''}${children[0].attendance.rate !== null ? ` · assiduité ${children[0].attendance.rate}%` : ''}.`
    : `${s.totals.children} enfant(s)${s.totals.watch ? ` · ${s.totals.watch} à surveiller` : ''}${s.totals.outstanding > 0 ? ` · ${fmt(s.totals.outstanding)} à régler` : ''}${s.messages.unread ? ` · ${s.messages.unread} message(s) non lu(s)` : ''}.`

  return { headline, sections, priorities: priorities.slice(0, 4), meta }
}
