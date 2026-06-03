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

// ─── Subscription quota guards (Phase 50.2) ──────────────────────────────────
//
// These enforce the plan limits seeded in migration 039. They are QUOTA checks,
// NOT a security/access gate — the access gate stays isSchoolWritable (which is
// fail-CLOSED). A school's billing status (school_subscriptions.status) is NOT
// consulted here and never blocks creation in this phase.
//
// FAIL OPEN by design: an unlimited plan, a missing subscription row, OR any RPC
// error (e.g. migration 039 not yet applied) all return true, so the quota
// subsystem can never block a school's core operations when it is unavailable.
// The underlying DB helpers (check_school_*_limit) already return TRUE when no
// subscription/plan is on file.

export const STUDENT_LIMIT_REACHED_MESSAGE =
  "La limite d'élèves de votre abonnement est atteinte. Contactez l'administrateur de la plateforme pour augmenter votre plan."

export const TEACHER_LIMIT_REACHED_MESSAGE =
  "La limite d'enseignants de votre abonnement est atteinte. Contactez l'administrateur de la plateforme pour augmenter votre plan."

/** True when the school may add another ACTIVE student (or is unlimited). Fails open. */
export async function canAddStudent(client: SchoolClient, schoolId: string): Promise<boolean> {
  const { data, error } = await client.rpc('check_school_student_limit', { p_school_id: schoolId })
  if (error) {
    logSupabaseError(error, { action: 'canAddStudent', schoolId })
    return true // fail open — never block on a quota-check failure
  }
  return data !== false
}

/** True when the school may add another ACTIVE teacher (or is unlimited). Fails open. */
export async function canAddTeacher(client: SchoolClient, schoolId: string): Promise<boolean> {
  const { data, error } = await client.rpc('check_school_teacher_limit', { p_school_id: schoolId })
  if (error) {
    logSupabaseError(error, { action: 'canAddTeacher', schoolId })
    return true // fail open
  }
  return data !== false
}

/** Structured server log when a plan quota blocks a create action (informational, not an error). */
export function logLimitBlocked(
  kind: 'student' | 'teacher',
  ctx: { schoolId: string; userId?: string | null },
): void {
  console.warn(`[subscription-limit-blocked] kind=${kind}`, {
    schoolId: ctx.schoolId,
    userId: ctx.userId ?? null,
  })
}
