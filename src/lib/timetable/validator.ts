// ─── Smart timetable validator (pure, no I/O) ──────────────────────────────────
//
// Independently checks a SET of slots (existing + generated) for the three
// conflict classes and returns counts + details for the wizard's KPI cards. A
// schedule produced by generator.ts validates clean; this also surfaces any
// pre-existing conflicts among manually-created slots.

import { toMinutes } from './generator'
import type { TimeWindow } from './generator'

export type CheckSlot = {
  classId:        string
  classSubjectId: string
  teacherId:      string | null
  day:            number
  start:          string
  end:            string
}

export type Conflict = { kind: 'class' | 'teacher' | 'availability'; day: number; start: string; end: string; subjectIdA: string; subjectIdB?: string; refId: string }

export type ValidationResult = {
  classConflicts:        Conflict[]
  teacherConflicts:      Conflict[]
  availabilityConflicts: Conflict[]
  counts: { class: number; teacher: number; availability: number; total: number }
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

// Pairwise overlap conflicts among slots grouped by a key (classId or teacherId).
function pairwiseConflicts(slots: CheckSlot[], keyOf: (s: CheckSlot) => string | null, kind: 'class' | 'teacher'): Conflict[] {
  const groups = new Map<string, CheckSlot[]>()
  for (const s of slots) {
    const k = keyOf(s)
    if (!k) continue
    const g = groups.get(`${k}|${s.day}`) ?? []
    g.push(s); groups.set(`${k}|${s.day}`, g)
  }
  const out: Conflict[] = []
  groups.forEach((g, gk) => {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i], b = g[j]
        if (overlap(toMinutes(a.start), toMinutes(a.end), toMinutes(b.start), toMinutes(b.end))) {
          out.push({ kind, day: a.day, start: a.start, end: a.end, subjectIdA: a.classSubjectId, subjectIdB: b.classSubjectId, refId: gk.split('|')[0] })
        }
      }
    }
  })
  return out
}

export function validateTimetable(slots: CheckSlot[], availability: TimeWindow[]): ValidationResult {
  const classConflicts   = pairwiseConflicts(slots, (s) => s.classId, 'class')
  const teacherConflicts = pairwiseConflicts(slots, (s) => s.teacherId, 'teacher')

  // Availability: a teacher who HAS windows must teach inside one of them.
  const windowsByTeacher = new Map<string, TimeWindow[]>()
  for (const w of availability) {
    const list = windowsByTeacher.get(w.teacherId) ?? []
    list.push(w); windowsByTeacher.set(w.teacherId, list)
  }
  const availabilityConflicts: Conflict[] = []
  for (const s of slots) {
    if (!s.teacherId) continue
    const windows = windowsByTeacher.get(s.teacherId)
    if (!windows || windows.length === 0) continue // no windows = available everywhere
    const ss = toMinutes(s.start), se = toMinutes(s.end)
    const ok = windows.some((w) => w.day === s.day && toMinutes(w.start) <= ss && toMinutes(w.end) >= se)
    if (!ok) {
      availabilityConflicts.push({ kind: 'availability', day: s.day, start: s.start, end: s.end, subjectIdA: s.classSubjectId, refId: s.teacherId })
    }
  }

  return {
    classConflicts,
    teacherConflicts,
    availabilityConflicts,
    counts: {
      class: classConflicts.length,
      teacher: teacherConflicts.length,
      availability: availabilityConflicts.length,
      total: classConflicts.length + teacherConflicts.length + availabilityConflicts.length,
    },
  }
}
