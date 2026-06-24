// ─── Parent Narrative Engine (Phase 10E — deterministic, no LLM) ─────────────
//
// Pure: turns a ParentSnapshot into grounded, plain-French sections for the
// parent Copilot. NEVER accesses the database; same snapshot ⇒ same narrative
// (only meta.generatedAt, from the snapshot, reflects load time). Reuses the
// Phase 10A CopilotMetadata contract. Supports a single-child focus for
// multi-child parents.

import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { ParentSnapshot, ChildSummary } from './parent-snapshot'
import type { Locale } from '@/lib/i18n/locale'
import { trParent, parentAppreciation, fmtFCFA as fmtMoney, fmtDateShort } from '@/lib/i18n/messages'

export type ParentSectionKey = 'enfants' | 'scolarite' | 'presences' | 'devoirs' | 'paiements' | 'transport' | 'messages'
export type ParentSection = { key: ParentSectionKey; heading: string; lines: string[] }

export type ParentNarrative = {
  headline: string
  sections: ParentSection[]
  priorities: string[]
  meta: CopilotMetadata
}

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

const tag = (c: ChildSummary, multi: boolean) => (multi ? `${c.firstName} : ` : '')

export function generateParentNarrative(s: ParentSnapshot, locale: Locale = 'fr', opts?: { childId?: string }): ParentNarrative {
  const confidence: CopilotConfidence = !s.hasChildren ? 'low' : s.children.some((c) => c.average !== null) ? 'high' : 'medium'
  const meta: CopilotMetadata = { provider: 'deterministic', locale, sources: SOURCES, confidence, generatedAt: s.generatedAt }

  if (!s.hasChildren) {
    return {
      headline: trParent(locale, 'emptyHeadline'),
      sections: [{ key: 'enfants', heading: trParent(locale, 'headEnfants'), lines: [trParent(locale, 'emptyEnfants')] }],
      priorities: [trParent(locale, 'emptyPriority')],
      meta,
    }
  }

  const children = opts?.childId ? s.children.filter((c) => c.studentId === opts.childId) : s.children
  const multi = s.children.length > 1

  const enfants = children.map((c) => trParent(locale, 'enfantLine', { firstName: c.firstName, className: c.className, avg: c.average, rate: c.attendance.rate, watch: c.level !== 'low' }))

  const scolarite = children.map((c) => {
    if (c.average === null) return trParent(locale, 'scolNone', { tag: tag(c, multi) })
    return trParent(locale, 'scolLine', { tag: tag(c, multi), avg: c.average, appr: parentAppreciation(locale, c.average), watch: c.watch.length ? c.watch.slice(0, 2).join(' ; ') : '' })
  })

  const presences = children.map((c) => {
    if (c.attendance.rate === null) return trParent(locale, 'presNone', { tag: tag(c, multi) })
    const extra = [c.attendance.absent ? trParent(locale, 'absWord', { n: c.attendance.absent }) : '', c.attendance.late ? trParent(locale, 'lateWord', { n: c.attendance.late }) : ''].filter(Boolean).join(', ')
    return trParent(locale, 'presLine', { tag: tag(c, multi), rate: c.attendance.rate, extra })
  })

  const devoirs = children.map((c) => {
    if (c.homework.upcoming === 0) return trParent(locale, 'devNone', { tag: tag(c, multi) })
    const nextStr = c.homework.next
      ? trParent(locale, 'devNext', { subject: c.homework.next.subject, due: c.homework.next.due ? fmtDateShort(locale, c.homework.next.due) : trParent(locale, 'devDueNone') })
      : ''
    return trParent(locale, 'devLine', { tag: tag(c, multi), n: c.homework.upcoming, next: nextStr })
  })

  const paiements = children.map((c) => {
    if (c.finance.outstanding <= 0) return trParent(locale, 'payOk', { tag: tag(c, multi) })
    return trParent(locale, 'payLine', { tag: tag(c, multi), amount: fmtMoney(c.finance.outstanding), due: c.finance.nextDue ? fmtDateShort(locale, c.finance.nextDue.due) : '', od: c.finance.overdue > 0 ? fmtMoney(c.finance.overdue) : '' })
  })

  const transport = children.map((c) => {
    if (!c.transport) return trParent(locale, 'transNone', { tag: tag(c, multi) })
    return trParent(locale, 'transLine', { tag: tag(c, multi), route: c.transport.route, stop: c.transport.stop ?? '', pickup: c.transport.pickup ? c.transport.pickup.slice(0, 5) : '' })
  })

  const messages = s.messages.unread > 0
    ? [trParent(locale, 'msgUnread', { n: s.messages.unread }), ...s.messages.unreadFrom.map((m) => trParent(locale, 'msgFrom', { from: m.from, subject: m.subject }))]
    : [trParent(locale, 'msgNone')]

  const sections: ParentSection[] = [
    { key: 'enfants', heading: trParent(locale, 'headEnfants'), lines: enfants },
    { key: 'scolarite', heading: trParent(locale, 'headScolarite'), lines: scolarite },
    { key: 'presences', heading: trParent(locale, 'headPresences'), lines: presences },
    { key: 'devoirs', heading: trParent(locale, 'headDevoirs'), lines: devoirs },
    { key: 'paiements', heading: trParent(locale, 'headPaiements'), lines: paiements },
    { key: 'transport', heading: trParent(locale, 'headTransport'), lines: transport },
    { key: 'messages', heading: trParent(locale, 'headMessages'), lines: messages },
  ]

  // Priorities scoped to the visible children (+ parent-level messages).
  const overdue = children.reduce((a, c) => a + c.finance.overdue, 0)
  const upcomingHw = children.reduce((a, c) => a + c.homework.upcoming, 0)
  const watch = children.filter((c) => c.level !== 'low')
  const priorities: string[] = []
  if (overdue > 0) priorities.push(trParent(locale, 'prOverdue', { amount: fmtMoney(overdue) }))
  if (s.messages.unread > 0) priorities.push(trParent(locale, 'prMessages', { n: s.messages.unread }))
  if (watch.length > 0) priorities.push(trParent(locale, 'prWatch', { names: watch.map((c) => c.firstName).slice(0, 3).join(', ') }))
  if (upcomingHw > 0) priorities.push(trParent(locale, 'prHw', { n: upcomingHw, who: trParent(locale, multi && !opts?.childId ? 'whoChildren' : 'whoChild') }))
  if (priorities.length === 0) priorities.push(trParent(locale, 'prNone'))

  const single = opts?.childId && children[0]
  const headline = single
    ? trParent(locale, 'headlineSingle', { firstName: children[0].firstName, className: children[0].className, avg: children[0].average, rate: children[0].attendance.rate })
    : trParent(locale, 'headlineAll', { children: s.totals.children, watch: s.totals.watch || '', out: s.totals.outstanding > 0, amount: fmtMoney(s.totals.outstanding), unread: s.messages.unread || '' })

  return { headline, sections, priorities: priorities.slice(0, 4), meta }
}
