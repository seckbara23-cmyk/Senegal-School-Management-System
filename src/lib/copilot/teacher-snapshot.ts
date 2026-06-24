// ─── Teacher snapshot (Context Builder layer, teacher-scoped, derived) ───────
//
// Aggregates ONLY what the teacher is allowed to see — their assigned class-
// subjects, the classes/students behind them, today's timetable, their homework
// and assessments, and a finance-FREE "students to watch" derivation. Every query
// is bounded by the teacher's own assignments (assignedClassSubjectIds /
// teacher_id) and runs under teacher RLS, so no other teacher's data, no finance,
// and no school-wide aggregates are reachable. The narrative engine consumes this
// object and never queries.

import type { createClient } from '@/lib/supabase/server'
import { assessRisk, type RiskLevel } from '@/lib/academic/risk-engine'

type Client = ReturnType<typeof createClient>

export type TeacherSnapshot = {
  generatedAt: string
  hasAssignments: boolean
  teacherName: string
  todayLabel: string
  totals: { classes: number; subjects: number; students: number }
  classes: { classId: string; label: string; subjects: string[]; students: number }[]
  subjects: { name: string; classLabel: string }[]
  todaySlots: { time: string; subject: string; classLabel: string; room: string | null }[]
  watch: { studentId: string; name: string; classLabel: string; level: RiskLevel; reasons: string[] }[]
  homework: { recent: { title: string; classLabel: string; subject: string; dueDate: string | null }[]; weekCount: number; total: number }
  pendingAttendance: { classLabel: string }[]
  pendingGrading: { title: string; label: string }[]
}

const hhmm = (t: string) => t.slice(0, 5)
const round2 = (n: number) => Math.round(n * 100) / 100

function emptySnapshot(teacherName: string, todayLabel: string): TeacherSnapshot {
  return {
    generatedAt: new Date().toISOString(), hasAssignments: false, teacherName, todayLabel,
    totals: { classes: 0, subjects: 0, students: 0 }, classes: [], subjects: [], todaySlots: [],
    watch: [], homework: { recent: [], weekCount: 0, total: 0 }, pendingAttendance: [], pendingGrading: [],
  }
}

export async function loadTeacherSnapshot(
  supabase: Client,
  args: { schoolId: string; teacherId: string; teacherName: string; assignedClassSubjectIds: string[] },
): Promise<TeacherSnapshot> {
  const { schoolId, teacherId, teacherName, assignedClassSubjectIds: csIds } = args
  const now = new Date()
  const dow = ((now.getDay() + 6) % 7) + 1 // Mon=1 … Sun=7
  const todayLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const todayISO = now.toISOString().slice(0, 10)
  const weekAgoISO = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)

  if (csIds.length === 0) return emptySnapshot(teacherName, todayLabel)

  // Active year + period (scopes timetable, grades, attendance).
  const { data: yr } = await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id ?? null
  const { data: pd } = yearId
    ? await supabase.from('academic_periods').select('id, starts_on, ends_on').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('is_active', true).maybeSingle()
    : { data: null }
  const period = pd as { id: string; starts_on: string | null; ends_on: string | null } | null

  // Assigned class-subjects → classes + subjects.
  const { data: csData } = await supabase
    .from('class_subjects')
    .select('id, class_id, classes!class_id(name, section), subjects!subject_id(name)')
    .in('id', csIds).eq('school_id', schoolId)
  type CS = { id: string; class_id: string; classes: { name: string; section: string | null } | null; subjects: { name: string } | null }
  const classSubjects = (csData ?? []) as unknown as CS[]
  const classLabelById = new Map<string, string>()
  const csClassId = new Map<string, string>()
  const subjectsByClass = new Map<string, string[]>()
  const subjects: { name: string; classLabel: string }[] = []
  for (const cs of classSubjects) {
    const label = [cs.classes?.name, cs.classes?.section].filter(Boolean).join(' ') || '—'
    classLabelById.set(cs.class_id, label)
    csClassId.set(cs.id, cs.class_id)
    const list = subjectsByClass.get(cs.class_id) ?? []; if (cs.subjects?.name) list.push(cs.subjects.name); subjectsByClass.set(cs.class_id, list)
    subjects.push({ name: cs.subjects?.name ?? '—', classLabel: label })
  }
  const classIds = Array.from(classLabelById.keys())

  // Parallel: enrollments, today's slots, homework, assessments.
  const [enrRes, slotsRes, hwRes, assessRes] = await Promise.all([
    classIds.length ? supabase.from('student_class_enrollments').select('student_id, class_id, students!student_id(first_name, last_name)').eq('school_id', schoolId).eq('status', 'active').in('class_id', classIds) : Promise.resolve({ data: [] }),
    yearId ? supabase.from('timetable_slots').select('start_time, end_time, room, class_id, class_subjects!class_subject_id(subjects!subject_id(name))').eq('school_id', schoolId).eq('teacher_id', teacherId).eq('academic_year_id', yearId).eq('day_of_week', dow).order('start_time', { ascending: true }) : Promise.resolve({ data: [] }),
    supabase.from('homework').select('title, due_date, created_at, class_subject_id').eq('school_id', schoolId).in('class_subject_id', csIds).order('created_at', { ascending: false }),
    supabase.from('assessments').select('id, title, max_score, class_subject_id').eq('school_id', schoolId).in('class_subject_id', csIds).eq(period ? 'academic_period_id' : 'school_id', period ? period.id : schoolId),
  ])

  // Enrollments → students per class.
  type Enr = { student_id: string; class_id: string; students: { first_name: string; last_name: string } | null }
  const enrollments = (enrRes.data ?? []) as unknown as Enr[]
  const studentsByClass = new Map<string, number>()
  const studentName = new Map<string, string>()
  const studentClass = new Map<string, string>()
  for (const e of enrollments) {
    studentsByClass.set(e.class_id, (studentsByClass.get(e.class_id) ?? 0) + 1)
    studentName.set(e.student_id, `${e.students?.last_name ?? ''} ${e.students?.first_name ?? ''}`.trim() || '—')
    studentClass.set(e.student_id, e.class_id)
  }
  const studentIds = Array.from(studentName.keys())

  const classes = classIds.map((id) => ({ classId: id, label: classLabelById.get(id) ?? '—', subjects: subjectsByClass.get(id) ?? [], students: studentsByClass.get(id) ?? 0 }))

  // Today's timetable.
  type Slot = { start_time: string; end_time: string; room: string | null; class_id: string; class_subjects: { subjects: { name: string } | null } | null }
  const todaySlots = ((slotsRes.data ?? []) as unknown as Slot[]).map((s) => ({
    time: `${hhmm(s.start_time)}–${hhmm(s.end_time)}`, subject: s.class_subjects?.subjects?.name ?? 'Cours',
    classLabel: classLabelById.get(s.class_id) ?? '—', room: s.room,
  }))

  // Homework.
  type HW = { title: string; due_date: string | null; created_at: string; class_subject_id: string }
  const hwRows = (hwRes.data ?? []) as HW[]
  const homework = {
    recent: hwRows.slice(0, 6).map((h) => {
      const cid = csClassId.get(h.class_subject_id)
      return { title: h.title, classLabel: cid ? classLabelById.get(cid) ?? '—' : '—', subject: classSubjects.find((c) => c.id === h.class_subject_id)?.subjects?.name ?? '—', dueDate: h.due_date }
    }),
    weekCount: hwRows.filter((h) => h.created_at.slice(0, 10) >= weekAgoISO).length,
    total: hwRows.length,
  }

  // Assessments + grades (active period) → pending grading + per-student subject performance.
  type Assess = { id: string; title: string; max_score: number; class_subject_id: string }
  const assessments = (assessRes.data ?? []) as Assess[]
  const assessIds = assessments.map((a) => a.id)
  const gradeByAssessStudent = new Map<string, number>() // `${assessId}|${sid}` → score
  const gradedCountByAssess = new Map<string, number>()
  if (assessIds.length) {
    const { data: g } = await supabase.from('grades').select('assessment_id, student_id, score').eq('school_id', schoolId).in('assessment_id', assessIds)
    for (const r of (g ?? []) as { assessment_id: string; student_id: string; score: number }[]) {
      gradeByAssessStudent.set(`${r.assessment_id}|${r.student_id}`, r.score)
      gradedCountByAssess.set(r.assessment_id, (gradedCountByAssess.get(r.assessment_id) ?? 0) + 1)
    }
  }
  // Pending grading: assessment graded for fewer students than enrolled in its class.
  const pendingGrading = assessments
    .filter((a) => { const cid = csClassId.get(a.class_subject_id); const expected = cid ? studentsByClass.get(cid) ?? 0 : 0; return expected > 0 && (gradedCountByAssess.get(a.id) ?? 0) < expected })
    .slice(0, 8)
    .map((a) => { const cid = csClassId.get(a.class_subject_id); return { title: a.title, label: [cid ? classLabelById.get(cid) : '', classSubjects.find((c) => c.id === a.class_subject_id)?.subjects?.name].filter(Boolean).join(' · ') } })

  // Attendance over the active period → per-student absences/lates + pending today.
  const absById = new Map<string, { absent: number; late: number }>()
  let sessionClassIdsToday = new Set<string>()
  if (classIds.length) {
    const { data: sessToday } = await supabase.from('attendance_sessions').select('class_id').eq('school_id', schoolId).eq('session_date', todayISO).in('class_id', classIds)
    sessionClassIdsToday = new Set(((sessToday ?? []) as { class_id: string }[]).map((s) => s.class_id))

    if (period?.starts_on && period?.ends_on) {
      const { data: sess } = await supabase.from('attendance_sessions').select('id').eq('school_id', schoolId).in('class_id', classIds).gte('session_date', period.starts_on).lte('session_date', period.ends_on)
      const sIds = ((sess ?? []) as { id: string }[]).map((s) => s.id)
      if (sIds.length) {
        const { data: recs } = await supabase.from('attendance_records').select('student_id, status').eq('school_id', schoolId).in('session_id', sIds)
        for (const r of (recs ?? []) as { student_id: string; status: string }[]) {
          const cur = absById.get(r.student_id) ?? { absent: 0, late: 0 }
          if (r.status === 'absent') cur.absent++; else if (r.status === 'late') cur.late++
          absById.set(r.student_id, cur)
        }
      }
    }
  }
  // Pending attendance: today's timetabled classes with no session yet today.
  const todayClassIds = Array.from(new Set(((slotsRes.data ?? []) as unknown as Slot[]).map((s) => s.class_id)))
  const pendingAttendance = todayClassIds.filter((id) => !sessionClassIdsToday.has(id)).map((id) => ({ classLabel: classLabelById.get(id) ?? '—' }))

  // Per-student subject performance across the teacher's assessments (no finance).
  const perStudentCs = new Map<string, Map<string, { sum: number; n: number }>>() // sid → csId → avg/20 accumulator
  for (const a of assessments) {
    for (const sid of studentIds) {
      const sc = gradeByAssessStudent.get(`${a.id}|${sid}`)
      if (sc === undefined || !a.max_score) continue
      const m = perStudentCs.get(sid) ?? new Map(); const acc = m.get(a.class_subject_id) ?? { sum: 0, n: 0 }
      acc.sum += (sc / a.max_score) * 20; acc.n += 1; m.set(a.class_subject_id, acc); perStudentCs.set(sid, m)
    }
  }

  // Students to watch — finance-free risk (academic in the teacher's subjects + attendance).
  const watch = studentIds.map((sid) => {
    const csMap = perStudentCs.get(sid)
    let avg: number | null = null, failed = 0
    if (csMap && csMap.size) {
      const avgs: number[] = []
      csMap.forEach((acc) => { if (acc.n > 0) { const a = acc.sum / acc.n; avgs.push(a); if (a < 10) failed++ } })
      if (avgs.length) avg = round2(avgs.reduce((s, x) => s + x, 0) / avgs.length)
    }
    const att = absById.get(sid) ?? { absent: 0, late: 0 }
    const r = assessRisk({ currentAverage: avg, previousAverage: null, failedSubjects: failed, rank: null, previousRank: null, classSize: 0, absences: att.absent, lates: att.late, unpaidInvoices: 0, overdueBalance: 0, disciplineIncidents: 0 })
    const cid = studentClass.get(sid)
    return { studentId: sid, name: studentName.get(sid) ?? '—', classLabel: cid ? classLabelById.get(cid) ?? '—' : '—', level: r.level, score: r.score, reasons: r.reasons }
  }).filter((w) => w.level !== 'low').sort((a, b) => b.score - a.score).slice(0, 6)
    .map(({ studentId, name, classLabel, level, reasons }) => ({ studentId, name, classLabel, level, reasons }))

  return {
    generatedAt: new Date().toISOString(),
    hasAssignments: true,
    teacherName, todayLabel,
    totals: { classes: classIds.length, subjects: csIds.length, students: studentIds.length },
    classes, subjects, todaySlots, watch, homework, pendingAttendance, pendingGrading,
  }
}
