import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Shared super-admin guard for the platform-operations pages.
export async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('global_role').eq('id', user.id).single()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')
  return { supabase, user }
}
