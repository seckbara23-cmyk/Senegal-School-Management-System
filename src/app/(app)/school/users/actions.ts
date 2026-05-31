'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { z }                 from 'zod'
import { logSupabaseError }  from '@/lib/errors'
import { logAuditEvent }     from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'

// ─── Valid roles ───────────────────────────────────────────────────────────────

const VALID_ROLES = ['school_admin', 'teacher', 'finance_officer', 'parent', 'student'] as const
type ValidRole = typeof VALID_ROLES[number]

function entityTable(role: ValidRole): 'teachers' | 'parents' | 'students' | null {
  if (role === 'teacher') return 'teachers'
  if (role === 'parent')  return 'parents'
  if (role === 'student') return 'students'
  return null
}

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function resolveSchoolAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')
  return {
    supabase,
    schoolId: (membership as { school_id: string }).school_id,
    actor: user,
  }
}

// ─── Audit helper ──────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

// Best-effort: delegates to the shared logAuditEvent helper, which never throws
// and never blocks the user flow. All user-lifecycle events are resource_type 'user'.
async function logAudit(
  adminClient: AdminClient,
  actorId: string,
  actorEmail: string,
  action: string,
  resourceId: string,
  schoolId: string,
  metadata: Record<string, unknown>,
) {
  await logAuditEvent(adminClient, {
    actorId,
    actorEmail,
    action,
    resourceType: 'user',
    resourceId,
    schoolId,
    metadata,
  })
}

// ─── Create school user ────────────────────────────────────────────────────────
// Security invariants:
//   1. school_id resolved from authenticated admin session — never from form
//   2. entity_id ownership verified against school before linking
//   3. Auth user created via service-role Admin API — never via anon client
//   4. profile row auto-created by handle_new_user() trigger
//   5. Cleanup: auth user deleted if membership insert fails (orphan prevention)

const CreateUserSchema = z.object({
  email:     z.string().email('Adresse email invalide.'),
  full_name: z.string().min(2, 'Nom complet requis (2 caractères min.).').max(100),
  role:      z.enum(VALID_ROLES, { error: 'Rôle invalide.' }),
  password:  z.string().min(8, 'Mot de passe minimum 8 caractères.').max(72),
  entity_id: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().uuid().optional()
  ),
})

export type CreateSchoolUserState = {
  errors?: {
    email?:     string[]
    full_name?: string[]
    role?:      string[]
    password?:  string[]
    entity_id?: string[]
    _form?:     string[]
  }
}

export async function createSchoolUser(
  _prevState: CreateSchoolUserState,
  formData: FormData,
): Promise<CreateSchoolUserState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = CreateUserSchema.safeParse({
    email:     formData.get('email'),
    full_name: formData.get('full_name'),
    role:      formData.get('role'),
    password:  formData.get('password'),
    entity_id: formData.get('entity_id'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as CreateSchoolUserState['errors'] }
  }

  const { email, full_name, role, password, entity_id } = parsed.data
  const table = entityTable(role)

  // Verify entity ownership and that it is not already linked
  if (entity_id) {
    if (!table) {
      return { errors: { entity_id: ['Aucun dossier à lier pour ce rôle.'] } }
    }
    const { data: entity } = await supabase
      .from(table)
      .select('id, profile_id')
      .eq('id', entity_id)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!entity) {
      return { errors: { entity_id: ['Dossier introuvable dans cet établissement.'] } }
    }
    if ((entity as { profile_id: string | null }).profile_id) {
      return { errors: { entity_id: ['Ce dossier est déjà lié à un compte.'] } }
    }
  }

  // Create auth user via Admin API (service role — bypasses RLS)
  const adminClient = createAdminClient()
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification — school-controlled onboarding
    user_metadata: { full_name },
  })

  if (authError || !authData.user) {
    const msg = authError?.message ?? ''
    if (
      msg.toLowerCase().includes('already') ||
      (authError as unknown as { status?: number })?.status === 422
    ) {
      return { errors: { email: ['Un compte avec cet email existe déjà.'] } }
    }
    logSupabaseError(authError, { action: 'createSchoolUser:auth', schoolId, userId: actor.id, entityIds: { email } })
    return { errors: { _form: ['Erreur lors de la création du compte. Veuillez réessayer.'] } }
  }

  const newUserId = authData.user.id

  // Create school_membership with anon client (RLS enforces school_admin ownership)
  const { error: memberError } = await supabase
    .from('school_memberships')
    .insert({ user_id: newUserId, school_id: schoolId, role, status: 'active' })

  if (memberError) {
    logSupabaseError(memberError, {
      action: 'createSchoolUser:membership',
      schoolId,
      userId: actor.id,
      entityIds: { newUserId, role },
    })
    // Best-effort cleanup: remove orphaned auth user (and cascaded profile)
    await adminClient.auth.admin.deleteUser(newUserId)
    return { errors: { _form: ["Erreur lors de l'attribution du rôle. Veuillez réessayer."] } }
  }

  // Link profile_id to domain entity (teacher / parent / student)
  if (entity_id && table) {
    await supabase
      .from(table)
      .update({ profile_id: newUserId })
      .eq('id', entity_id)
      .eq('school_id', schoolId)
  }

  // Audit
  await logAudit(adminClient, actor.id, actor.email ?? '', 'user_created', newUserId, schoolId, {
    target_user_id: newUserId,
    target_email:   email,
    role,
    school_id:      schoolId,
    actor_id:       actor.id,
  })
  if (entity_id && table) {
    await logAudit(adminClient, actor.id, actor.email ?? '', 'role_linked', newUserId, schoolId, {
      target_user_id: newUserId,
      target_email:   email,
      role,
      entity_id,
      school_id:      schoolId,
      actor_id:       actor.id,
    })
  }

  redirect(`/school/users/${newUserId}`)
}

// ─── Set membership status ─────────────────────────────────────────────────────
// Updates ALL memberships for userId in this school (handles multi-role accounts).

export async function setMembershipStatus(formData: FormData) {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const userId    = z.string().uuid().safeParse(formData.get('user_id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!userId.success || !newStatus.success) redirect('/school/users')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/users/${userId.data}?error=readonly`)
  }

  const { error: statusError } = await supabase
    .from('school_memberships')
    .update({ status: newStatus.data })
    .eq('user_id', userId.data)
    .eq('school_id', schoolId)

  if (statusError) {
    logSupabaseError(statusError, { action: 'setMembershipStatus', schoolId, userId: actor.id, entityIds: { targetUserId: userId.data, newStatus: newStatus.data } })
    redirect(`/school/users/${userId.data}?error=status`)
  }

  // Fetch target email for audit log
  const { data: profileData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId.data)
    .maybeSingle()
  const targetEmail = (profileData as { email: string | null } | null)?.email ?? ''

  const auditAction = newStatus.data === 'inactive' ? 'user_deactivated' : 'user_reactivated'
  const adminClient = createAdminClient()
  await logAudit(adminClient, actor.id, actor.email ?? '', auditAction, userId.data, schoolId, {
    target_user_id: userId.data,
    target_email:   targetEmail,
    new_status:     newStatus.data,
    school_id:      schoolId,
    actor_id:       actor.id,
  })

  redirect(`/school/users/${userId.data}`)
}

// ─── Link entity to user ───────────────────────────────────────────────────────

export async function linkEntityToUser(formData: FormData) {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const userId   = z.string().uuid().safeParse(formData.get('user_id'))
  const entityId = z.string().uuid().safeParse(formData.get('entity_id'))
  const role     = z.enum(['teacher', 'parent', 'student']).safeParse(formData.get('role'))
  if (!userId.success || !entityId.success || !role.success) redirect('/school/users')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/users/${userId.data}?error=readonly`)
  }

  const table = entityTable(role.data)!

  const { data: entity } = await supabase
    .from(table)
    .select('id, profile_id')
    .eq('id', entityId.data)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!entity || (entity as { profile_id: string | null }).profile_id) {
    redirect(`/school/users/${userId.data}?error=entity`)
  }

  const { error: linkError } = await supabase
    .from(table)
    .update({ profile_id: userId.data })
    .eq('id', entityId.data)
    .eq('school_id', schoolId)

  if (linkError) {
    logSupabaseError(linkError, { action: 'linkEntityToUser', schoolId, userId: actor.id, entityIds: { targetUserId: userId.data, entityId: entityId.data, role: role.data } })
    redirect(`/school/users/${userId.data}?error=link`)
  }

  // Fetch target email for audit log
  const { data: profileData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId.data)
    .maybeSingle()
  const targetEmail = (profileData as { email: string | null } | null)?.email ?? ''

  const adminClient = createAdminClient()
  await logAudit(adminClient, actor.id, actor.email ?? '', 'role_linked', userId.data, schoolId, {
    target_user_id: userId.data,
    target_email:   targetEmail,
    role:           role.data,
    entity_id:      entityId.data,
    school_id:      schoolId,
    actor_id:       actor.id,
  })

  redirect(`/school/users/${userId.data}`)
}

// ─── Unlink entity from user ───────────────────────────────────────────────────

export async function unlinkEntityFromUser(formData: FormData) {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const userId = z.string().uuid().safeParse(formData.get('user_id'))
  const role   = z.enum(['teacher', 'parent', 'student']).safeParse(formData.get('role'))
  if (!userId.success || !role.success) redirect('/school/users')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/users/${userId.data}?error=readonly`)
  }

  const table = entityTable(role.data)!

  const { error: unlinkError } = await supabase
    .from(table)
    .update({ profile_id: null })
    .eq('profile_id', userId.data)
    .eq('school_id', schoolId)

  if (unlinkError) {
    logSupabaseError(unlinkError, { action: 'unlinkEntityFromUser', schoolId, userId: actor.id, entityIds: { targetUserId: userId.data, role: role.data } })
    redirect(`/school/users/${userId.data}?error=unlink`)
  }

  // Fetch target email for audit log
  const { data: profileData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId.data)
    .maybeSingle()
  const targetEmail = (profileData as { email: string | null } | null)?.email ?? ''

  const adminClient = createAdminClient()
  await logAudit(adminClient, actor.id, actor.email ?? '', 'role_unlinked', userId.data, schoolId, {
    target_user_id: userId.data,
    target_email:   targetEmail,
    role:           role.data,
    school_id:      schoolId,
    actor_id:       actor.id,
  })

  redirect(`/school/users/${userId.data}`)
}

// ─── Generate password reset link ─────────────────────────────────────────────

export type GenerateResetLinkState = {
  link?:   string
  errors?: { _form?: string[] }
}

export async function generatePasswordResetLink(
  _prevState: GenerateResetLinkState,
  formData: FormData,
): Promise<GenerateResetLinkState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const userId = z.string().uuid().safeParse(formData.get('user_id'))
  if (!userId.success) {
    return { errors: { _form: ['Identifiant utilisateur invalide.'] } }
  }

  // Verify target user belongs to this school
  const { data: membership } = await supabase
    .from('school_memberships')
    .select('user_id')
    .eq('user_id', userId.data)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!membership) {
    return { errors: { _form: ['Utilisateur introuvable dans cet établissement.'] } }
  }

  // Fetch target email
  const { data: profileData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId.data)
    .maybeSingle()

  const targetEmail = (profileData as { email: string | null } | null)?.email
  if (!targetEmail) {
    return { errors: { _form: ["Adresse email introuvable pour cet utilisateur."] } }
  }

  // Generate recovery link via Admin API
  const adminClient = createAdminClient()
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type:  'recovery',
    email: targetEmail,
  })

  if (linkError || !linkData?.properties?.action_link) {
    logSupabaseError(linkError, {
      action: 'generatePasswordResetLink',
      schoolId,
      userId: actor.id,
      entityIds: { targetUserId: userId.data },
    })
    return {
      errors: { _form: ['Erreur lors de la génération du lien. Veuillez réessayer.'] },
    }
  }

  await logAudit(
    adminClient,
    actor.id,
    actor.email ?? '',
    'password_reset_link_generated',
    userId.data,
    schoolId,
    {
      target_user_id: userId.data,
      target_email:   targetEmail,
      school_id:      schoolId,
      actor_id:       actor.id,
    },
  )

  return { link: linkData.properties.action_link }
}
