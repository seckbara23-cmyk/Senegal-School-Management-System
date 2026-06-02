// Exam session results computation (server-only).
//
// Mirrors the bulletin/ranking maths: scores are normalized to /20, weighted
// by assessment coefficient for subject averages, then weighted by subject
// coefficient for the overall average.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function mentionLabel(avg: number): string {
  if (avg >= 16) return 'Tr\u00e8s bien'
  if (avg >= 14) return 'Bien'
  if (avg >= 12) return 'Assez bien'
  if (avg >= 10) return 'Passable'
  return 'Insuffisant'
}

export type StudentResult = {
  studentId:   string
  name:        string
  admission:   string
  average:     number | null
  rank:        number | null
  mention:     string | null
  gradedCount: number
  expected:    number
  missing:     number
  completion:  number
}

export type ClassResult = {
  classId:   string
  className: string
  students:  StudentResult[]
}

export type CompletionRow = {
  csId:      string
  subject:   string
  className: string
  teacher:   string | null
  graded:    number
  expected:  number
}

export type ExamResults = {
  classes:    ClassResult[]
  completion: CompletionRow[]
  summary: {
    students:       number
    gradedStudents: number
    average:        number | null
    passRate:       number | null
    missingGrades:  number
  }
  classOptions: { id: string; label: string }[]
}

type ClassRow = {
  id: string
  name: string
  level: string | null
  section: string | null
}

type AssessmentRow = {
  id: string
  coefficient: number
  max_score: number
  class_subject_id: string
}

type ClassSubjectRow = {
  id: string
  class_id: string
  subjects: { name: string; coefficient: number | null } | null
  classes: { name: string; section: string | null } | null
  teacher_subject_assignments: Array<{
    teachers: { first_name: string; last_name: string } | null
  }>
}

type EnrollmentRow = {
  student_id: string
  class_id: string
}

type StudentRow = {
  id: string
  first_name: string
  last_name: string
  admission_number: string
}

type GradeRow = {
  assessment_id: string
  student_id: string
  score: number
}

function emptyResults(classOptions: { id: string; label: string }[] = []): ExamResults {
  return {
    classes: [],
    completion: [],
    summary: {
      students: 0,
      gradedStudents: 0,
      average: null,
      passRate: null,
      missingGrades: 0,
    },
    classOptions,
  }
}

function classLabel(c: ClassRow): string {
  return [c.name, c.section ?? c.level].filter(Boolean).join(' ')
}

export async function computeExamResults(
  client: Client,
  schoolId: string,
  academicYearId: string,
  sessionId: string,
  classFilter: string | null,
): Promise<ExamResults> {
  const { data: classData } = await client
    .from('classes')
    .select('id, name, level, section')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('name', { ascending: true })

  const classRows = (classData ?? []) as ClassRow[]
  const classMeta = new Map<string, string>()
  for (const c of classRows) classMeta.set(c.id, classLabel(c))

  const classOptions = classRows.map((c) => ({ id: c.id, label: classMeta.get(c.id) ?? c.name }))
  const activeClassIds = classFilter
    ? classMeta.has(classFilter) ? [classFilter] : []
    : Array.from(classMeta.keys())

  if (activeClassIds.length === 0) return emptyResults(classOptions)

  const { data: assessmentData } = await client
    .from('assessments')
    .select('id, coefficient, max_score, class_subject_id')
    .eq('school_id', schoolId)
    .eq('exam_session_id', sessionId)

  const assessments = (assessmentData ?? []) as AssessmentRow[]
  if (assessments.length === 0) return emptyResults(classOptions)

  const classSubjectIds = Array.from(new Set(assessments.map((a) => a.class_subject_id)))
  const { data: classSubjectData } = await client
    .from('class_subjects')
    .select('id, class_id, subjects!subject_id(name, coefficient), classes!class_id(name, section), teacher_subject_assignments!class_subject_id(teachers!teacher_id(first_name, last_name))')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .in('id', classSubjectIds)

  const classSubjects = (classSubjectData ?? []) as unknown as ClassSubjectRow[]
  const classSubjectMap = new Map<string, ClassSubjectRow>()
  for (const cs of classSubjects) {
    if (classMeta.has(cs.class_id)) classSubjectMap.set(cs.id, cs)
  }

  const assessmentsByClassSubject = new Map<string, AssessmentRow[]>()
  for (const a of assessments) {
    if (!classSubjectMap.has(a.class_subject_id)) continue
    if (!assessmentsByClassSubject.has(a.class_subject_id)) assessmentsByClassSubject.set(a.class_subject_id, [])
    assessmentsByClassSubject.get(a.class_subject_id)!.push(a)
  }

  const classSubjectsByClass = new Map<string, string[]>()
  for (const cs of Array.from(classSubjectMap.values())) {
    if (!classSubjectsByClass.has(cs.class_id)) classSubjectsByClass.set(cs.class_id, [])
    classSubjectsByClass.get(cs.class_id)!.push(cs.id)
  }

  const { data: enrollmentData } = await client
    .from('student_class_enrollments')
    .select('student_id, class_id')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .eq('status', 'active')
    .in('class_id', activeClassIds)

  const enrollments = (enrollmentData ?? []) as EnrollmentRow[]
  const studentIds = Array.from(new Set(enrollments.map((e) => e.student_id)))

  const studentMeta = new Map<string, { name: string; admission: string }>()
  if (studentIds.length > 0) {
    const { data: studentData } = await client
      .from('students')
      .select('id, first_name, last_name, admission_number')
      .eq('school_id', schoolId)
      .in('id', studentIds)

    for (const s of (studentData ?? []) as StudentRow[]) {
      studentMeta.set(s.id, { name: `${s.last_name} ${s.first_name}`.trim(), admission: s.admission_number })
    }
  }

  const sessionAssessmentIds = assessments.map((a) => a.id)
  const { data: gradeData } = sessionAssessmentIds.length > 0
    ? await client
        .from('grades')
        .select('assessment_id, student_id, score')
        .eq('school_id', schoolId)
        .in('assessment_id', sessionAssessmentIds)
    : { data: [] }

  const gradeIndex = new Map<string, Map<string, number>>()
  for (const g of (gradeData ?? []) as GradeRow[]) {
    if (!gradeIndex.has(g.assessment_id)) gradeIndex.set(g.assessment_id, new Map())
    gradeIndex.get(g.assessment_id)!.set(g.student_id, g.score)
  }

  const studentsByClass = new Map<string, string[]>()
  for (const e of enrollments) {
    if (!studentsByClass.has(e.class_id)) studentsByClass.set(e.class_id, [])
    studentsByClass.get(e.class_id)!.push(e.student_id)
  }

  function subjectAverage(classSubjectId: string, studentId: string): number | null {
    let weightedSum = 0
    let totalWeight = 0

    for (const a of assessmentsByClassSubject.get(classSubjectId) ?? []) {
      const score = gradeIndex.get(a.id)?.get(studentId)
      if (score !== undefined) {
        weightedSum += (score / a.max_score) * 20 * a.coefficient
        totalWeight += a.coefficient
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null
  }

  function overallAverage(classId: string, studentId: string): number | null {
    let weightedSum = 0
    let totalWeight = 0

    for (const classSubjectId of classSubjectsByClass.get(classId) ?? []) {
      const avg = subjectAverage(classSubjectId, studentId)
      if (avg !== null) {
        const coefficient = classSubjectMap.get(classSubjectId)?.subjects?.coefficient ?? 1
        weightedSum += avg * coefficient
        totalWeight += coefficient
      }
    }

    return totalWeight > 0 ? round2(weightedSum / totalWeight) : null
  }

  const classes: ClassResult[] = []
  let totalStudents = 0
  let gradedStudents = 0
  let missingGrades = 0
  let averageSum = 0
  let averageCount = 0
  let passCount = 0

  for (const classId of activeClassIds) {
    const classAssessmentIds = (classSubjectsByClass.get(classId) ?? [])
      .flatMap((classSubjectId) => (assessmentsByClassSubject.get(classSubjectId) ?? []).map((a) => a.id))
    const expected = classAssessmentIds.length
    if (expected === 0) continue

    const rows: StudentResult[] = (studentsByClass.get(classId) ?? []).map((studentId) => {
      const gradedCount = classAssessmentIds.filter((assessmentId) => gradeIndex.get(assessmentId)?.has(studentId)).length
      const average = overallAverage(classId, studentId)
      return {
        studentId,
        name: studentMeta.get(studentId)?.name ?? '-',
        admission: studentMeta.get(studentId)?.admission ?? '',
        average,
        rank: null,
        mention: average !== null ? mentionLabel(average) : null,
        gradedCount,
        expected,
        missing: expected - gradedCount,
        completion: expected > 0 ? Math.round((gradedCount / expected) * 100) : 0,
      }
    })

    const rankedAverages = rows.map((r) => r.average).filter((avg): avg is number => avg !== null)
    for (const r of rows) {
      if (r.average !== null) r.rank = 1 + rankedAverages.filter((avg) => avg > r.average!).length
    }

    rows.sort((a, b) => {
      if (a.average === null && b.average === null) return a.name.localeCompare(b.name)
      if (a.average === null) return 1
      if (b.average === null) return -1
      return (a.rank ?? 0) - (b.rank ?? 0) || b.average - a.average || a.name.localeCompare(b.name)
    })

    totalStudents += rows.length
    for (const r of rows) {
      missingGrades += r.missing
      if (r.average !== null) {
        gradedStudents++
        averageSum += r.average
        averageCount++
        if (r.average >= 10) passCount++
      }
    }

    classes.push({ classId, className: classMeta.get(classId) ?? '-', students: rows })
  }

  const completion: CompletionRow[] = []
  for (const cs of Array.from(classSubjectMap.values())) {
    if (!activeClassIds.includes(cs.class_id)) continue

    const csAssessments = assessmentsByClassSubject.get(cs.id) ?? []
    const enrolledIds = new Set(studentsByClass.get(cs.class_id) ?? [])
    const expected = enrolledIds.size * csAssessments.length
    let graded = 0

    for (const a of csAssessments) {
      const grades = gradeIndex.get(a.id)
      if (!grades) continue
      for (const studentId of Array.from(grades.keys())) {
        if (enrolledIds.has(studentId)) graded++
      }
    }

    const teacher = cs.teacher_subject_assignments?.[0]?.teachers ?? null
    completion.push({
      csId: cs.id,
      subject: cs.subjects?.name ?? '-',
      className: classMeta.get(cs.class_id) ?? '-',
      teacher: teacher ? `${teacher.first_name} ${teacher.last_name}` : null,
      graded,
      expected,
    })
  }

  completion.sort((a, b) => a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject))

  return {
    classes,
    completion,
    summary: {
      students: totalStudents,
      gradedStudents,
      average: averageCount > 0 ? round2(averageSum / averageCount) : null,
      passRate: gradedStudents > 0 ? Math.round((passCount / gradedStudents) * 100) : null,
      missingGrades,
    },
    classOptions,
  }
}
