// ─── Audit logging helper ───────────────────────────────────────────────────
//
// Thin, best-effort wrapper over the SECURITY DEFINER `log_audit_event` RPC.
// Because the function runs as its owner, it can be invoked with the caller's
// session client (no service-role key needed) and still write to audit_logs.
//
// Best-effort contract: this NEVER throws and NEVER blocks the user flow. A
// failure to write the audit row is logged server-side and swallowed — the
// mutation it describes has already succeeded by the time this is called.

import { logSupabaseError } from '@/lib/errors'

// Structural type matching both the session and admin Supabase clients' rpc().
type RpcCapableClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null }>
}

export type AuditEvent = {
  actorId:      string
  actorEmail?:  string | null
  action:       string
  resourceType: string
  resourceId:   string
  schoolId:     string
  metadata?:    Record<string, unknown>
}

/**
 * Append an audit log entry. Call ONLY after the described mutation has
 * succeeded. Safe to await; resolves even when the write fails.
 */
export async function logAuditEvent(client: RpcCapableClient, e: AuditEvent): Promise<void> {
  try {
    const { error } = await client.rpc('log_audit_event', {
      p_actor_id:      e.actorId,
      p_actor_email:   e.actorEmail ?? null,
      p_action:        e.action,
      p_resource_type: e.resourceType,
      p_resource_id:   e.resourceId,
      p_school_id:     e.schoolId,
      p_metadata:      e.metadata ?? {},
    })
    if (error) {
      logSupabaseError(error, {
        action:    `audit:${e.action}`,
        schoolId:  e.schoolId,
        userId:    e.actorId,
        entityIds: { resourceType: e.resourceType, resourceId: e.resourceId },
      })
    }
  } catch (err) {
    // Never let an audit failure surface to the user.
    console.error(`[audit] unexpected failure for action=${e.action}`, err)
  }
}
