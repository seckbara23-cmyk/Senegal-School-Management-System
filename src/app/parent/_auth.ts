import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type ParentCtx = {
  supabase:   ReturnType<typeof createClient>
  userId:     string
  schoolId:   string
  schoolName: string
  parent: {
    id:         string
    first_name: string
    last_name:  string
  }
}

// Shared auth/ownership helper used by every parent portal page.
// Redirects to /login if unauthenticated, to /dashboard if no parent role.
// Returns null and redirects if the parent record doesn't exist yet — no page
// should render without a resolved parent row.
export async function requireParentCtx(): Promise<ParentCtx> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name)')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const schoolId   = (membership as unknown as { school_id: string }).school_id
  const schoolName = (membership.schools as unknown as { name: string } | null)?.name ?? ''

  const { data: parent } = await supabase
    .from('parents')
    .select('id, first_name, last_name')
    .eq('profile_id', user.id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!parent) redirect('/dashboard')

  return { supabase, userId: user.id, schoolId, schoolName, parent }
}
