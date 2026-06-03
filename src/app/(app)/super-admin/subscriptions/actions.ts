'use server'

import { createClient }     from '@/lib/supabase/server'
import { redirect }         from 'next/navigation'
import { z }                from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent }    from '@/lib/audit'

// ─── Super-admin guard ───────────────────────────────────────────────────────
// Checks the caller's own identity via the session client (never trusts input).
async function resolveSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()

  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') return null
  return { supabase, id: user.id, email: user.email ?? '' }
}

const SUB_STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'cancelled'] as const

const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A YYYY-MM-DD form value becomes midnight UTC on that day; blank becomes null.
function dateToTs(d: string | undefined): string | null {
  return d ? `${d}T00:00:00.000Z` : null
}

// ─── Update subscription ───────────────────────────────────────────────────────

const UpdateSchema = z.object({
  school_id:            z.string().uuid('École invalide.'),
  plan_id:              z.string().uuid('Formule invalide.'),
  status:               z.enum(SUB_STATUSES, { error: 'Statut invalide.' }),
  trial_ends_at:        z.preprocess(emptyToUndef, z.string().regex(DATE_RE, 'Date invalide (AAAA-MM-JJ).').optional()),
  current_period_start: z.preprocess(emptyToUndef, z.string().regex(DATE_RE, 'Date invalide (AAAA-MM-JJ).').optional()),
  current_period_end:   z.preprocess(emptyToUndef, z.string().regex(DATE_RE, 'Date invalide (AAAA-MM-JJ).').optional()),
})

export type SubscriptionEditState = {
  errors?: {
    plan_id?:              string[]
    status?:               string[]
    trial_ends_at?:        string[]
    current_period_start?: string[]
    current_period_end?:   string[]
    _form?:                string[]
  }
}

// Shown when the subscription tables/columns are not present (migration 039 not
// yet applied). Lets the console fail gracefully instead of a raw DB error.
const MODULE_MISSING_MESSAGE =
  "Le module d'abonnements n'est pas initialisé sur cette base (migration 039). Contactez l'équipe technique."

function isMissingModuleError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||   // undefined_table
    error.code === 'PGRST205' || // PostgREST: table not found in schema cache
    /relation .* does not exist/i.test(error.message ?? '')
  )
}

export async function updateSubscription(
  _prevState: SubscriptionEditState,
  formData: FormData,
): Promise<SubscriptionEditState> {
  const actor = await resolveSuperAdmin()
  if (!actor) return { errors: { _form: ['Non autorisé.'] } }
  const { supabase } = actor

  const parsed = UpdateSchema.safeParse({
    school_id:            formData.get('school_id'),
    plan_id:              formData.get('plan_id'),
    status:               formData.get('status'),
    trial_ends_at:        formData.get('trial_ends_at'),
    current_period_start: formData.get('current_period_start'),
    current_period_end:   formData.get('current_period_end'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as SubscriptionEditState['errors'] }
  }
  const d = parsed.data

  // Plan must exist.
  const { data: plan, error: planErr } = await supabase
    .from('subscription_plans').select('id, code').eq('id', d.plan_id).maybeSingle()
  if (isMissingModuleError(planErr)) return { errors: { _form: [MODULE_MISSING_MESSAGE] } }
  if (!plan) return { errors: { plan_id: ['Formule introuvable.'] } }

  // Current row (for audit diff + existence).
  const { data: before, error: beforeErr } = await supabase
    .from('school_subscriptions')
    .select('id, plan_id, status, trial_ends_at, current_period_start, current_period_end, cancelled_at')
    .eq('school_id', d.school_id)
    .maybeSingle()
  if (isMissingModuleError(beforeErr)) return { errors: { _form: [MODULE_MISSING_MESSAGE] } }
  if (!before) return { errors: { _form: ['Abonnement introuvable pour cette école.'] } }
  const prev = before as {
    id: string; plan_id: string; status: string
    trial_ends_at: string | null; current_period_start: string | null
    current_period_end: string | null; cancelled_at: string | null
  }

  // cancelled_at is set when entering 'cancelled' (kept if already cancelled),
  // and cleared when moving back to any non-cancelled status.
  const cancelledAt =
    d.status === 'cancelled'
      ? (prev.cancelled_at ?? new Date().toISOString())
      : null

  const update = {
    plan_id:              d.plan_id,
    status:               d.status,
    trial_ends_at:        dateToTs(d.trial_ends_at),
    current_period_start: dateToTs(d.current_period_start),
    current_period_end:   dateToTs(d.current_period_end),
    cancelled_at:         cancelledAt,
    updated_at:           new Date().toISOString(),
  }

  const { error } = await supabase
    .from('school_subscriptions').update(update).eq('school_id', d.school_id)

  if (error) {
    if (isMissingModuleError(error)) return { errors: { _form: [MODULE_MISSING_MESSAGE] } }
    logSupabaseError(error, { action: 'updateSubscription', schoolId: d.school_id, userId: actor.id, entityIds: { plan_id: d.plan_id, status: d.status } })
    return { errors: { _form: ["Erreur lors de l'enregistrement. Veuillez réessayer."] } }
  }

  const isCancel = d.status === 'cancelled' && prev.status !== 'cancelled'
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId: d.school_id,
    action: isCancel ? 'subscription_cancelled' : 'subscription_updated',
    resourceType: 'subscription', resourceId: prev.id,
    metadata: {
      changes: {
        plan:   { old: prev.plan_id, new: d.plan_id },
        status: { old: prev.status, new: d.status },
      },
    },
  })

  redirect(`/super-admin/subscriptions/${d.school_id}?ok=updated`)
}

// ─── Cancel subscription (shortcut) ──────────────────────────────────────────
// Sets status='cancelled' + cancelled_at. Does NOT touch the school access
// lifecycle (schools.subscription_status) — billing and access are separate.

export async function cancelSubscription(formData: FormData): Promise<void> {
  const actor = await resolveSuperAdmin()
  if (!actor) redirect('/dashboard')
  const { supabase } = actor

  const schoolId = z.string().uuid().safeParse(formData.get('school_id'))
  if (!schoolId.success) redirect('/super-admin/subscriptions')

  const { data: before, error: beforeErr } = await supabase
    .from('school_subscriptions').select('id, status').eq('school_id', schoolId.data).maybeSingle()
  if (isMissingModuleError(beforeErr)) redirect(`/super-admin/subscriptions/${schoolId.data}?error=module`)
  if (!before) redirect(`/super-admin/subscriptions/${schoolId.data}?error=notfound`)
  if ((before as { status: string }).status === 'cancelled') {
    redirect(`/super-admin/subscriptions/${schoolId.data}?error=already`)
  }

  const { error } = await supabase
    .from('school_subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('school_id', schoolId.data)

  if (error) {
    logSupabaseError(error, { action: 'cancelSubscription', schoolId: schoolId.data, userId: actor.id })
    redirect(`/super-admin/subscriptions/${schoolId.data}?error=server`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId: schoolId.data,
    action: 'subscription_cancelled', resourceType: 'subscription', resourceId: (before as { id: string }).id,
    metadata: { via: 'cancel_button' },
  })

  redirect(`/super-admin/subscriptions/${schoolId.data}?ok=cancelled`)
}
