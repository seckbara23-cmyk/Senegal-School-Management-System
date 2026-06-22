import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type TransportAdminCtx = {
  supabase:   ReturnType<typeof createClient>
  schoolId:   string
  schoolName: string
}

// Page-level guard for the school-admin transport pages. Mirrors the inline
// membership check used across the other /school pages, centralised because the
// transport module has many pages. Redirects unauthenticated users to /login
// and non-admins to /school.
export async function requireTransportAdmin(): Promise<TransportAdminCtx> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // NOTE: a user may hold MORE THAN ONE active school_admin membership (see
  // (app)/layout.tsx). .maybeSingle() ERRORS on multiple rows → membership=null
  // → a wrong redirect to /school. .order(...).limit(1) makes it safe, matching
  // requireParentCtx / requireTeacherCtx / requireFinanceOfficerCtx.
  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools(name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId   = (membership as { school_id: string }).school_id
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools?.name) ?? ''
  return { supabase, schoolId, schoolName }
}
