import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type TeacherCtx = {
  supabase:                ReturnType<typeof createClient>
  userId:                  string
  schoolId:                string
  schoolName:              string
  teacher: {
    id:               string
    first_name:       string
    last_name:        string
    employee_number:  string
  }
  // IDs of class_subjects assigned to this teacher — used for ownership checks
  assignedClassSubjectIds: string[]
}

// Shared auth/ownership helper used by every teacher portal page.
// Redirects to /login if unauthenticated, to /dashboard if no active
// teacher membership or if the teacher record is not yet linked.
// teacher_id is NEVER read from URL params — it is always resolved from
// auth.uid() → school_memberships → teachers.profile_id.
export async function requireTeacherCtx(): Promise<TeacherCtx> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name)')
    .eq('user_id', user.id)
    .eq('role', 'teacher')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const schoolId   = (membership as unknown as { school_id: string }).school_id
  const schoolName = (membership.schools as unknown as { name: string } | null)?.name ?? ''

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, employee_number')
    .eq('profile_id', user.id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!teacher) redirect('/dashboard')

  // Load the teacher's own class_subject assignments.
  // RLS (migration 020) ensures only own rows are returned.
  const { data: assignments } = await supabase
    .from('teacher_subject_assignments')
    .select('class_subject_id')
    .eq('teacher_id', teacher.id)
    .eq('school_id', schoolId)

  const assignedClassSubjectIds = ((assignments ?? []) as { class_subject_id: string }[])
    .map((a) => a.class_subject_id)

  return {
    supabase,
    userId: user.id,
    schoolId,
    schoolName,
    teacher: teacher as { id: string; first_name: string; last_name: string; employee_number: string },
    assignedClassSubjectIds,
  }
}
