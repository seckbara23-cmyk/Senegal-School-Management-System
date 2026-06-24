// ─── Teacher Narrative Engine (Phase 10D — deterministic, no LLM) ────────────
//
// Pure: turns a TeacherSnapshot into grounded French sections for the teacher
// Copilot. NEVER accesses the database; same snapshot ⇒ same narrative (only
// meta.generatedAt, from the snapshot, reflects load time). Reuses the Phase 10A
// CopilotMetadata contract. No finance, no school-wide data — the snapshot only
// carries teacher-visible signals.

import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { TeacherSnapshot } from './teacher-snapshot'
import type { Locale } from '@/lib/i18n/locale'
import { trTeacher, riskLevelLabel, fmtDateShort } from '@/lib/i18n/messages'

export type TeacherNarrativeKey = 'cours' | 'classes' | 'watch' | 'homework' | 'attendance'
export type TeacherSection = { key: TeacherNarrativeKey; heading: string; lines: string[] }

export type TeacherNarrative = {
  headline: string
  sections: TeacherSection[]
  priorities: string[]
  meta: CopilotMetadata
}

const SOURCES: CopilotSource[] = [
  { kind: 'timetable', label: 'Emploi du temps' },
  { kind: 'classes', label: 'Mes classes' },
  { kind: 'risk_engine', label: 'Moteur de risque' },
  { kind: 'homework', label: 'Devoirs' },
  { kind: 'attendance', label: 'Présences' },
  { kind: 'assessments', label: 'Évaluations' },
]

function fmtDue(locale: Locale, due: string | null): string {
  return due ? trTeacher(locale, 'dueOn', { date: fmtDateShort(locale, due) }) : trTeacher(locale, 'dueNone')
}

export function generateTeacherNarrative(s: TeacherSnapshot, locale: Locale = 'fr'): TeacherNarrative {
  const confidence: CopilotConfidence = !s.hasAssignments ? 'low' : s.totals.students > 0 ? 'high' : 'medium'
  const meta: CopilotMetadata = { provider: 'deterministic', locale, sources: SOURCES, confidence, generatedAt: s.generatedAt }

  if (!s.hasAssignments) {
    return {
      headline: trTeacher(locale, 'emptyHeadline'),
      sections: [{ key: 'classes', heading: trTeacher(locale, 'headClasses'), lines: [trTeacher(locale, 'emptyClasses')] }],
      priorities: [trTeacher(locale, 'emptyPriority')],
      meta,
    }
  }

  const cours: string[] = s.todaySlots.length
    ? s.todaySlots.map((c) => trTeacher(locale, 'coursLine', { time: c.time, subject: c.subject, classLabel: c.classLabel, room: c.room ?? '' }))
    : [trTeacher(locale, 'coursNone')]

  const classes: string[] = s.classes.length
    ? s.classes.map((c) => trTeacher(locale, 'classLine', { label: c.label, students: c.students, subjects: c.subjects.length ? c.subjects.join(', ') : '' }))
    : [trTeacher(locale, 'classesNone')]

  const watch: string[] = s.watch.length
    ? s.watch.map((w) => trTeacher(locale, 'watchLine', { name: w.name, classLabel: w.classLabel, level: riskLevelLabel(locale, w.level), reasons: w.reasons.length ? w.reasons.slice(0, 2).join(' ; ') : '' }))
    : [trTeacher(locale, 'watchNone')]

  const homework: string[] = s.homework.recent.length
    ? s.homework.recent.map((h) => trTeacher(locale, 'hwLine', { title: h.title, classLabel: h.classLabel, due: fmtDue(locale, h.dueDate) }))
    : [trTeacher(locale, 'hwNone')]

  const attendance: string[] = s.pendingAttendance.length
    ? s.pendingAttendance.map((p) => trTeacher(locale, 'attLine', { classLabel: p.classLabel }))
    : [trTeacher(locale, 'attOk')]

  const sections: TeacherSection[] = [
    { key: 'cours', heading: trTeacher(locale, 'headCours'), lines: cours },
    { key: 'classes', heading: trTeacher(locale, 'headClasses'), lines: classes },
    { key: 'watch', heading: trTeacher(locale, 'headWatch'), lines: watch },
    { key: 'homework', heading: trTeacher(locale, 'headDevoirs'), lines: homework },
    { key: 'attendance', heading: trTeacher(locale, 'headPresences'), lines: attendance },
  ]

  const priorities: string[] = []
  if (s.pendingAttendance.length) priorities.push(trTeacher(locale, 'prAtt', { n: s.pendingAttendance.length }))
  if (s.pendingGrading.length) priorities.push(trTeacher(locale, 'prGrading', { n: s.pendingGrading.length }))
  const high = s.watch.filter((w) => w.level === 'high').length
  if (high > 0) priorities.push(trTeacher(locale, 'prWatch', { n: high, ex: s.watch[0] ? s.watch[0].name : '' }))
  if (s.homework.weekCount === 0) priorities.push(trTeacher(locale, 'prNoHw'))
  if (priorities.length === 0) priorities.push(trTeacher(locale, 'prNone'))

  const headline = trTeacher(locale, 'headline', { classes: s.totals.classes, subjects: s.totals.subjects, students: s.totals.students, cours: s.todaySlots.length || '' })

  return { headline, sections, priorities: priorities.slice(0, 4), meta }
}
