'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { z }            from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'

// Unique-constraint name → friendly field message (see migration 008).
const ACADEMIC_YEAR_CONSTRAINTS = {
  academic_years_school_name_unique: {
    field: 'name',
    message: 'Une année portant ce nom existe déjà dans cet établissement.',
  },
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const AcademicYearSchema = z.object({
  name:      z.string().min(1, 'Nom requis.').max(100),
  starts_on: z.string()
    .min(1, 'Date de début requise.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format invalide (AAAA-MM-JJ).'),
  ends_on: z.string()
    .min(1, 'Date de fin requise.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format invalide (AAAA-MM-JJ).'),
  is_active: z.boolean().default(false),
}).refine(
  (d) => d.ends_on > d.starts_on,
  { message: 'La date de fin doit être après la date de début.', path: ['ends_on'] }
)

// ─── State type ───────────────────────────────────────────────────────────────

export type AcademicYearFormState = {
  errors?: {
    name?:      string[]
    starts_on?: string[]
    ends_on?:   string[]
    _form?:     string[]
  }
}

// ─── Guard ────────────────────────────────────────────────────────────────────

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
    .maybeSingle()

  if (!membership) redirect('/school')
  return { supabase, schoolId: (membership as { school_id: string }).school_id, actor: user }
}

// ─── createAcademicYear ───────────────────────────────────────────────────────

export async function createAcademicYear(
  _prev: AcademicYearFormState,
  formData: FormData
): Promise<AcademicYearFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = AcademicYearSchema.safeParse({
    name:      formData.get('name'),
    starts_on: formData.get('starts_on'),
    ends_on:   formData.get('ends_on'),
    is_active: formData.get('is_active') === 'on',
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as AcademicYearFormState['errors'] }
  }

  if (parsed.data.is_active && formData.get('deactivate_others') === 'on') {
    await supabase
      .from('academic_years')
      .update({ is_active: false })
      .eq('school_id', schoolId)
  }

  const { data: year, error } = await supabase
    .from('academic_years')
    .insert({
      school_id: schoolId,
      name:      parsed.data.name,
      starts_on: parsed.data.starts_on,
      ends_on:   parsed.data.ends_on,
      is_active: parsed.data.is_active,
    })
    .select('id')
    .single()

  if (error || !year) {
    return {
      errors: formatServerActionError(error, {
        action: 'createAcademicYear',
        schoolId,
        entityIds: { name: parsed.data.name },
        constraints: ACADEMIC_YEAR_CONSTRAINTS,
        fallback: 'Erreur lors de la création. Veuillez réessayer.',
      }) as AcademicYearFormState['errors'],
    }
  }

  const yearId = (year as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'academic_year_created', resourceType: 'academic_year', resourceId: yearId,
    metadata: { name: parsed.data.name, starts_on: parsed.data.starts_on, ends_on: parsed.data.ends_on, is_active: parsed.data.is_active },
  })

  redirect(`/school/academic-years/${yearId}`)
}

// ─── updateAcademicYear ───────────────────────────────────────────────────────

export async function updateAcademicYear(
  _prev: AcademicYearFormState,
  formData: FormData
): Promise<AcademicYearFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const yearId = z.string().uuid().safeParse(formData.get('year_id'))
  if (!yearId.success) {
    return { errors: { _form: ['Identifiant invalide.'] } }
  }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = AcademicYearSchema.safeParse({
    name:      formData.get('name'),
    starts_on: formData.get('starts_on'),
    ends_on:   formData.get('ends_on'),
    is_active: formData.get('is_active') === 'on',
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as AcademicYearFormState['errors'] }
  }

  if (parsed.data.is_active && formData.get('deactivate_others') === 'on') {
    await supabase
      .from('academic_years')
      .update({ is_active: false })
      .eq('school_id', schoolId)
      .neq('id', yearId.data)
  }

  const { error } = await supabase
    .from('academic_years')
    .update({
      name:      parsed.data.name,
      starts_on: parsed.data.starts_on,
      ends_on:   parsed.data.ends_on,
      is_active: parsed.data.is_active,
    })
    .eq('id', yearId.data)
    .eq('school_id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'updateAcademicYear',
        schoolId,
        entityIds: { yearId: yearId.data, name: parsed.data.name },
        constraints: ACADEMIC_YEAR_CONSTRAINTS,
        fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
      }) as AcademicYearFormState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'academic_year_updated', resourceType: 'academic_year', resourceId: yearId.data,
    metadata: { name: parsed.data.name, starts_on: parsed.data.starts_on, ends_on: parsed.data.ends_on, is_active: parsed.data.is_active },
  })

  redirect(`/school/academic-years/${yearId.data}`)
}

// ─── setYearActive ────────────────────────────────────────────────────────────

export async function setYearActive(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const yearId    = (formData.get('year_id')   as string | null)?.trim()
  const newActive = formData.get('is_active') === 'true'
  if (!yearId) return

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/academic-years/${yearId}?error=readonly`)
  }

  if (newActive && formData.get('deactivate_others') === 'on') {
    await supabase
      .from('academic_years')
      .update({ is_active: false })
      .eq('school_id', schoolId)
      .neq('id', yearId)
  }

  const { error } = await supabase
    .from('academic_years')
    .update({ is_active: newActive })
    .eq('id', yearId)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setYearActive', schoolId, entityIds: { yearId, newActive } })
    redirect(`/school/academic-years/${yearId}?error=status`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'academic_year_status_changed', resourceType: 'academic_year', resourceId: yearId,
    metadata: { is_active: newActive },
  })

  redirect(`/school/academic-years/${yearId}`)
}
