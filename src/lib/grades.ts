// ─── Shared gradebook calculation service (Phase 1C) ─────────────────────────
//
// The single source of truth for gradebook maths so every surface agrees:
//   • per-assessment score is normalised to /20,
//   • a subject average is the assessment-coefficient-weighted mean of those,
//   • an overall average is the subject-coefficient-weighted mean of subjects.
// This mirrors the long-standing bulletin/exam-results logic, now reusable.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Bring a raw score onto the /20 scale. */
export function normalize20(score: number, maxScore: number): number {
  return maxScore > 0 ? (score / maxScore) * 20 : 0
}

export function mention(avg: number): string {
  if (avg >= 16) return 'Très bien'
  if (avg >= 14) return 'Bien'
  if (avg >= 12) return 'Assez bien'
  if (avg >= 10) return 'Passable'
  return 'Insuffisant'
}

export type AverageTone = 'emerald' | 'sky' | 'amber' | 'red' | 'gray'
export function averageTone(avg: number | null): AverageTone {
  if (avg === null) return 'gray'
  if (avg >= 14) return 'emerald'
  if (avg >= 12) return 'sky'
  if (avg >= 10) return 'amber'
  return 'red'
}
export const AVERAGE_TEXT_CLASS: Record<AverageTone, string> = {
  emerald: 'text-emerald-700',
  sky:     'text-sky-700',
  amber:   'text-amber-700',
  red:     'text-red-600',
  gray:    'text-gray-400',
}
export const AVERAGE_BAR_CLASS: Record<AverageTone, string> = {
  emerald: 'bg-emerald-500',
  sky:     'bg-sky-500',
  amber:   'bg-amber-500',
  red:     'bg-red-500',
  gray:    'bg-gray-300',
}

// ─── Pure primitives ──────────────────────────────────────────────────────────

export type GradedItem = { score: number; maxScore: number; coefficient: number }

/** Assessment-coefficient-weighted subject average on the /20 scale, or null. */
export function subjectAverage(items: GradedItem[]): number | null {
  let weightedSum = 0
  let totalWeight = 0
  for (const i of items) {
    weightedSum += normalize20(i.score, i.maxScore) * i.coefficient
    totalWeight += i.coefficient
  }
  return totalWeight > 0 ? round2(weightedSum / totalWeight) : null
}

export type WeightedAverage = { average: number | null; coefficient: number }

/** Subject-coefficient-weighted overall average, or null. */
export function overallAverage(subjects: WeightedAverage[]): number | null {
  let weightedSum = 0
  let totalWeight = 0
  for (const s of subjects) {
    if (s.average !== null) {
      weightedSum += s.average * s.coefficient
      totalWeight += s.coefficient
    }
  }
  return totalWeight > 0 ? round2(weightedSum / totalWeight) : null
}

// ─── Academic dashboard aggregate (server) ────────────────────────────────────

export type PendingAssessment = {
  assessmentId: string
  title:        string
  className:    string
  subject:      string
  graded:       number
  expected:     number
}

export type ClassAverage = {
  classId:        string
  className:      string
  average:        number | null
  gradedStudents: number
  totalStudents:  number
}

export type AcademicDashboard = {
  assessmentsCreated: number
  gradesEntered:      number
  pendingCount:       number
  pending:            PendingAssessment[]
  classAverages:      ClassAverage[]
  overall:            number | null
}

type ClassRow = { id: string; name: string; section: string | null }
type CsRow = { id: string; class_id: string; subjects: { name: string; coefficient: number | null } | null }
type AssessmentRow = { id: string; class_subject_id: string; max_score: number; coefficient: number; title: string }
type EnrollmentRow = { student_id: string; class_id: string }
type GradeRow = { assessment_id: string; student_id: string; score: number }

function label(name: string, section: string | null): string {
  return [name, section].filter(Boolean).join(' ')
}

/**
 * Compute the school-admin academic dashboard for one academic period:
 * assessments created, grades entered, assessments with incomplete grade entry,
 * and per-class overall averages. Scoped to the period so the data stays bounded.
 */
export async function computeAcademicDashboard(
  client: Client,
  schoolId: string,
  yearId: string,
  periodId: string,
): Promise<AcademicDashboard> {
  const [classesRes, csRes, assessRes, enrRes] = await Promise.all([
    client.from('classes').select('id, name, section').eq('school_id', schoolId).eq('academic_year_id', yearId).order('name'),
    client.from('class_subjects').select('id, class_id, subjects!subject_id(name, coefficient)').eq('school_id', schoolId).eq('academic_year_id', yearId),
    client.from('assessments').select('id, class_subject_id, max_score, coefficient, title').eq('school_id', schoolId).eq('academic_period_id', periodId),
    client.from('student_class_enrollments').select('student_id, class_id').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'active'),
  ])

  const classes     = (classesRes.data ?? []) as ClassRow[]
  const classSubs    = (csRes.data ?? []) as unknown as CsRow[]
  const assessments = (assessRes.data ?? []) as AssessmentRow[]
  const enrollments = (enrRes.data ?? []) as EnrollmentRow[]

  const classById = new Map(classes.map((c) => [c.id, c]))
  const csById = new Map(classSubs.map((cs) => [cs.id, cs]))

  const assessmentsByCs = new Map<string, AssessmentRow[]>()
  for (const a of assessments) {
    if (!assessmentsByCs.has(a.class_subject_id)) assessmentsByCs.set(a.class_subject_id, [])
    assessmentsByCs.get(a.class_subject_id)!.push(a)
  }

  const csByClass = new Map<string, string[]>()
  for (const cs of classSubs) {
    if (!csByClass.has(cs.class_id)) csByClass.set(cs.class_id, [])
    csByClass.get(cs.class_id)!.push(cs.id)
  }

  const studentsByClass = new Map<string, string[]>()
  for (const e of enrollments) {
    if (!studentsByClass.has(e.class_id)) studentsByClass.set(e.class_id, [])
    studentsByClass.get(e.class_id)!.push(e.student_id)
  }

  const assessmentIds = assessments.map((a) => a.id)
  const { data: gradeData } = assessmentIds.length > 0
    ? await client.from('grades').select('assessment_id, student_id, score').eq('school_id', schoolId).in('assessment_id', assessmentIds)
    : { data: [] }
  const grades = (gradeData ?? []) as GradeRow[]

  const gradeIndex = new Map<string, Map<string, number>>()
  for (const g of grades) {
    if (!gradeIndex.has(g.assessment_id)) gradeIndex.set(g.assessment_id, new Map())
    gradeIndex.get(g.assessment_id)!.set(g.student_id, g.score)
  }

  // Pending: an assessment is "pending" when fewer students are graded than are
  // enrolled in its class.
  const pending: PendingAssessment[] = []
  for (const a of assessments) {
    const cs = csById.get(a.class_subject_id)
    if (!cs) continue
    const cls = classById.get(cs.class_id)
    const expected = (studentsByClass.get(cs.class_id) ?? []).length
    const graded = gradeIndex.get(a.id)?.size ?? 0
    if (expected > 0 && graded < expected) {
      pending.push({
        assessmentId: a.id,
        title:        a.title,
        className:    cls ? label(cls.name, cls.section) : '—',
        subject:      cs.subjects?.name ?? '—',
        graded,
        expected,
      })
    }
  }
  pending.sort((a, b) => (a.graded / a.expected) - (b.graded / b.expected))

  // Per-class overall averages.
  const classAverages: ClassAverage[] = []
  let globalSum = 0
  let globalCount = 0
  for (const c of classes) {
    const studentIds = studentsByClass.get(c.id) ?? []
    const csIds = csByClass.get(c.id) ?? []
    let sum = 0
    let n = 0
    for (const sid of studentIds) {
      const subjectAverages: WeightedAverage[] = csIds.map((csId) => {
        const items: GradedItem[] = (assessmentsByCs.get(csId) ?? []).flatMap((a) => {
          const score = gradeIndex.get(a.id)?.get(sid)
          return score !== undefined ? [{ score, maxScore: a.max_score, coefficient: a.coefficient }] : []
        })
        return { average: subjectAverage(items), coefficient: csById.get(csId)?.subjects?.coefficient ?? 1 }
      })
      const ov = overallAverage(subjectAverages)
      if (ov !== null) { sum += ov; n++ }
    }
    const average = n > 0 ? round2(sum / n) : null
    classAverages.push({ classId: c.id, className: label(c.name, c.section), average, gradedStudents: n, totalStudents: studentIds.length })
    globalSum += sum
    globalCount += n
  }

  return {
    assessmentsCreated: assessments.length,
    gradesEntered:      grades.length,
    pendingCount:       pending.length,
    pending,
    classAverages,
    overall: globalCount > 0 ? round2(globalSum / globalCount) : null,
  }
}
