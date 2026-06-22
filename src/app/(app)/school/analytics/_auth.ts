import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type AnalyticsCtx = {
  supabase: ReturnType<typeof createClient>
  userId: string
  schoolId: string
  schoolName: string
}

// Shared school-admin guard for every analytics page (read-only).
export async function requireAnalyticsCtx(): Promise<AnalyticsCtx> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id, schools!school_id(name)')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools?.name) ?? ''
  return { supabase, userId: user.id, schoolId, schoolName }
}
