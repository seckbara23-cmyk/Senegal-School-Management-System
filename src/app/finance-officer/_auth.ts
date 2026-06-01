import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type FinanceOfficerCtx = {
  supabase:   ReturnType<typeof createClient>
  userId:     string
  schoolId:   string
  schoolName: string
}

// Shared auth helper for every finance-officer portal page.
// Redirects to /login if unauthenticated, to /dashboard if no active
// finance_officer membership. The school_id is ALWAYS resolved from the
// finance_officer membership — never read from a URL param — so a finance
// officer can only ever act within their own school.
export async function requireFinanceOfficerCtx(): Promise<FinanceOfficerCtx> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools!school_id(name)')
    .eq('user_id', user.id)
    .eq('role', 'finance_officer')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const schoolId   = (membership as unknown as { school_id: string }).school_id
  const schoolName = (membership.schools as unknown as { name: string } | null)?.name ?? ''

  return { supabase, userId: user.id, schoolId, schoolName }
}
