// ─── Tenant write-protection guard ──────────────────────────────────────────
//
// Defense-in-depth for the school lifecycle (Phase 35). Normal school users of
// a suspended/archived tenant are already blocked at the (app) layout, but a
// crafted POST or stale form could still reach a server action directly. Every
// school-scoped mutation calls isSchoolWritable() before writing.
//
// Writability is tied to the single schools.subscription_status column:
//   active                       → writable
//   inactive / suspended / archived (or missing/unknown) → blocked
//
// Super-admin tenant-management actions do NOT use this guard — managing a
// suspended or archived tenant (e.g. reactivating it) must remain possible.

import { createClient } from '@/lib/supabase/server'
import { logSupabaseError } from '@/lib/errors'

export const TENANT_WRITE_BLOCKED_MESSAGE =
  'Cet établissement est suspendu ou archivé. Les modifications sont désactivées.'

type SchoolClient = ReturnType<typeof createClient>

/**
 * True only when the school is in the 'active' lifecycle state. Fails closed:
 * a missing row or a query error returns false so writes are blocked rather
 * than silently allowed.
 */
export async function isSchoolWritable(client: SchoolClient, schoolId: string): Promise<boolean> {
  const { data, error } = await client
    .from('schools')
    .select('subscription_status')
    .eq('id', schoolId)
    .maybeSingle()

  if (error) {
    logSupabaseError(error, { action: 'isSchoolWritable', schoolId })
    return false
  }

  return (data as { subscription_status: string } | null)?.subscription_status === 'active'
}
