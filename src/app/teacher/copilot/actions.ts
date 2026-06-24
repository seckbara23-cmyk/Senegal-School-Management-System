'use server'

import { requireTeacherCtx } from '../_auth'
import { loadTeacherSnapshot } from '@/lib/copilot/teacher-snapshot'
import { generateTeacherNarrative, type TeacherNarrative, type TeacherNarrativeKey } from '@/lib/copilot/teacher-narrative'
import type { CopilotAnswer, CopilotIntent } from '@/lib/copilot/types'

type Focus = 'overview' | 'watch' | 'homework' | 'attendance' | 'grading' | 'help'

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function routeFocus(q: string): Focus {
  const n = norm(q)
  if (/\b(aide|help|que peux|capacites)\b/.test(n)) return 'help'
  if (/(difficulte|surveiller|risque|en difficulte|decroch)/.test(n)) return 'watch'
  if (/(devoir|homework|travail a la maison)/.test(n)) return 'homework'
  if (/(presence|assiduite|saisir les presence|absence)/.test(n)) return 'attendance'
  if (/(bulletin|commentaire|appreciation|noter|notation|corriger|evaluation a)/.test(n)) return 'grading'
  return 'overview'
}

function section(n: TeacherNarrative, key: TeacherNarrativeKey) {
  const s = n.sections.find((x) => x.key === key)
  return s ? { heading: s.heading, lines: s.lines } : { heading: '', lines: [] }
}

// Read-only. requireTeacherCtx enforces teacher scope (RLS); the snapshot carries
// only teacher-visible data (no finance, no other teachers, no school-wide stats).
// No writes, no audit mutation, no notifications.
export async function askTeacherCopilot(query: string): Promise<CopilotAnswer> {
  const { supabase, schoolId, teacher, assignedClassSubjectIds } = await requireTeacherCtx()
  const snapshot = await loadTeacherSnapshot(supabase, {
    schoolId, teacherId: teacher.id, teacherName: `${teacher.last_name} ${teacher.first_name}`.trim(), assignedClassSubjectIds,
  })
  const n = generateTeacherNarrative(snapshot)
  const focus = routeFocus(query)
  const meta = n.meta

  const base = (intent: CopilotIntent, title: string, summary: string, sections: { heading: string; lines: string[] }[], links: { label: string; href: string }[] = [], extra?: Partial<CopilotAnswer>): CopilotAnswer =>
    ({ intent, title, summary, sections, links, meta, ...extra })

  switch (focus) {
    case 'watch':
      return base('at_risk', 'Élèves à surveiller', `${snapshot.watch.length} élève(s) à surveiller dans vos classes.`,
        [section(n, 'watch')], [{ label: 'Saisir des notes', href: '/teacher/grades' }, { label: 'Présences', href: '/teacher/attendance' }])

    case 'homework':
      return base('homework', 'Devoirs récents', `${snapshot.homework.weekCount} devoir(s) donné(s) cette semaine · ${snapshot.homework.total} au total.`,
        [section(n, 'homework')], [{ label: 'Mes devoirs', href: '/teacher/homework' }])

    case 'attendance':
      return base('attendance', 'Présences à compléter',
        snapshot.pendingAttendance.length ? `${snapshot.pendingAttendance.length} classe(s) sans présence aujourd’hui.` : 'Présences du jour à jour.',
        [section(n, 'attendance')], [{ label: 'Registre des présences', href: '/teacher/attendance' }])

    case 'grading': {
      const lines = snapshot.pendingGrading.length
        ? snapshot.pendingGrading.map((g) => `${g.title} — ${g.label}`)
        : ['Toutes vos évaluations sont notées — base des bulletins prête.']
      return base('academic', 'Préparation des bulletins',
        'Les appréciations de bulletin sont validées par l’administration ; votre part est la notation des évaluations.',
        [{ heading: 'Évaluations à finaliser', lines }], [{ label: 'Mes notes', href: '/teacher/grades' }])
    }

    case 'help':
      return base('help', 'Que puis-je faire ?', 'Je réponds à partir de vos classes — en lecture seule.',
        [{ heading: '', lines: ['Résumé de mes classes', 'Élèves en difficulté', 'Devoirs récents', 'Présences à compléter', 'Évaluations à finaliser'] }],
        [], { suggestions: ['Résume mes classes', 'Quels élèves sont en difficulté ?', 'Quelles présences dois-je saisir ?'] })

    default:
      return base('school_overview', 'Synthèse de mes classes', n.headline,
        [section(n, 'cours'), section(n, 'classes'), { heading: 'Priorités de la semaine', lines: n.priorities }],
        [{ label: 'Mes classes', href: '/teacher/classes' }, { label: 'Emploi du temps', href: '/teacher/timetable' }])
  }
}
