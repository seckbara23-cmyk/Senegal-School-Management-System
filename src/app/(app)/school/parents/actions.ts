'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ParentSchema = z.object({
  first_name:  z.string().min(1, 'Prénom requis.').max(100),
  last_name:   z.string().min(1, 'Nom requis.').max(100),
  phone:       z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(30, 'Numéro trop long.').optional()),
  email:       z.preprocess((v) => (v === '' ? undefined : v),
    z.string().email('Adresse email invalide.').max(200).optional()),
  address:     z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(300, 'Adresse trop longue (300 car. max).').optional()),
  occupation:  z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(100, 'Profession trop longue (100 car. max).').optional()),
})

// ─── State types ──────────────────────────────────────────────────────────────

export type ParentFormState = {
  errors?: {
    first_name?:  string[]
    last_name?:   string[]
    phone?:       string[]
    email?:       string[]
    address?:     string[]
    occupation?:  string[]
    _form?:       string[]
  }
}

export type CreateParentState = ParentFormState

export type LinkStudentsState = {
  errors?: { _form?: string[] }
}

// ─── Guard helper ─────────────────────────────────────────────────────────────

async function getSchoolId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', userId)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()
  return (data as { school_id: string } | null)?.school_id ?? null
}

async function resolveSchoolAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) redirect('/school')

  return { supabase, schoolId }
}

// ─── createParent ─────────────────────────────────────────────────────────────

export async function createParent(
  _prevState: CreateParentState,
  formData: FormData
): Promise<CreateParentState> {
  const { supabase, schoolId } = await resolveSchoolAdmin()

  const parsed = ParentSchema.safeParse({
    first_name:  formData.get('first_name'),
    last_name:   formData.get('last_name'),
    phone:       formData.get('phone'),
    email:       formData.get('email'),
    address:     formData.get('address'),
    occupation:  formData.get('occupation'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as CreateParentState['errors'],
    }
  }

  const { data: parent, error } = await supabase
    .from('parents')
    .insert({
      school_id:  schoolId,
      first_name: parsed.data.first_name,
      last_name:  parsed.data.last_name,
      phone:      parsed.data.phone    ?? null,
      email:      parsed.data.email    ?? null,
      address:    parsed.data.address  ?? null,
      occupation: parsed.data.occupation ?? null,
      status:     'active',
    })
    .select('id')
    .single()

  if (error || !parent) {
    return {
      errors: formatServerActionError(error, {
        action: 'createParent',
        schoolId,
        entityIds: { email: parsed.data.email },
        fallback: 'Erreur lors de la création du dossier. Veuillez réessayer.',
      }) as CreateParentState['errors'],
    }
  }

  redirect(`/school/parents/${parent.id}`)
}

// ─── updateParent ─────────────────────────────────────────────────────────────

export async function updateParent(
  _prevState: ParentFormState,
  formData: FormData
): Promise<ParentFormState> {
  const { supabase, schoolId } = await resolveSchoolAdmin()

  const parentId = z.string().uuid().safeParse(formData.get('parent_id'))
  if (!parentId.success) {
    return { errors: { _form: ['Identifiant parent invalide.'] } }
  }

  const parsed = ParentSchema.safeParse({
    first_name:  formData.get('first_name'),
    last_name:   formData.get('last_name'),
    phone:       formData.get('phone'),
    email:       formData.get('email'),
    address:     formData.get('address'),
    occupation:  formData.get('occupation'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as ParentFormState['errors'],
    }
  }

  const { error } = await supabase
    .from('parents')
    .update({
      first_name:  parsed.data.first_name,
      last_name:   parsed.data.last_name,
      phone:       parsed.data.phone      ?? null,
      email:       parsed.data.email      ?? null,
      address:     parsed.data.address    ?? null,
      occupation:  parsed.data.occupation ?? null,
    })
    .eq('id', parentId.data)
    .eq('school_id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'updateParent',
        schoolId,
        entityIds: { parentId: parentId.data },
        fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
      }) as ParentFormState['errors'],
    }
  }

  redirect(`/school/parents/${parentId.data}`)
}

// ─── setParentStatus ──────────────────────────────────────────────────────────

export async function setParentStatus(formData: FormData) {
  const { supabase, schoolId } = await resolveSchoolAdmin()

  const parentId = z.string().uuid().safeParse(formData.get('parent_id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!parentId.success || !newStatus.success) redirect('/school/parents')

  const { error } = await supabase
    .from('parents')
    .update({ status: newStatus.data })
    .eq('id', parentId.data)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setParentStatus', schoolId, entityIds: { parentId: parentId.data, newStatus: newStatus.data } })
    redirect(`/school/parents/${parentId.data}?error=status`)
  }

  redirect(`/school/parents/${parentId.data}`)
}

// ─── linkStudentsToParent ─────────────────────────────────────────────────────

const VALID_RELATIONSHIPS = ['father', 'mother', 'guardian', 'other'] as const
type Relationship = typeof VALID_RELATIONSHIPS[number]

function sanitiseRelationship(v: FormDataEntryValue | null): Relationship {
  if (VALID_RELATIONSHIPS.includes(v as Relationship)) return v as Relationship
  return 'guardian'
}

export async function linkStudentsToParent(
  _prevState: LinkStudentsState,
  formData: FormData
): Promise<LinkStudentsState> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const parentId        = (formData.get('parent_id') as string | null)?.trim() ?? ''
  const relationship    = sanitiseRelationship(formData.get('relationship'))
  const isPrimaryContact = formData.get('is_primary_contact') === 'on'
  const studentIds      = formData.getAll('student_ids').map(String).filter(Boolean)

  if (!parentId) return { errors: { _form: ['Paramètre parent manquant.'] } }
  if (studentIds.length === 0) {
    return { errors: { _form: ['Sélectionnez au moins un élève.'] } }
  }

  // Verify parent belongs to this school
  const { data: parent } = await supabase
    .from('parents')
    .select('id')
    .eq('id', parentId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!parent) return { errors: { _form: ['Parent introuvable.'] } }

  // Verify all submitted student IDs belong to this school
  const { data: validStudents } = await supabase
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .in('id', studentIds)

  const validIds = (validStudents ?? []).map((s) => (s as { id: string }).id)
  if (validIds.length === 0) {
    return { errors: { _form: ['Aucun élève valide sélectionné.'] } }
  }

  const records = validIds.map((studentId) => ({
    school_id:           schoolId,
    parent_id:           parentId,
    student_id:          studentId,
    relationship:        relationship,
    is_primary_contact:  isPrimaryContact,
  }))

  const { error } = await supabase
    .from('parent_student_links')
    .upsert(records, { onConflict: 'parent_id,student_id' })

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'linkStudentsToParent',
        schoolId,
        userId: user.id,
        entityIds: { parentId, studentCount: validIds.length },
        fallback: 'Erreur lors de la liaison des élèves. Veuillez réessayer.',
      }) as LinkStudentsState['errors'],
    }
  }

  redirect(`/school/parents/${parentId}`)
}

// ─── unlinkStudent ────────────────────────────────────────────────────────────

export async function unlinkStudent(formData: FormData): Promise<void> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return

  const linkId   = (formData.get('link_id')   as string | null)?.trim()
  const parentId = (formData.get('parent_id') as string | null)?.trim()
  if (!linkId) return

  const { error } = await supabase
    .from('parent_student_links')
    .delete()
    .eq('id', linkId)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'unlinkStudent', schoolId, userId: user.id, entityIds: { linkId, parentId } })
    redirect(parentId ? `/school/parents/${parentId}?error=unlink` : '/school/parents?error=unlink')
  }

  redirect(parentId ? `/school/parents/${parentId}` : '/school/parents')
}
