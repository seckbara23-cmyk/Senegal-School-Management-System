'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { z }                 from 'zod'
import { logSupabaseError }  from '@/lib/errors'
import { logAuditEvent }     from '@/lib/audit'

// ─── Super-admin guard ─────────────────────────────────────────────────────────
// Returns the authenticated super_admin actor, or null when not authorised.
// Uses the anon (session) client so the check runs against the caller's own
// identity — the service-role client is only used for privileged writes below.

async function resolveSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .maybeSingle()

  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') return null
  return { id: user.id, email: user.email ?? '' }
}

// ─── Validation ─────────────────────────────────────────────────────────────────

const Schema = z.object({
  name: z.string().min(2, "Le nom de l'école est requis (2 caractères min.).").max(200),
  slug: z.string()
    .min(2, 'Identifiant requis (2 caractères min.).')
    .max(100, 'Identifiant trop long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant invalide : lettres minuscules, chiffres et tirets uniquement.'),
  address: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(300, 'Adresse trop longue.').optional()),
  phone: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(30, 'Téléphone trop long.').optional()),
  email: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().email("Email de l'école invalide.").max(200).optional()),
  subscription_status: z.preprocess((v) => (!v || v === '' ? 'active' : v),
    z.enum(['active', 'inactive', 'suspended'])),

  admin_first_name: z.string().min(1, "Prénom de l'administrateur requis.").max(100),
  admin_last_name:  z.string().min(1, "Nom de l'administrateur requis.").max(100),
  admin_email:      z.string().email("Email de l'administrateur invalide.").max(200),
  admin_password:   z.string().min(8, 'Mot de passe temporaire : 8 caractères min.').max(72),
})

export type CreateSchoolState = {
  errors?: {
    name?: string[]; slug?: string[]; address?: string[]; phone?: string[]; email?: string[]
    subscription_status?: string[]
    admin_first_name?: string[]; admin_last_name?: string[]; admin_email?: string[]; admin_password?: string[]
    _form?: string[]
  }
  success?: {
    schoolId:      string
    schoolName:    string
    adminEmail:    string
    loginUrl:      string
    tempPassword:  string
    resetLink:     string | null
  }
}

// ─── createSchoolWithAdmin ───────────────────────────────────────────────────────
// Atomically provisions a tenant: school → auth user → profile → school_admin
// membership, with best-effort rollback if any step fails. Service-role writes
// only; school_id is generated server-side and never trusted from the client.

export async function createSchoolWithAdmin(
  _prevState: CreateSchoolState,
  formData: FormData,
): Promise<CreateSchoolState> {
  const actor = await resolveSuperAdmin()
  if (!actor) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = Schema.safeParse({
    name:                 formData.get('name'),
    slug:                 formData.get('slug'),
    address:              formData.get('address'),
    phone:                formData.get('phone'),
    email:                formData.get('email'),
    subscription_status:  formData.get('subscription_status'),
    admin_first_name:     formData.get('admin_first_name'),
    admin_last_name:      formData.get('admin_last_name'),
    admin_email:          formData.get('admin_email'),
    admin_password:       formData.get('admin_password'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as CreateSchoolState['errors'] }
  }

  const d = parsed.data
  const admin = createAdminClient()

  // ── Step 1: create the school (service role) ───────────────────────────────
  const { data: schoolRow, error: schoolError } = await admin
    .from('schools')
    .insert({
      name:                d.name.trim(),
      slug:                d.slug.trim(),
      address:             d.address ?? null,
      phone:               d.phone ?? null,
      email:               d.email ?? null,
      subscription_status: d.subscription_status,
    })
    .select('id')
    .single()

  if (schoolError || !schoolRow) {
    if (schoolError?.code === '23505') {
      return { errors: { slug: ['Cet identifiant est déjà utilisé par une autre école.'] } }
    }
    logSupabaseError(schoolError, { action: 'createSchoolWithAdmin:school', userId: actor.id, entityIds: { slug: d.slug } })
    return { errors: { _form: ["Erreur lors de la création de l'école. Veuillez réessayer."] } }
  }

  const schoolId = (schoolRow as { id: string }).id

  // ── Step 2: create the admin auth user ─────────────────────────────────────
  const fullName = `${d.admin_first_name.trim()} ${d.admin_last_name.trim()}`
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email:         d.admin_email,
    password:      d.admin_password,
    email_confirm: true, // school-controlled onboarding — skip email verification
    user_metadata: { full_name: fullName },
  })

  if (authError || !authData.user) {
    // Rollback: remove the school we just created.
    await admin.from('schools').delete().eq('id', schoolId)

    const msg = authError?.message ?? ''
    if (msg.toLowerCase().includes('already') || (authError as unknown as { status?: number })?.status === 422) {
      return { errors: { admin_email: ['Un compte avec cet email existe déjà.'] } }
    }
    logSupabaseError(authError, { action: 'createSchoolWithAdmin:auth', userId: actor.id, entityIds: { schoolId, adminEmail: d.admin_email } })
    return { errors: { _form: ["Erreur lors de la création du compte administrateur. Veuillez réessayer."] } }
  }

  const newUserId = authData.user.id

  // ── Step 3: ensure the profile row exists (trigger normally creates it) ─────
  // Service role bypasses RLS. DO NOTHING preserves any trigger-created row.
  await admin
    .from('profiles')
    .upsert({ id: newUserId, email: d.admin_email, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true })

  // ── Step 4: create the school_admin membership ──────────────────────────────
  const { error: memberError } = await admin
    .from('school_memberships')
    .insert({ user_id: newUserId, school_id: schoolId, role: 'school_admin', status: 'active' })

  if (memberError) {
    logSupabaseError(memberError, { action: 'createSchoolWithAdmin:membership', userId: actor.id, entityIds: { schoolId, newUserId } })
    // Rollback: delete auth user (cascades the profile) and the school.
    await admin.auth.admin.deleteUser(newUserId)
    await admin.from('schools').delete().eq('id', schoolId)
    return { errors: { _form: ["Erreur lors de l'attribution du rôle administrateur. Veuillez réessayer."] } }
  }

  // ── Step 5: audit events (best-effort via shared helper) ────────────────────
  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'school_created', resourceType: 'school', resourceId: schoolId,
    metadata: { name: d.name, slug: d.slug },
  })
  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'school_admin_created', resourceType: 'user', resourceId: newUserId,
    metadata: { admin_email: d.admin_email, role: 'school_admin' },
  })

  // ── Step 6: build login URL + best-effort recovery link ─────────────────────
  const h = headers()
  const host  = h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const loginUrl = host ? `${proto}://${host}/login` : '/login'

  let resetLink: string | null = null
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'recovery', email: d.admin_email })
  if (linkData?.properties?.action_link) resetLink = linkData.properties.action_link

  return {
    success: {
      schoolId,
      schoolName:   d.name.trim(),
      adminEmail:   d.admin_email,
      loginUrl,
      tempPassword: d.admin_password,
      resetLink,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHOOL PROFILE + SUBSCRIPTION EDITING
// ═══════════════════════════════════════════════════════════════════════════
//
// Super-admin editing of a tenant's profile fields and subscription foundation
// (plan + optional trial end date). subscription_STATUS is intentionally NOT
// editable here — lifecycle transitions stay in the dedicated suspend /
// reactivate / archive actions (with their last-admin safeguards and
// per-transition audit events). Service-role writes only; school_id comes from
// a hidden field and is never used for authorisation (super admins may edit any
// school).

export const SUBSCRIPTION_PLANS = ['starter', 'standard', 'premium'] as const

const UpdateSchoolSchema = z.object({
  school_id: z.string().uuid('École invalide.'),
  name: z.string().min(2, "Le nom de l'école est requis (2 caractères min.).").max(200),
  slug: z.string()
    .min(2, 'Identifiant requis (2 caractères min.).')
    .max(100, 'Identifiant trop long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant invalide : lettres minuscules, chiffres et tirets uniquement.'),
  address: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(300, 'Adresse trop longue.').optional()),
  phone: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(30, 'Téléphone trop long.').optional()),
  email: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().email("Email de l'école invalide.").max(200).optional()),
  subscription_plan: z.preprocess((v) => (!v || v === '' ? 'starter' : v),
    z.enum(SUBSCRIPTION_PLANS)),
  trial_ends_at: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).').optional()),
})

export type EditSchoolState = {
  errors?: {
    name?: string[]; slug?: string[]; address?: string[]; phone?: string[]; email?: string[]
    subscription_plan?: string[]; trial_ends_at?: string[]; _form?: string[]
  }
}

export async function updateSchool(
  _prevState: EditSchoolState,
  formData: FormData,
): Promise<EditSchoolState> {
  const actor = await resolveSuperAdmin()
  if (!actor) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = UpdateSchoolSchema.safeParse({
    school_id:         formData.get('school_id'),
    name:              formData.get('name'),
    slug:              formData.get('slug'),
    address:           formData.get('address'),
    phone:             formData.get('phone'),
    email:             formData.get('email'),
    subscription_plan: formData.get('subscription_plan'),
    trial_ends_at:     formData.get('trial_ends_at'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as EditSchoolState['errors'] }
  }

  const d = parsed.data
  const admin = createAdminClient()

  // Snapshot the current values for change detection + audit metadata.
  const { data: before } = await admin
    .from('schools')
    .select('name, slug, address, phone, email, subscription_plan, trial_ends_at')
    .eq('id', d.school_id)
    .maybeSingle()

  if (!before) return { errors: { _form: ['École introuvable.'] } }
  type SchoolSnapshot = {
    name: string; slug: string; address: string | null; phone: string | null
    email: string | null; subscription_plan: string; trial_ends_at: string | null
  }
  const prev = before as SchoolSnapshot

  const next: SchoolSnapshot = {
    name:              d.name.trim(),
    slug:              d.slug.trim(),
    address:           d.address ?? null,
    phone:             d.phone ?? null,
    email:             d.email ?? null,
    subscription_plan: d.subscription_plan,
    trial_ends_at:     d.trial_ends_at ?? null,
  }

  const { error } = await admin
    .from('schools')
    .update(next)
    .eq('id', d.school_id)

  if (error) {
    if (error.code === '23505') {
      return { errors: { slug: ['Cet identifiant est déjà utilisé par une autre école.'] } }
    }
    logSupabaseError(error, { action: 'updateSchool', userId: actor.id, entityIds: { schoolId: d.school_id } })
    return { errors: { _form: ["Erreur lors de l'enregistrement. Veuillez réessayer."] } }
  }

  // ── Audit (best-effort) ──────────────────────────────────────────────────
  // Profile change → school_updated; subscription change → school_subscription_updated.
  const profileFields = ['name', 'slug', 'address', 'phone', 'email'] as const
  const changedProfile = profileFields.filter((f) => prev[f] !== next[f])
  const subChanged =
    prev.subscription_plan !== next.subscription_plan ||
    prev.trial_ends_at !== next.trial_ends_at

  if (changedProfile.length > 0) {
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    for (const f of changedProfile) changes[f] = { old: prev[f], new: next[f] }
    await logAuditEvent(admin, {
      actorId: actor.id, actorEmail: actor.email, schoolId: d.school_id,
      action: 'school_updated', resourceType: 'school', resourceId: d.school_id,
      metadata: { name: next.name, slug: next.slug, changes },
    })
  }

  if (subChanged) {
    await logAuditEvent(admin, {
      actorId: actor.id, actorEmail: actor.email, schoolId: d.school_id,
      action: 'school_subscription_updated', resourceType: 'school', resourceId: d.school_id,
      metadata: {
        old_plan:          prev.subscription_plan,
        new_plan:          next.subscription_plan,
        old_trial_ends_at: prev.trial_ends_at,
        new_trial_ends_at: next.trial_ends_at,
      },
    })
  }

  redirect(`/super-admin/schools/${d.school_id}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — SCHOOL LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════
//
// Suspend / Reactivate / Archive transitions on the existing
// schools.subscription_status column. Super-admin only; school_id is validated
// as a UUID but never used for authorisation (super admins may act on any
// school). Service-role writes only.

type LifecycleStatus = 'active' | 'suspended' | 'archived'

async function transitionSchool(
  formData: FormData,
  newStatus: LifecycleStatus,
  action: 'school_reactivated' | 'school_suspended' | 'school_archived',
): Promise<void> {
  const actor = await resolveSuperAdmin()
  if (!actor) redirect('/dashboard')

  const schoolId = z.string().uuid().safeParse(formData.get('school_id'))
  if (!schoolId.success) redirect('/super-admin/schools')

  const admin = createAdminClient()

  // Capture the previous status for the audit trail.
  const { data: before } = await admin
    .from('schools')
    .select('subscription_status, name')
    .eq('id', schoolId.data)
    .maybeSingle()

  if (!before) redirect('/super-admin/schools')
  const prev = before as { subscription_status: string; name: string }

  const { error } = await admin
    .from('schools')
    .update({ subscription_status: newStatus })
    .eq('id', schoolId.data)

  if (error) {
    logSupabaseError(error, { action, userId: actor.id, entityIds: { schoolId: schoolId.data, newStatus } })
    redirect(`/super-admin/schools/${schoolId.data}?error=status`)
  }

  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId: schoolId.data,
    action, resourceType: 'school', resourceId: schoolId.data,
    metadata: { name: prev.name, old_status: prev.subscription_status, new_status: newStatus },
  })

  redirect(`/super-admin/schools/${schoolId.data}`)
}

export async function suspendSchool(formData: FormData): Promise<void> {
  return transitionSchool(formData, 'suspended', 'school_suspended')
}

export async function reactivateSchool(formData: FormData): Promise<void> {
  return transitionSchool(formData, 'active', 'school_reactivated')
}

export async function archiveSchool(formData: FormData): Promise<void> {
  return transitionSchool(formData, 'archived', 'school_archived')
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — SCHOOL ADMIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// Manage the school_admin memberships of a specific school. Super-admin only;
// service-role writes. Safeguard: a school's LAST active school_admin can be
// neither removed nor deactivated.

// Counts active school_admin memberships for a school (service role).
async function countActiveSchoolAdmins(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
): Promise<number> {
  const { count } = await admin
    .from('school_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'school_admin')
    .eq('status', 'active')
  return count ?? 0
}

// ─── Add school admin (create new OR attach existing) ────────────────────────

const AddAdminSchema = z.object({
  school_id: z.string().uuid('École invalide.'),
  mode:      z.enum(['create', 'attach']),
  email:     z.string().email('Adresse email invalide.').max(200),
  full_name: z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().min(2, 'Nom complet requis (2 caractères min.).').max(100).optional()),
  password:  z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().min(8, 'Mot de passe : 8 caractères min.').max(72).optional()),
})

export type AddAdminState = {
  errors?: { email?: string[]; full_name?: string[]; password?: string[]; _form?: string[] }
  success?: {
    mode:         'create' | 'attach'
    email:        string
    tempPassword?: string
    resetLink?:   string | null
  }
}

export async function addSchoolAdmin(
  _prevState: AddAdminState,
  formData: FormData,
): Promise<AddAdminState> {
  const actor = await resolveSuperAdmin()
  if (!actor) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = AddAdminSchema.safeParse({
    school_id: formData.get('school_id'),
    mode:      formData.get('mode'),
    email:     formData.get('email'),
    full_name: formData.get('full_name'),
    password:  formData.get('password'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as AddAdminState['errors'] }
  }

  const { school_id, mode, email, full_name, password } = parsed.data
  const admin = createAdminClient()

  // Verify the school exists.
  const { data: school } = await admin.from('schools').select('id').eq('id', school_id).maybeSingle()
  if (!school) return { errors: { _form: ['École introuvable.'] } }

  // ── Attach an existing account ──────────────────────────────────────────────
  if (mode === 'attach') {
    const { data: profileRow } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (!profileRow) {
      return { errors: { email: ['Aucun compte avec cet email. Utilisez « Créer un compte ».'] } }
    }
    const targetUserId = (profileRow as { id: string }).id

    // Existing school_admin membership for this user + school?
    const { data: existing } = await admin
      .from('school_memberships')
      .select('id, status')
      .eq('user_id', targetUserId)
      .eq('school_id', school_id)
      .eq('role', 'school_admin')
      .maybeSingle()

    if (existing) {
      const ex = existing as { id: string; status: string }
      if (ex.status === 'active') {
        return { errors: { email: ['Ce compte est déjà administrateur actif de cette école.'] } }
      }
      const { error: reErr } = await admin
        .from('school_memberships')
        .update({ status: 'active' })
        .eq('id', ex.id)
      if (reErr) {
        logSupabaseError(reErr, { action: 'addSchoolAdmin:reactivate', userId: actor.id, entityIds: { school_id, targetUserId } })
        return { errors: { _form: ['Erreur lors de la liaison du compte. Veuillez réessayer.'] } }
      }
    } else {
      const { error: insErr } = await admin
        .from('school_memberships')
        .insert({ user_id: targetUserId, school_id, role: 'school_admin', status: 'active' })
      if (insErr) {
        logSupabaseError(insErr, { action: 'addSchoolAdmin:attach', userId: actor.id, entityIds: { school_id, targetUserId } })
        return { errors: { _form: ['Erreur lors de la liaison du compte. Veuillez réessayer.'] } }
      }
    }

    await logAuditEvent(admin, {
      actorId: actor.id, actorEmail: actor.email, schoolId: school_id,
      action: 'school_admin_added', resourceType: 'user', resourceId: targetUserId,
      metadata: { mode: 'attach', target_user_id: targetUserId, target_email: email, role: 'school_admin' },
    })

    redirect(`/super-admin/schools/${school_id}`)
  }

  // ── Create a brand-new account ──────────────────────────────────────────────
  if (!full_name) return { errors: { full_name: ['Nom complet requis.'] } }
  if (!password)  return { errors: { password:  ['Mot de passe temporaire requis.'] } }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (authError || !authData.user) {
    const msg = authError?.message ?? ''
    if (msg.toLowerCase().includes('already') || (authError as unknown as { status?: number })?.status === 422) {
      return { errors: { email: ['Un compte avec cet email existe déjà. Utilisez « Lier un compte existant ».'] } }
    }
    logSupabaseError(authError, { action: 'addSchoolAdmin:auth', userId: actor.id, entityIds: { school_id, email } })
    return { errors: { _form: ['Erreur lors de la création du compte. Veuillez réessayer.'] } }
  }

  const newUserId = authData.user.id

  await admin
    .from('profiles')
    .upsert({ id: newUserId, email, full_name }, { onConflict: 'id', ignoreDuplicates: true })

  const { error: memberError } = await admin
    .from('school_memberships')
    .insert({ user_id: newUserId, school_id, role: 'school_admin', status: 'active' })

  if (memberError) {
    logSupabaseError(memberError, { action: 'addSchoolAdmin:membership', userId: actor.id, entityIds: { school_id, newUserId } })
    await admin.auth.admin.deleteUser(newUserId)
    return { errors: { _form: ["Erreur lors de l'attribution du rôle. Veuillez réessayer."] } }
  }

  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId: school_id,
    action: 'school_admin_added', resourceType: 'user', resourceId: newUserId,
    metadata: { mode: 'create', target_user_id: newUserId, target_email: email, role: 'school_admin' },
  })

  let resetLink: string | null = null
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  if (linkData?.properties?.action_link) resetLink = linkData.properties.action_link

  return { success: { mode: 'create', email, tempPassword: password, resetLink } }
}

// ─── Remove school admin (delete the school_admin membership) ────────────────

export async function removeSchoolAdmin(formData: FormData): Promise<void> {
  const actor = await resolveSuperAdmin()
  if (!actor) redirect('/dashboard')

  const schoolId = z.string().uuid().safeParse(formData.get('school_id'))
  const userId   = z.string().uuid().safeParse(formData.get('user_id'))
  if (!schoolId.success || !userId.success) redirect('/super-admin/schools')

  const admin = createAdminClient()

  // Target membership must exist for this school.
  const { data: membership } = await admin
    .from('school_memberships')
    .select('id, status')
    .eq('user_id', userId.data)
    .eq('school_id', schoolId.data)
    .eq('role', 'school_admin')
    .maybeSingle()

  if (!membership) redirect(`/super-admin/schools/${schoolId.data}`)
  const m = membership as { id: string; status: string }

  // Safeguard: never remove the last ACTIVE school_admin.
  if (m.status === 'active') {
    const activeCount = await countActiveSchoolAdmins(admin, schoolId.data)
    if (activeCount <= 1) {
      redirect(`/super-admin/schools/${schoolId.data}?error=last_admin`)
    }
  }

  const { error } = await admin.from('school_memberships').delete().eq('id', m.id)
  if (error) {
    logSupabaseError(error, { action: 'removeSchoolAdmin', userId: actor.id, entityIds: { schoolId: schoolId.data, targetUserId: userId.data } })
    redirect(`/super-admin/schools/${schoolId.data}?error=remove`)
  }

  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId: schoolId.data,
    action: 'school_admin_removed', resourceType: 'user', resourceId: userId.data,
    metadata: { target_user_id: userId.data, role: 'school_admin' },
  })

  redirect(`/super-admin/schools/${schoolId.data}`)
}

// ─── Deactivate / reactivate school admin ────────────────────────────────────

export async function setSchoolAdminStatus(formData: FormData): Promise<void> {
  const actor = await resolveSuperAdmin()
  if (!actor) redirect('/dashboard')

  const schoolId  = z.string().uuid().safeParse(formData.get('school_id'))
  const userId    = z.string().uuid().safeParse(formData.get('user_id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!schoolId.success || !userId.success || !newStatus.success) redirect('/super-admin/schools')

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('school_memberships')
    .select('id, status')
    .eq('user_id', userId.data)
    .eq('school_id', schoolId.data)
    .eq('role', 'school_admin')
    .maybeSingle()

  if (!membership) redirect(`/super-admin/schools/${schoolId.data}`)
  const m = membership as { id: string; status: string }

  // Safeguard: never deactivate the last ACTIVE school_admin.
  if (newStatus.data === 'inactive' && m.status === 'active') {
    const activeCount = await countActiveSchoolAdmins(admin, schoolId.data)
    if (activeCount <= 1) {
      redirect(`/super-admin/schools/${schoolId.data}?error=last_admin`)
    }
  }

  const { error } = await admin
    .from('school_memberships')
    .update({ status: newStatus.data })
    .eq('id', m.id)

  if (error) {
    logSupabaseError(error, { action: 'setSchoolAdminStatus', userId: actor.id, entityIds: { schoolId: schoolId.data, targetUserId: userId.data, newStatus: newStatus.data } })
    redirect(`/super-admin/schools/${schoolId.data}?error=status`)
  }

  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId: schoolId.data,
    action: newStatus.data === 'inactive' ? 'school_admin_deactivated' : 'school_admin_reactivated',
    resourceType: 'user', resourceId: userId.data,
    metadata: { target_user_id: userId.data, new_status: newStatus.data },
  })

  redirect(`/super-admin/schools/${schoolId.data}`)
}

// ─── Generate password reset link for a school admin ─────────────────────────

export type AdminResetLinkState = {
  link?:    string
  email?:   string
  errors?:  { _form?: string[] }
}

export async function generateSchoolAdminResetLink(
  _prevState: AdminResetLinkState,
  formData: FormData,
): Promise<AdminResetLinkState> {
  const actor = await resolveSuperAdmin()
  if (!actor) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = z.string().uuid().safeParse(formData.get('school_id'))
  const userId   = z.string().uuid().safeParse(formData.get('user_id'))
  if (!schoolId.success || !userId.success) {
    return { errors: { _form: ['Paramètres invalides.'] } }
  }

  const admin = createAdminClient()

  // Verify the target is a school_admin of this school.
  const { data: membership } = await admin
    .from('school_memberships')
    .select('id')
    .eq('user_id', userId.data)
    .eq('school_id', schoolId.data)
    .eq('role', 'school_admin')
    .maybeSingle()

  if (!membership) return { errors: { _form: ['Administrateur introuvable pour cette école.'] } }

  const { data: profileRow } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId.data)
    .maybeSingle()

  const targetEmail = (profileRow as { email: string | null } | null)?.email
  if (!targetEmail) return { errors: { _form: ['Adresse email introuvable pour ce compte.'] } }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type:  'recovery',
    email: targetEmail,
  })

  if (linkError || !linkData?.properties?.action_link) {
    logSupabaseError(linkError, { action: 'generateSchoolAdminResetLink', userId: actor.id, entityIds: { schoolId: schoolId.data, targetUserId: userId.data } })
    return { errors: { _form: ['Erreur lors de la génération du lien. Veuillez réessayer.'] } }
  }

  await logAuditEvent(admin, {
    actorId: actor.id, actorEmail: actor.email, schoolId: schoolId.data,
    action: 'school_admin_password_reset_generated', resourceType: 'user', resourceId: userId.data,
    metadata: { target_user_id: userId.data, target_email: targetEmail },
  })

  return { link: linkData.properties.action_link, email: targetEmail }
}
