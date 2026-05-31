'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers }           from 'next/headers'
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
