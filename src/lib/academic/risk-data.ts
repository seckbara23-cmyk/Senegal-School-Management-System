import type { createClient } from '@/lib/supabase/server'
import { assessRisk, type RiskResult } from './risk-engine'

type SchoolClient = ReturnType<typeof createClient>
const round2 = (n: number) => Math.round(n * 100) / 100

export type StudentRisk = RiskResult & {
  studentId: string
  firstName: string
  lastName:  string
  classId:   string
  className: string
  average:   number | null
}

export type SchoolRisk = {
  results: StudentRisk[]
  summary: { total: number; high: number; medium: number }
}

// Computes risk for the active year's active students — entirely derived, never
// stored. Pass opts.studentId to bound the work to a single student (profile).
// All queries are tenant-scoped. Returns empty when there is no active year.
export async function loadSchoolRisk(supabase: SchoolClient, schoolId: string, opts?: { studentId?: string }): Promise<SchoolRisk> {
  const empty: SchoolRisk = { results: [], summary: { total: 0, high: 0, medium: 0 } }

  const { data: yearData } = await supabase
    .from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yearData as { id: string } | null)?.id
  if (!yearId) return empty

  const { data: periodData } = await supabase
    .from('academic_periods').select('id, starts_on, ends_on').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('is_active', true).maybeSingle()
  const period = periodData as { id: string; starts_on: string | null; ends_on: string | null } | null

  // Active enrollments (optionally a single student).
  let enrQ = supabase
    .from('student_class_enrollments')
    .select('student_id, class_id, students!student_id(first_name, last_name), classes!class_id(name, section)')
    .eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active')
  if (opts?.studentId) enrQ = enrQ.eq('student_id', opts.studentId)
  const { data: enrData } = await enrQ
  type Enr = { student_id: string; class_id: string; students: { first_name: string; last_name: string } | null; classes: { name: string; section: string | null } | null }
  const enrollments = (enrData ?? []) as unknown as Enr[]
  if (enrollments.length === 0) return empty

  const studentIds = enrollments.map((e) => e.student_id)
  const classIds = Array.from(new Set(enrollments.map((e) => e.class_id)))

  // Class-subjects for the year (id, class, coefficient).
  const { data: csData } = await supabase
    .from('class_subjects').select('id, class_id, subjects!subject_id(coefficient)')
    .eq('school_id', schoolId).eq('academic_year_id', yearId).in('class_id', classIds)
  type CS = { id: string; class_id: string; subjects: { coefficient: number | null } | null }
  const classSubjects = (csData ?? []) as unknown as CS[]
  const csByClass = new Map<string, { id: string; coefficient: number }[]>()
  for (const cs of classSubjects) {
    const l = csByClass.get(cs.class_id) ?? []; l.push({ id: cs.id, coefficient: cs.subjects?.coefficient ?? 1 }); csByClass.set(cs.class_id, l)
  }

  // Assessments + grades for the active period.
  const assessByCs = new Map<string, { id: string; coefficient: number; max_score: number }[]>()
  const scoreByAssessStudent = new Map<string, number>()
  if (period && classSubjects.length > 0) {
    const csIds = classSubjects.map((c) => c.id)
    const { data: assessData } = await supabase
      .from('assessments').select('id, coefficient, max_score, class_subject_id')
      .eq('school_id', schoolId).eq('academic_period_id', period.id).in('class_subject_id', csIds)
    const assessList = (assessData ?? []) as { id: string; coefficient: number; max_score: number; class_subject_id: string }[]
    for (const a of assessList) { const l = assessByCs.get(a.class_subject_id) ?? []; l.push(a); assessByCs.set(a.class_subject_id, l) }
    if (assessList.length > 0) {
      let gQ = supabase.from('grades').select('assessment_id, student_id, score').eq('school_id', schoolId).in('assessment_id', assessList.map((a) => a.id))
      if (opts?.studentId) gQ = gQ.eq('student_id', opts.studentId)
      const { data: gradesData } = await gQ
      for (const g of (gradesData ?? []) as { assessment_id: string; student_id: string; score: number }[]) scoreByAssessStudent.set(`${g.assessment_id}|${g.student_id}`, g.score)
    }
  }

  // Attendance over the period window.
  const att = new Map<string, { absent: number; late: number }>()
  if (period?.starts_on && period?.ends_on) {
    const { data: sess } = await supabase
      .from('attendance_sessions').select('id').eq('school_id', schoolId).in('class_id', classIds)
      .gte('session_date', period.starts_on).lte('session_date', period.ends_on)
    const sIds = ((sess ?? []) as { id: string }[]).map((s) => s.id)
    if (sIds.length > 0) {
      let rQ = supabase.from('attendance_records').select('student_id, status').eq('school_id', schoolId).in('session_id', sIds)
      if (opts?.studentId) rQ = rQ.eq('student_id', opts.studentId)
      const { data: recs } = await rQ
      for (const r of (recs ?? []) as { student_id: string; status: string }[]) {
        const cur = att.get(r.student_id) ?? { absent: 0, late: 0 }
        if (r.status === 'absent') cur.absent++; else if (r.status === 'late') cur.late++
        att.set(r.student_id, cur)
      }
    }
  }

  // Finance: outstanding invoices.
  const fin = new Map<string, { overdue: number; unpaid: number }>()
  const today = new Date().toISOString().slice(0, 10)
  let fQ = supabase.from('student_invoices').select('student_id, total_amount, amount_paid, due_date, status').eq('school_id', schoolId).in('status', ['unpaid', 'partial'])
  if (opts?.studentId) fQ = fQ.eq('student_id', opts.studentId)
  const { data: invData } = await fQ
  for (const inv of (invData ?? []) as { student_id: string; total_amount: number; amount_paid: number; due_date: string | null; status: string }[]) {
    const cur = fin.get(inv.student_id) ?? { overdue: 0, unpaid: 0 }
    cur.unpaid++
    if (inv.due_date && inv.due_date < today) cur.overdue += inv.total_amount - inv.amount_paid
    fin.set(inv.student_id, cur)
  }

  // Per-student assessment.
  const results: StudentRisk[] = []
  for (const e of enrollments) {
    const csList = csByClass.get(e.class_id) ?? []
    let weightedSum = 0, totalWeight = 0, failed = 0
    for (const cs of csList) {
      const assess = assessByCs.get(cs.id) ?? []
      let ws = 0, tw = 0
      for (const a of assess) { const sc = scoreByAssessStudent.get(`${a.id}|${e.student_id}`); if (sc !== undefined) { ws += (sc / a.max_score) * 20 * a.coefficient; tw += a.coefficient } }
      if (tw > 0) { const subjAvg = ws / tw; weightedSum += subjAvg * cs.coefficient; totalWeight += cs.coefficient; if (subjAvg < 10) failed++ }
    }
    const average = totalWeight > 0 ? round2(weightedSum / totalWeight) : null
    const a = att.get(e.student_id) ?? { absent: 0, late: 0 }
    const f = fin.get(e.student_id) ?? { overdue: 0, unpaid: 0 }
    const r = assessRisk({
      currentAverage: average, previousAverage: null, failedSubjects: failed,
      rank: null, previousRank: null, classSize: 0,
      absences: a.absent, lates: a.late,
      unpaidInvoices: f.unpaid, overdueBalance: f.overdue, disciplineIncidents: 0,
    })
    results.push({
      ...r, studentId: e.student_id, firstName: e.students?.first_name ?? '', lastName: e.students?.last_name ?? '',
      classId: e.class_id, className: [e.classes?.name, e.classes?.section].filter(Boolean).join(' '), average,
    })
  }

  results.sort((a, b) => b.score - a.score)
  return {
    results,
    summary: { total: results.filter((r) => r.level !== 'low').length, high: results.filter((r) => r.level === 'high').length, medium: results.filter((r) => r.level === 'medium').length },
  }
}
