import type { createClient } from '@/lib/supabase/server'
import type { GenClassSubject, TimeWindow, ExistingSlot } from '@/lib/timetable/generator'

type SchoolClient = ReturnType<typeof createClient>

export type GenerationData = {
  classes:       { id: string; name: string; section: string | null }[]
  classSubjects: GenClassSubject[]
  teachers:      { id: string; name: string }[]
  availability:  TimeWindow[]
  existing:      ExistingSlot[]
}

// Loads everything the generator needs for one school + academic year. Used by
// both the wizard preview (page) and the authoritative save action, so they
// schedule from identical data. Tenant-scoped on every query.
export async function loadGenerationData(
  supabase: SchoolClient,
  schoolId: string,
  yearId: string,
): Promise<GenerationData> {
  const [classesRes, csRes, teachersRes, availRes, existingRes] = await Promise.all([
    supabase.from('classes').select('id, name, section').eq('school_id', schoolId).eq('academic_year_id', yearId).order('name'),
    supabase
      .from('class_subjects')
      .select('id, class_id, hours_per_week, subjects!subject_id(name), teacher_subject_assignments!class_subject_id(teacher_id)')
      .eq('school_id', schoolId).eq('academic_year_id', yearId),
    supabase.from('teachers').select('id, first_name, last_name').eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('teacher_availability').select('teacher_id, day_of_week, start_time, end_time').eq('school_id', schoolId),
    supabase.from('timetable_slots').select('class_id, class_subject_id, teacher_id, day_of_week, start_time, end_time').eq('school_id', schoolId).eq('academic_year_id', yearId),
  ])

  const classes = ((classesRes.data ?? []) as { id: string; name: string; section: string | null }[])

  type TEmbed = { teacher_id: string }
  type CSRow = { id: string; class_id: string; hours_per_week: number | null; subjects: { name: string } | null; teacher_subject_assignments: TEmbed | TEmbed[] | null }
  const classSubjects: GenClassSubject[] = ((csRes.data ?? []) as unknown as CSRow[]).map((cs) => {
    const tsa = cs.teacher_subject_assignments
    const teacherRow = Array.isArray(tsa) ? tsa[0] : tsa
    return {
      classSubjectId: cs.id,
      classId:        cs.class_id,
      teacherId:      teacherRow?.teacher_id ?? null,
      subjectName:    cs.subjects?.name ?? 'Matière',
      hoursPerWeek:   cs.hours_per_week ?? 1,
    }
  })

  const teachers = ((teachersRes.data ?? []) as { id: string; first_name: string; last_name: string }[])
    .map((t) => ({ id: t.id, name: `${t.last_name} ${t.first_name}` }))

  const availability: TimeWindow[] = ((availRes.data ?? []) as { teacher_id: string; day_of_week: number; start_time: string; end_time: string }[])
    .map((a) => ({ teacherId: a.teacher_id, day: a.day_of_week, start: a.start_time.slice(0, 5), end: a.end_time.slice(0, 5) }))

  const existing: ExistingSlot[] = ((existingRes.data ?? []) as { class_id: string; class_subject_id: string; teacher_id: string | null; day_of_week: number; start_time: string; end_time: string }[])
    .map((e) => ({ classId: e.class_id, classSubjectId: e.class_subject_id, teacherId: e.teacher_id, day: e.day_of_week, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5) }))

  return { classes, classSubjects, teachers, availability, existing }
}
