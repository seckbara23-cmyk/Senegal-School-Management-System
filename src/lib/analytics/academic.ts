// ─── Academic analytics (derived, never persisted) ───────────────────────────
//
// One batched scan of the active period's grades produces student-, subject- and
// class-level aggregates (same query shape as risk-data). Tenant-scoped, read-only.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>
const round2 = (n: number) => Math.round(n * 100) / 100

export const MENTION_BANDS = [
  { key: 'tres_bien',  label: 'Très bien',  min: 16, barClass: 'bg-emerald-500' },
  { key: 'bien',       label: 'Bien',       min: 14, barClass: 'bg-sky-500' },
  { key: 'assez_bien', label: 'Assez bien', min: 12, barClass: 'bg-primary-500' },
  { key: 'passable',   label: 'Passable',   min: 10, barClass: 'bg-amber-500' },
  { key: 'insuffisant', label: 'Insuffisant', min: 0, barClass: 'bg-red-500' },
] as const

export function mentionBand(avg: number): string {
  if (avg >= 16) return 'tres_bien'
  if (avg >= 14) return 'bien'
  if (avg >= 12) return 'assez_bien'
  if (avg >= 10) return 'passable'
  return 'insuffisant'
}

export type StudentAverage = { studentId: string; name: string; classId: string; className: string; average: number | null }
export type SubjectAverage = { subjectId: string; name: string; average: number; gradedStudents: number }
export type ClassAverage = { classId: string; className: string; average: number | null; passRate: number | null; count: number }

export type AcademicAnalytics = {
  schoolAverage: number | null
  passRate: number | null
  gradedStudents: number
  totalStudents: number
  distribution: { key: string; label: string; count: number; barClass: string }[]
  byClass: ClassAverage[]
  bySubject: SubjectAverage[]
  students: StudentAverage[]
}

export async function loadAcademicAnalytics(client: Client, schoolId: string): Promise<AcademicAnalytics> {
  const empty: AcademicAnalytics = {
    schoolAverage: null, passRate: null, gradedStudents: 0, totalStudents: 0,
    distribution: MENTION_BANDS.map((b) => ({ key: b.key, label: b.label, count: 0, barClass: b.barClass })),
    byClass: [], bySubject: [], students: [],
  }

  const { data: yr } = await client.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  const yearId = (yr as { id: string } | null)?.id
  if (!yearId) return empty
  const { data: pd } = await client.from('academic_periods').select('id').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('is_active', true).maybeSingle()
  const periodId = (pd as { id: string } | null)?.id

  const { data: enrData } = await client
    .from('student_class_enrollments')
    .select('student_id, class_id, students!student_id(first_name, last_name), classes!class_id(name, section)')
    .eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active')
  type Enr = { student_id: string; class_id: string; students: { first_name: string; last_name: string } | null; classes: { name: string; section: string | null } | null }
  const enrollments = (enrData ?? []) as unknown as Enr[]
  if (enrollments.length === 0) return empty
  const classIds = Array.from(new Set(enrollments.map((e) => e.class_id)))

  const { data: csData } = await client
    .from('class_subjects').select('id, class_id, subject_id, subjects!subject_id(name, coefficient)')
    .eq('school_id', schoolId).eq('academic_year_id', yearId).in('class_id', classIds)
  type CS = { id: string; class_id: string; subject_id: string; subjects: { name: string; coefficient: number | null } | null }
  const classSubjects = (csData ?? []) as unknown as CS[]
  const csMeta = new Map(classSubjects.map((cs) => [cs.id, { classId: cs.class_id, subjectId: cs.subject_id, subjectName: cs.subjects?.name ?? '—', coeff: cs.subjects?.coefficient ?? 1 }]))
  const csByClass = new Map<string, string[]>()
  for (const cs of classSubjects) { const l = csByClass.get(cs.class_id) ?? []; l.push(cs.id); csByClass.set(cs.class_id, l) }

  const assessByCs = new Map<string, { id: string; coefficient: number; max_score: number }[]>()
  const scoreByAssessStudent = new Map<string, number>()
  if (periodId && classSubjects.length > 0) {
    const csIds = classSubjects.map((c) => c.id)
    const { data: aData } = await client.from('assessments').select('id, coefficient, max_score, class_subject_id').eq('school_id', schoolId).eq('academic_period_id', periodId).in('class_subject_id', csIds)
    const assessList = (aData ?? []) as { id: string; coefficient: number; max_score: number; class_subject_id: string }[]
    for (const a of assessList) { const l = assessByCs.get(a.class_subject_id) ?? []; l.push(a); assessByCs.set(a.class_subject_id, l) }
    if (assessList.length > 0) {
      const { data: gData } = await client.from('grades').select('assessment_id, student_id, score').eq('school_id', schoolId).in('assessment_id', assessList.map((a) => a.id))
      for (const g of (gData ?? []) as { assessment_id: string; student_id: string; score: number }[]) scoreByAssessStudent.set(`${g.assessment_id}|${g.student_id}`, g.score)
    }
  }

  // Per-student subject + overall averages; per-subject accumulation.
  const subjectAcc = new Map<string, { name: string; sum: number; count: number }>()
  const students: StudentAverage[] = enrollments.map((e) => {
    const csList = csByClass.get(e.class_id) ?? []
    let weightedSum = 0, totalWeight = 0
    for (const csId of csList) {
      const meta = csMeta.get(csId); if (!meta) continue
      const assess = assessByCs.get(csId) ?? []
      let ws = 0, tw = 0
      for (const a of assess) { const sc = scoreByAssessStudent.get(`${a.id}|${e.student_id}`); if (sc !== undefined) { ws += (sc / a.max_score) * 20 * a.coefficient; tw += a.coefficient } }
      if (tw > 0) {
        const subjAvg = ws / tw
        weightedSum += subjAvg * meta.coeff; totalWeight += meta.coeff
        const acc = subjectAcc.get(meta.subjectId) ?? { name: meta.subjectName, sum: 0, count: 0 }
        acc.sum += subjAvg; acc.count++; subjectAcc.set(meta.subjectId, acc)
      }
    }
    const average = totalWeight > 0 ? round2(weightedSum / totalWeight) : null
    return { studentId: e.student_id, name: `${e.students?.last_name ?? ''} ${e.students?.first_name ?? ''}`.trim() || '—', classId: e.class_id, className: [e.classes?.name, e.classes?.section].filter(Boolean).join(' ') || '—', average }
  })

  const graded = students.filter((s) => s.average !== null) as (StudentAverage & { average: number })[]
  const schoolAverage = graded.length ? round2(graded.reduce((s, r) => s + r.average, 0) / graded.length) : null
  const passRate = graded.length ? Math.round((graded.filter((r) => r.average >= 10).length / graded.length) * 100) : null

  const distribution = MENTION_BANDS.map((b) => ({ key: b.key, label: b.label, count: graded.filter((g) => mentionBand(g.average) === b.key).length, barClass: b.barClass }))

  const byClassMap = new Map<string, { className: string; avgs: number[]; count: number }>()
  for (const s of students) {
    const cur = byClassMap.get(s.classId) ?? { className: s.className, avgs: [], count: 0 }
    cur.count++; if (s.average !== null) cur.avgs.push(s.average); byClassMap.set(s.classId, cur)
  }
  const byClass: ClassAverage[] = Array.from(byClassMap.entries()).map(([classId, v]) => ({
    classId, className: v.className,
    average: v.avgs.length ? round2(v.avgs.reduce((a, b) => a + b, 0) / v.avgs.length) : null,
    passRate: v.avgs.length ? Math.round((v.avgs.filter((a) => a >= 10).length / v.avgs.length) * 100) : null,
    count: v.count,
  })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1))

  const bySubject: SubjectAverage[] = Array.from(subjectAcc.entries()).map(([subjectId, v]) => ({ subjectId, name: v.name, average: round2(v.sum / v.count), gradedStudents: v.count })).sort((a, b) => b.average - a.average)

  return { schoolAverage, passRate, gradedStudents: graded.length, totalStudents: students.length, distribution, byClass, bySubject, students }
}
