// ─── Server-action error diagnostics & user-facing message mapping ────────────
//
// Goals:
//   • Log the FULL Supabase/Postgres error server-side (code, message, details,
//     hint) with action + actor + school + entity context, so failures are
//     diagnosable from server logs.
//   • Never expose raw database errors to end users. Callers receive a friendly
//     French message only.
//
// These helpers are imported only by `'use server'` action modules, so the raw
// error text never reaches the client bundle.

type SupabaseLikeError =
  | {
      code?: string | null
      message?: string | null
      details?: string | null
      hint?: string | null
    }
  | null
  | undefined

export type ErrorLogContext = {
  /** Stable action name, e.g. 'createStudent'. */
  action: string
  schoolId?: string | null
  userId?: string | null
  /** Any relevant business identifiers (admission_number, invoice_id, …). */
  entityIds?: Record<string, string | number | boolean | null | undefined>
}

/** Generic, safe fallback shown when no specific mapping applies. */
export const GENERIC_ERROR_MESSAGE = 'Une erreur est survenue. Veuillez réessayer.'

/**
 * Log a Supabase/Postgres error to the server console with full diagnostic
 * detail and context. Never called on the happy path; safe to call with a
 * null/undefined error (e.g. an empty `.single()` result).
 */
export function logSupabaseError(error: SupabaseLikeError, ctx: ErrorLogContext): void {
  console.error(`[server-action-error] action=${ctx.action}`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    schoolId: ctx.schoolId ?? null,
    userId: ctx.userId ?? null,
    entityIds: ctx.entityIds ?? {},
  })
}

/**
 * Map a Postgres / PostgREST error code to a friendly French message.
 * Returns null when there is no specific mapping (caller falls back to generic
 * or a constraint-specific message).
 */
export function mapPostgresErrorToFrenchMessage(error: SupabaseLikeError): string | null {
  switch (error?.code) {
    case '23505': // unique_violation
      return 'Une entrée identique existe déjà.'
    case '23503': // foreign_key_violation
      return "Référence liée invalide : l'élément n'existe pas ou n'appartient pas à votre établissement."
    case '23502': // not_null_violation
      return 'Un champ obligatoire est manquant.'
    case '23514': // check_violation
      return "Une valeur saisie n'est pas autorisée."
    case '23P01': // exclusion_violation
      return 'Conflit avec une entrée existante.'
    case '42501': // insufficient_privilege (RLS)
      return "Permission refusée : vous n'avez pas les droits nécessaires pour cette action."
    case '42703': // undefined_column
    case 'PGRST204': // PostgREST: column not found in schema cache
      return "La base de données n'est pas à jour (champ manquant). Contactez l'administrateur."
    case 'PGRST301': // PostgREST: JWT / auth issue
      return 'Session expirée. Veuillez vous reconnecter.'
    default:
      return null
  }
}

/** Maps a (partial) unique-constraint name to a friendly message + optional field. */
export type ConstraintMessageMap = Record<string, { field?: string; message: string }>

/**
 * The canonical create/update error handler for server actions.
 *
 * 1. Logs the raw error server-side (code/message/details/hint + context).
 * 2. On a unique violation (23505), if a matching constraint name is provided,
 *    routes a friendly message to the relevant field.
 * 3. Otherwise returns a code-mapped friendly message, or `fallback`/generic.
 *
 * The returned shape (`Record<string, string[]>`) is compatible with every
 * action's `errors` object (field arrays + `_form`).
 */
export function formatServerActionError(
  error: SupabaseLikeError,
  ctx: ErrorLogContext & { constraints?: ConstraintMessageMap; fallback?: string },
): Record<string, string[]> {
  logSupabaseError(error, ctx)

  if (error?.code === '23505' && ctx.constraints) {
    const haystack = `${error.message ?? ''} ${error.details ?? ''}`
    for (const [name, cfg] of Object.entries(ctx.constraints)) {
      if (haystack.includes(name)) {
        return cfg.field ? { [cfg.field]: [cfg.message] } : { _form: [cfg.message] }
      }
    }
  }

  return {
    _form: [mapPostgresErrorToFrenchMessage(error) ?? ctx.fallback ?? GENERIC_ERROR_MESSAGE],
  }
}
