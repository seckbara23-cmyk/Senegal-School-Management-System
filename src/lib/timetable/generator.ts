// ─── Smart timetable generator (pure, deterministic, no I/O) ───────────────────
//
// Greedy first-fit scheduler. Given the weekly grid, the class-subjects to place
// (with hours_per_week and an optional assigned teacher), the teachers'
// availability windows and any EXISTING slots, it places each remaining lesson
// in the earliest grid cell that violates none of:
//   • class conflict      — the class already has a lesson in that cell
//   • teacher conflict     — the teacher already teaches in that cell
//   • availability conflict — the teacher is outside their availability windows
// It never produces a conflicting slot; lessons that cannot be placed are
// returned as `unplaced`. Same function runs in the browser preview AND the
// server save action, so what you preview is what you save (deterministic — no
// randomness). It writes nothing; callers persist `slots`.

export type Period = { index: number; start: string; end: string } // 'HH:MM'

export type GridConfig = {
  days:    number[]   // ISO weekdays 1=Mon … 7=Sun
  periods: Period[]
}

export type GenClassSubject = {
  classSubjectId: string
  classId:        string
  teacherId:      string | null
  subjectName:    string
  hoursPerWeek:   number
}

export type TimeWindow = { teacherId: string; day: number; start: string; end: string }
export type ExistingSlot = { classId: string; classSubjectId: string; teacherId: string | null; day: number; start: string; end: string }

export type GeneratedSlot = {
  classId:        string
  classSubjectId: string
  teacherId:      string | null
  day:            number
  start:          string
  end:            string
}

export type Unplaced = { classSubjectId: string; classId: string; subjectName: string; missing: number }

export type GenerateInput = {
  grid:          GridConfig
  classSubjects: GenClassSubject[]
  availability:  TimeWindow[]
  existing:      ExistingSlot[]
}

export type GenerateResult = {
  slots:    GeneratedSlot[]
  unplaced: Unplaced[]
  stats:    { needed: number; placed: number; unplaced: number }
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

// overlap of [aStart,aEnd) and [bStart,bEnd)
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function generateTimetable(input: GenerateInput): GenerateResult {
  const { grid, classSubjects, availability, existing } = input
  const cellKey = (day: number, periodIndex: number) => `${day}|${periodIndex}`

  // Occupancy seeded from existing slots: mark a (day, period) busy when an
  // existing slot on that day overlaps the period's time window.
  const classBusy   = new Map<string, Set<string>>()
  const teacherBusy = new Map<string, Set<string>>()
  const mark = (map: Map<string, Set<string>>, id: string, key: string) => {
    let s = map.get(id); if (!s) { s = new Set(); map.set(id, s) }; s.add(key)
  }

  for (const e of existing) {
    const es = toMinutes(e.start), ee = toMinutes(e.end)
    for (const p of grid.periods) {
      if (!grid.days.includes(e.day)) continue
      if (overlap(es, ee, toMinutes(p.start), toMinutes(p.end))) {
        mark(classBusy, e.classId, cellKey(e.day, p.index))
        if (e.teacherId) mark(teacherBusy, e.teacherId, cellKey(e.day, p.index))
      }
    }
  }

  // Teacher availability windows. A teacher with no windows is available
  // everywhere; otherwise a period must fall fully inside one window that day.
  const windowsByTeacher = new Map<string, TimeWindow[]>()
  for (const w of availability) {
    const list = windowsByTeacher.get(w.teacherId) ?? []
    list.push(w); windowsByTeacher.set(w.teacherId, list)
  }
  const isAvailable = (teacherId: string, day: number, p: Period): boolean => {
    const windows = windowsByTeacher.get(teacherId)
    if (!windows || windows.length === 0) return true
    const ps = toMinutes(p.start), pe = toMinutes(p.end)
    return windows.some((w) => w.day === day && toMinutes(w.start) <= ps && toMinutes(w.end) >= pe)
  }

  // Remaining lessons to place per class-subject = hours_per_week − already
  // scheduled (count of existing slots for that class-subject). Never negative.
  const existingCount = new Map<string, number>()
  for (const e of existing) existingCount.set(e.classSubjectId, (existingCount.get(e.classSubjectId) ?? 0) + 1)

  // Deterministic order: by class, then subject name, then id.
  const ordered = [...classSubjects].sort((a, b) =>
    a.classId.localeCompare(b.classId) || a.subjectName.localeCompare(b.subjectName) || a.classSubjectId.localeCompare(b.classSubjectId),
  )

  const slots: GeneratedSlot[] = []
  const unplaced: Unplaced[] = []
  let needed = 0

  for (const cs of ordered) {
    const remaining = Math.max(0, (cs.hoursPerWeek || 0) - (existingCount.get(cs.classSubjectId) ?? 0))
    needed += remaining
    // Spread a subject across days: a first pass avoids days the subject is
    // already on; a fallback pass allows doubling up if needed.
    const csDayUsed = new Set<number>()

    const place = (csv: GenClassSubject, allowSameDay: boolean): boolean => {
      for (const day of grid.days) {
        if (!allowSameDay && csDayUsed.has(day)) continue
        for (const p of grid.periods) {
          const key = cellKey(day, p.index)
          if (classBusy.get(csv.classId)?.has(key)) continue
          if (csv.teacherId) {
            if (teacherBusy.get(csv.teacherId)?.has(key)) continue
            if (!isAvailable(csv.teacherId, day, p)) continue
          }
          // Place it.
          mark(classBusy, csv.classId, key)
          if (csv.teacherId) mark(teacherBusy, csv.teacherId, key)
          csDayUsed.add(day)
          slots.push({ classId: csv.classId, classSubjectId: csv.classSubjectId, teacherId: csv.teacherId, day, start: p.start, end: p.end })
          return true
        }
      }
      return false
    }

    let missing = 0
    for (let n = 0; n < remaining; n++) {
      if (!(place(cs, false) || place(cs, true))) missing++
    }
    if (missing > 0) unplaced.push({ classSubjectId: cs.classSubjectId, classId: cs.classId, subjectName: cs.subjectName, missing })
  }

  return {
    slots,
    unplaced,
    stats: { needed, placed: slots.length, unplaced: unplaced.reduce((s, u) => s + u.missing, 0) },
  }
}

// Build a period grid from simple config: contiguous periods of `periodMinutes`
// from `startTime`, with an optional single break.
export function buildPeriods(opts: {
  startTime: string; periodMinutes: number; periodsPerDay: number
  breakAfter?: number | null; breakMinutes?: number | null
}): Period[] {
  const periods: Period[] = []
  let cursor = toMinutes(opts.startTime)
  const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  for (let i = 0; i < opts.periodsPerDay; i++) {
    const start = cursor
    const end = start + opts.periodMinutes
    periods.push({ index: i, start: fmt(start), end: fmt(end) })
    cursor = end
    if (opts.breakAfter != null && opts.breakMinutes != null && i + 1 === opts.breakAfter) {
      cursor += opts.breakMinutes
    }
  }
  return periods
}
