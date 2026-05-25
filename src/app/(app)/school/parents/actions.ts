'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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

export type CreateParentState = {
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
  return (data?.[0]?.school_id as string) ?? null
}

// ─── createParent ─────────────────────────────────────────────────────────────

export async function createParent(
  _prevState: CreateParentState,
  formData: FormData
): Promise<CreateParentState> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

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
    console.error('[createParent] insert error:', error?.message)
    return {
      errors: { _form: ['Erreur lors de la création du dossier. Veuillez réessayer.'] },
    }
  }

  redirect(`/school/parents/${parent.id}`)
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
    console.error('[linkStudentsToParent] upsert error:', error.message)
    return {
      errors: { _form: ['Erreur lors de la liaison des élèves. Veuillez réessayer.'] },
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

  const linkId = (formData.get('link_id') as string | null)?.trim()
  if (!linkId) return

  await supabase
    .from('parent_student_links')
    .delete()
    .eq('id', linkId)
    .eq('school_id', schoolId)
}
