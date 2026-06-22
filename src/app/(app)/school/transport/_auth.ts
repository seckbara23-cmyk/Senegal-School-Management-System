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

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools(name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId   = (membership as { school_id: string }).school_id
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools?.name) ?? ''
  return { supabase, schoolId, schoolName }
}
