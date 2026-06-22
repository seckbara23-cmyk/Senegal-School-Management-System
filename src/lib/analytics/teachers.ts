// ─── Teacher analytics (derived, never persisted) ────────────────────────────
//
// Per-teacher activity signals, all queryable from existing tables. Batched +
// tenant-scoped + read-only. Reuses the active-year scope.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

export type TeacherStat = {
  teacherId: string
  name: string
  classes: number
  subjects: number
  sessionsRecorded: number
  assessmentsCreated: number
  gradeCompleteness: number | null   // 0–100, % of expected grades entered
  homeworkPosted: number
  threads: number
  unreadMessages: number
}

export type TeacherAnalytics = {
  teachers: TeacherStat[]
  totals: { teachers: number; sessions: number; assessments: number; homework: number; avgCompleteness: number | null }
}

export async function loadTeacherAnalytics(client: Client, schoolId: string): Promise<TeacherAnalytics> {
  const empty: TeacherAnalytics = { teachers: [], totals: { teachers: 0, sessions: 0, assessments: 0, homework: 0, avgCompleteness: null } }

  const { data: yr } = await client.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id

  const { data: teacherData } = await client.from('teachers').select('id, first_name, last_name, profile_id').eq('school_id', schoolId).eq('status', 'active')
  type T = { id: string; first_name: string; last_name: string; profile_id: string | null }
  const teachers = (teacherData ?? []) as T[]
  if (teachers.length === 0) return empty
  const byProfile = new Map<string, string>() // profile_id → teacher_id
  for (const t of teachers) if (t.profile_id) byProfile.set(t.profile_id, t.id)

  // Assignments → class-subjects.
  const { data: tsaData } = await client.from('teacher_subject_assignments').select('teacher_id, class_subject_id').eq('school_id', schoolId)
  const tsa = (tsaData ?? []) as { teacher_id: string; class_subject_id: string }[]
  const csIds = Array.from(new Set(tsa.map((a) => a.class_subject_id)))
  const teacherByCs = new Map(tsa.map((a) => [a.class_subject_id, a.teacher_id]))
  const csByTeacher = new Map<string, string[]>()
  for (const a of tsa) { const l = csByTeacher.get(a.teacher_id) ?? []; l.push(a.class_subject_id); csByTeacher.set(a.teacher_id, l) }

  // Class-subject → class.
  const csClass = new Map<string, string>()
  if (csIds.length > 0) {
    const { data: csData } = await client.from('class_subjects').select('id, class_id').eq('school_id', schoolId).in('id', csIds)
    for (const c of (csData ?? []) as { id: string; class_id: string }[]) csClass.set(c.id, c.class_id)
  }

  // Enrolled student counts per class (active year).
  const studentsByClass = new Map<string, number>()
  if (yearId) {
    const { data: enr } = await client.from('student_class_enrollments').select('class_id').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active')
    for (const e of (enr ?? []) as { class_id: string }[]) studentsByClass.set(e.class_id, (studentsByClass.get(e.class_id) ?? 0) + 1)
  }

  // Assessments in those class-subjects + grade counts.
  const assessByTeacher = new Map<string, number>()
  const expectedByTeacher = new Map<string, number>()
  const actualByTeacher = new Map<string, number>()
  if (csIds.length > 0) {
    const { data: aData } = await client.from('assessments').select('id, class_subject_id').eq('school_id', schoolId).in('class_subject_id', csIds)
    const assessments = (aData ?? []) as { id: string; class_subject_id: string }[]
    const gradesByAssessment = new Map<string, number>()
    if (assessments.length > 0) {
      const { data: gData } = await client.from('grades').select('assessment_id').eq('school_id', schoolId).in('assessment_id', assessments.map((a) => a.id))
      for (const g of (gData ?? []) as { assessment_id: string }[]) gradesByAssessment.set(g.assessment_id, (gradesByAssessment.get(g.assessment_id) ?? 0) + 1)
    }
    for (const a of assessments) {
      const teacherId = teacherByCs.get(a.class_subject_id); if (!teacherId) continue
      assessByTeacher.set(teacherId, (assessByTeacher.get(teacherId) ?? 0) + 1)
      const expected = studentsByClass.get(csClass.get(a.class_subject_id) ?? '') ?? 0
      expectedByTeacher.set(teacherId, (expectedByTeacher.get(teacherId) ?? 0) + expected)
      actualByTeacher.set(teacherId, (actualByTeacher.get(teacherId) ?? 0) + (gradesByAssessment.get(a.id) ?? 0))
    }
  }

  // Attendance sessions recorded (created_by = teacher profile).
  const sessionsByTeacher = new Map<string, number>()
  const { data: sess } = await client.from('attendance_sessions').select('created_by').eq('school_id', schoolId)
  for (const s of (sess ?? []) as { created_by: string | null }[]) {
    const tid = s.created_by ? byProfile.get(s.created_by) : undefined
    if (tid) sessionsByTeacher.set(tid, (sessionsByTeacher.get(tid) ?? 0) + 1)
  }

  // Homework posts.
  const homeworkByTeacher = new Map<string, number>()
  const { data: hw } = await client.from('homework').select('teacher_id').eq('school_id', schoolId)
  for (const h of (hw ?? []) as { teacher_id: string | null }[]) if (h.teacher_id) homeworkByTeacher.set(h.teacher_id, (homeworkByTeacher.get(h.teacher_id) ?? 0) + 1)

  // Message threads + unread.
  const threadsByTeacher = new Map<string, number>()
  const threadTeacher = new Map<string, string>()
  const { data: threads } = await client.from('message_threads').select('id, teacher_id').eq('school_id', schoolId)
  for (const t of (threads ?? []) as { id: string; teacher_id: string }[]) { threadsByTeacher.set(t.teacher_id, (threadsByTeacher.get(t.teacher_id) ?? 0) + 1); threadTeacher.set(t.id, t.teacher_id) }
  const unreadByTeacher = new Map<string, number>()
  if (threadTeacher.size > 0) {
    const { data: msgs } = await client.from('messages').select('thread_id').eq('school_id', schoolId).is('read_by_teacher_at', null).neq('sender_role', 'teacher')
    for (const m of (msgs ?? []) as { thread_id: string }[]) { const tid = threadTeacher.get(m.thread_id); if (tid) unreadByTeacher.set(tid, (unreadByTeacher.get(tid) ?? 0) + 1) }
  }

  const stats: TeacherStat[] = teachers.map((t) => {
    const csList = csByTeacher.get(t.id) ?? []
    const classes = new Set(csList.map((cs) => csClass.get(cs)).filter(Boolean)).size
    const expected = expectedByTeacher.get(t.id) ?? 0
    const actual = actualByTeacher.get(t.id) ?? 0
    return {
      teacherId: t.id, name: `${t.last_name} ${t.first_name}`.trim() || '—',
      classes, subjects: csList.length,
      sessionsRecorded: sessionsByTeacher.get(t.id) ?? 0,
      assessmentsCreated: assessByTeacher.get(t.id) ?? 0,
      gradeCompleteness: expected > 0 ? Math.round((actual / expected) * 100) : null,
      homeworkPosted: homeworkByTeacher.get(t.id) ?? 0,
      threads: threadsByTeacher.get(t.id) ?? 0,
      unreadMessages: unreadByTeacher.get(t.id) ?? 0,
    }
  }).sort((a, b) => (b.sessionsRecorded + b.assessmentsCreated + b.homeworkPosted) - (a.sessionsRecorded + a.assessmentsCreated + a.homeworkPosted))

  const completes = stats.filter((s) => s.gradeCompleteness !== null).map((s) => s.gradeCompleteness as number)
  return {
    teachers: stats,
    totals: {
      teachers: teachers.length,
      sessions: stats.reduce((s, t) => s + t.sessionsRecorded, 0),
      assessments: stats.reduce((s, t) => s + t.assessmentsCreated, 0),
      homework: stats.reduce((s, t) => s + t.homeworkPosted, 0),
      avgCompleteness: completes.length ? Math.round(completes.reduce((a, b) => a + b, 0) / completes.length) : null,
    },
  }
}
