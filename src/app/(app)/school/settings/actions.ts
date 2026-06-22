'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'

// School-admin self-service profile edit. Only the contact fields are editable
// here — slug, subscription_status, subscription_plan, trial_ends_at and billing
// remain super-admin-only and are never written by this action.

const ProfileSchema = z.object({
  name:    z.string().min(1, 'Nom requis.').max(200, 'Nom trop long (200 caractères max).'),
  phone:   z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().max(30, 'Numéro trop long.').optional()),
  email:   z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().email('Adresse email invalide.').max(200).optional()),
  address: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().max(300, 'Adresse trop longue (300 caractères max).').optional()),
})

export type SchoolProfileState = {
  errors?: { name?: string[]; phone?: string[]; email?: string[]; address?: string[]; _form?: string[] }
}

async function resolveSchoolAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')
  return { supabase, schoolId: (membership as { school_id: string }).school_id, actor: user }
}

export async function updateSchoolProfile(
  _prev: SchoolProfileState,
  formData: FormData,
): Promise<SchoolProfileState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = ProfileSchema.safeParse({
    name:    formData.get('name'),
    phone:   formData.get('phone'),
    email:   formData.get('email'),
    address: formData.get('address'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as SchoolProfileState['errors'] }
  }
  const d = parsed.data

  // Tenant-scoped: only this school's row, only the contact columns.
  const { error } = await supabase
    .from('schools')
    .update({ name: d.name, phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null })
    .eq('id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'updateSchoolProfile', schoolId, userId: actor.id,
        fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
      }) as SchoolProfileState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'school_updated', resourceType: 'school', resourceId: schoolId,
    metadata: { fields: ['name', 'phone', 'email', 'address'], source: 'school_admin_settings' },
  })

  redirect('/school/settings?saved=1')
}
