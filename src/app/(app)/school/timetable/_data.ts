import { createClient } from '@/lib/supabase/server'
import type { AcademicYearOption, ClassOption, ClassSubjectOption, TeacherOption } from './_form'

// Loads the option lists the create/edit timetable form needs, all scoped to
// the given school.
export async function loadTimetableFormOptions(
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
): Promise<{
  academicYears: AcademicYearOption[]
  classes:       ClassOption[]
  classSubjects: ClassSubjectOption[]
  teachers:      TeacherOption[]
}> {
  const [yearsRes, classesRes, csRes, tsaRes, teachersRes] = await Promise.all([
    supabase.from('academic_years').select('id, name, starts_on').eq('school_id', schoolId).order('starts_on', { ascending: false }),
    supabase.from('classes').select('id, name, section, level, academic_year_id').eq('school_id', schoolId).order('name'),
    supabase.from('class_subjects').select('id, class_id, subjects!subject_id(name)').eq('school_id', schoolId),
    supabase.from('teacher_subject_assignments').select('class_subject_id, teacher_id').eq('school_id', schoolId),
    supabase.from('teachers').select('id, first_name, last_name').eq('school_id', schoolId).order('last_name'),
  ])

  const academicYears: AcademicYearOption[] = ((yearsRes.data ?? []) as { id: string; name: string }[])
    .map((y) => ({ id: y.id, label: y.name }))

  const classes: ClassOption[] = ((classesRes.data ?? []) as { id: string; name: string; section: string | null; academic_year_id: string }[])
    .map((c) => ({ id: c.id, label: [c.name, c.section].filter(Boolean).join(' '), academic_year_id: c.academic_year_id }))

  const tsaMap = new Map<string, string>()
  for (const a of (tsaRes.data ?? []) as { class_subject_id: string; teacher_id: string }[]) {
    tsaMap.set(a.class_subject_id, a.teacher_id)
  }

  type CSRow = { id: string; class_id: string; subjects: { name: string } | null }
  const classSubjects: ClassSubjectOption[] = ((csRes.data ?? []) as unknown as CSRow[])
    .map((cs) => ({
      id:         cs.id,
      class_id:   cs.class_id,
      label:      cs.subjects?.name ?? 'Matière',
      teacher_id: tsaMap.get(cs.id) ?? null,
    }))

  const teachers: TeacherOption[] = ((teachersRes.data ?? []) as { id: string; first_name: string; last_name: string }[])
    .map((t) => ({ id: t.id, label: `${t.first_name} ${t.last_name}` }))

  return { academicYears, classes, classSubjects, teachers }
}
