import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type StudentCtx = {
  supabase:   ReturnType<typeof createClient>
  userId:     string
  schoolId:   string
  schoolName: string
  student: {
    id:               string
    first_name:       string
    last_name:        string
    admission_number: string
    status:           string
  }
}

// Shared auth helper for every student portal page.
// Redirects to /login if unauthenticated, to /dashboard if no student role.
// Student record is resolved via profile_id — never from URL params.
export async function requireStudentCtx(): Promise<StudentCtx> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name)')
    .eq('user_id', user.id)
    .eq('role', 'student')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const schoolId   = (membership as unknown as { school_id: string }).school_id
  const schoolName = (membership.schools as unknown as { name: string } | null)?.name ?? ''

  const { data: student } = await supabase
    .from('students')
    .select('id, first_name, last_name, admission_number, status')
    .eq('profile_id', user.id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!student) redirect('/dashboard')

  return { supabase, userId: user.id, schoolId, schoolName, student }
}
