// ─── Teacher Narrative Engine (Phase 10D — deterministic, no LLM) ────────────
//
// Pure: turns a TeacherSnapshot into grounded French sections for the teacher
// Copilot. NEVER accesses the database; same snapshot ⇒ same narrative (only
// meta.generatedAt, from the snapshot, reflects load time). Reuses the Phase 10A
// CopilotMetadata contract. No finance, no school-wide data — the snapshot only
// carries teacher-visible signals.

import type { CopilotConfidence, CopilotMetadata, CopilotSource } from './types'
import type { TeacherSnapshot } from './teacher-snapshot'
import type { RiskLevel } from '@/lib/academic/risk-engine'

export type TeacherNarrativeKey = 'cours' | 'classes' | 'watch' | 'homework' | 'attendance'
export type TeacherSection = { key: TeacherNarrativeKey; heading: string; lines: string[] }

export type TeacherNarrative = {
  headline: string
  sections: TeacherSection[]
  priorities: string[]
  meta: CopilotMetadata
}

const RISK_LABEL: Record<RiskLevel, string> = { low: 'faible', medium: 'moyen', high: 'élevé' }

const SOURCES: CopilotSource[] = [
  { kind: 'timetable', label: 'Emploi du temps' },
  { kind: 'classes', label: 'Mes classes' },
  { kind: 'risk_engine', label: 'Moteur de risque' },
  { kind: 'homework', label: 'Devoirs' },
  { kind: 'attendance', label: 'Présences' },
  { kind: 'assessments', label: 'Évaluations' },
]

function fmtDue(due: string | null): string {
  if (!due) return 'sans échéance'
  return 'échéance ' + new Date(due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function generateTeacherNarrative(s: TeacherSnapshot): TeacherNarrative {
  const confidence: CopilotConfidence = !s.hasAssignments ? 'low' : s.totals.students > 0 ? 'high' : 'medium'
  const meta: CopilotMetadata = { provider: 'deterministic', sources: SOURCES, confidence, generatedAt: s.generatedAt }

  if (!s.hasAssignments) {
    return {
      headline: 'Aucune matière ne vous est encore assignée.',
      sections: [{ key: 'classes', heading: 'Mes classes', lines: ['L’administrateur doit vous attribuer des matières dans les classes.'] }],
      priorities: ['Contacter l’administration pour vos attributions.'],
      meta,
    }
  }

  const cours: string[] = s.todaySlots.length
    ? s.todaySlots.map((c) => `${c.time} · ${c.subject} · ${c.classLabel}${c.room ? ` (${c.room})` : ''}`)
    : ['Aucun cours programmé aujourd’hui.']

  const classes: string[] = s.classes.length
    ? s.classes.map((c) => `${c.label} · ${c.students} élève(s)${c.subjects.length ? ` · ${c.subjects.join(', ')}` : ''}`)
    : ['Aucune classe.']

  const watch: string[] = s.watch.length
    ? s.watch.map((w) => `${w.name} (${w.classLabel}) — risque ${RISK_LABEL[w.level]}${w.reasons.length ? ` : ${w.reasons.slice(0, 2).join(' ; ')}` : ''}`)
    : ['Aucun élève à surveiller dans vos classes.']

  const homework: string[] = s.homework.recent.length
    ? s.homework.recent.map((h) => `${h.title} · ${h.classLabel} · ${fmtDue(h.dueDate)}`)
    : ['Aucun devoir publié.']

  const attendance: string[] = s.pendingAttendance.length
    ? s.pendingAttendance.map((p) => `${p.classLabel} — présences à saisir aujourd’hui`)
    : ['Présences du jour à jour.']

  const sections: TeacherSection[] = [
    { key: 'cours', heading: 'Mes cours du jour', lines: cours },
    { key: 'classes', heading: 'Mes classes', lines: classes },
    { key: 'watch', heading: 'Élèves à surveiller', lines: watch },
    { key: 'homework', heading: 'Devoirs récents', lines: homework },
    { key: 'attendance', heading: 'Présences à compléter', lines: attendance },
  ]

  const priorities: string[] = []
  if (s.pendingAttendance.length) priorities.push(`Saisir les présences manquantes (${s.pendingAttendance.length} classe(s) aujourd’hui).`)
  if (s.pendingGrading.length) priorities.push(`Terminer la notation de ${s.pendingGrading.length} évaluation(s).`)
  const high = s.watch.filter((w) => w.level === 'high').length
  if (high > 0) priorities.push(`Accompagner ${high} élève(s) en difficulté${s.watch[0] ? ` (ex. ${s.watch[0].name})` : ''}.`)
  if (s.homework.weekCount === 0) priorities.push('Aucun devoir donné cette semaine — en prévoir si pertinent.')
  if (priorities.length === 0) priorities.push('Aucune tâche urgente — tout est à jour. 👍')

  const headline = `${s.totals.classes} classe(s) · ${s.totals.subjects} matière(s) · ${s.totals.students} élève(s)${s.todaySlots.length ? ` · ${s.todaySlots.length} cours aujourd’hui` : ''}.`

  return { headline, sections, priorities: priorities.slice(0, 4), meta }
}
