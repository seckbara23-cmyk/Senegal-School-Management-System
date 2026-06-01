'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOverdueInvoices, type OverdueJobSummary } from '@/lib/notification-jobs'

export type OverdueJobState = {
  summary?: OverdueJobSummary
  error?:   string
  ranAt?:   string
}

async function isSuperAdmin(): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .maybeSingle()
  return (profile as { global_role: string } | null)?.global_role === 'super_admin'
}

// Manual trigger for the overdue-invoice notification job. Super-admin only.
// Runs the job with the service-role client (cross-tenant scan) and returns the
// summary counts for display. No cron yet — this is the manual entry point.
export async function runOverdueInvoicesJob(
  _prevState: OverdueJobState,
  _formData: FormData,
): Promise<OverdueJobState> {
  if (!(await isSuperAdmin())) return { error: 'Non autorisé.' }

  const admin = createAdminClient()
  const summary = await notifyOverdueInvoices(admin)

  return { summary, ranAt: new Date().toISOString() }
}
