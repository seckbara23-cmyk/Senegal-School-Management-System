'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { parseCsv, readParentRows } from '@/lib/parse-csv'

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
    .order('created_at', { ascending: true })
    .limit(1)
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

  return { supabase, schoolId, actor: user }
}

// ─── createParent ─────────────────────────────────────────────────────────────

export async function createParent(
  _prevState: CreateParentState,
  formData: FormData
): Promise<CreateParentState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
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

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'parent_created', resourceType: 'parent', resourceId: parent.id,
    metadata: { first_name: parsed.data.first_name, last_name: parsed.data.last_name, email: parsed.data.email ?? null },
  })

  redirect(`/school/parents/${parent.id}`)
}

// ─── updateParent ─────────────────────────────────────────────────────────────

export async function updateParent(
  _prevState: ParentFormState,
  formData: FormData
): Promise<ParentFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const parentId = z.string().uuid().safeParse(formData.get('parent_id'))
  if (!parentId.success) {
    return { errors: { _form: ['Identifiant parent invalide.'] } }
  }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
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

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'parent_updated', resourceType: 'parent', resourceId: parentId.data,
    metadata: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
  })

  redirect(`/school/parents/${parentId.data}`)
}

// ─── setParentStatus ──────────────────────────────────────────────────────────

export async function setParentStatus(formData: FormData) {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const parentId = z.string().uuid().safeParse(formData.get('parent_id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!parentId.success || !newStatus.success) redirect('/school/parents')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/parents/${parentId.data}?error=readonly`)
  }

  // Capture the previous status for the audit trail.
  const { data: before } = await supabase
    .from('parents')
    .select('status')
    .eq('id', parentId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  const oldStatus = (before as { status: string } | null)?.status ?? null

  const { error } = await supabase
    .from('parents')
    .update({ status: newStatus.data })
    .eq('id', parentId.data)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setParentStatus', schoolId, entityIds: { parentId: parentId.data, newStatus: newStatus.data } })
    redirect(`/school/parents/${parentId.data}?error=status`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'parent_status_changed', resourceType: 'parent', resourceId: parentId.data,
    metadata: { old_status: oldStatus, new_status: newStatus.data },
  })

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'parent_student_linked', resourceType: 'parent', resourceId: parentId,
    metadata: { student_ids: validIds, relationship, is_primary_contact: isPrimaryContact, count: validIds.length },
  })

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(parentId ? `/school/parents/${parentId}?error=readonly` : '/school/parents?error=readonly')
  }

  const { error } = await supabase
    .from('parent_student_links')
    .delete()
    .eq('id', linkId)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'unlinkStudent', schoolId, userId: user.id, entityIds: { linkId, parentId } })
    redirect(parentId ? `/school/parents/${parentId}?error=unlink` : '/school/parents?error=unlink')
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'parent_student_unlinked', resourceType: 'parent', resourceId: parentId ?? linkId!,
    metadata: { link_id: linkId, parent_id: parentId ?? null },
  })

  redirect(parentId ? `/school/parents/${parentId}` : '/school/parents')
}

// ─── Bulk import (CSV / XLSX) ──────────────────────────────────────────────────
//
// Duplicate detection: by email OR phone within the school. Duplicates are
// SKIPPED (not errors). Any structural row error — OR an unknown
// student_admission_number — blocks the WHOLE import. When an admission number
// matches a student, a parent_student_link is created (relationship from the
// row, default guardian). The server re-parses/re-validates authoritatively and
// resolves school_id server-side.

export type ImportParentsState = {
  errors?: { _form?: string[] }
  rowErrors?: { line: number; message: string }[]
}

export async function importParentsFromCsv(
  _prevState: ImportParentsState,
  formData: FormData,
): Promise<ImportParentsState> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const csvText = String(formData.get('csv_text') ?? '')
  if (!csvText.trim()) return { errors: { _form: ['Aucune donnée à importer. Choisissez un fichier CSV ou Excel (.xlsx).'] } }

  const { rows } = readParentRows(parseCsv(csvText))
  if (rows.length === 0) return { errors: { _form: ['Le fichier ne contient aucun parent.'] } }

  const rowErrors = rows.filter((r) => r.error).map((r) => ({ line: r.line, message: `Ligne ${r.line} : ${r.error}` }))

  // Resolve admission numbers → student ids (scoped to this school). An unknown
  // admission number is a blocking row error.
  const { data: students } = await supabase
    .from('students').select('id, admission_number').eq('school_id', schoolId)
  const admMap = new Map<string, string>()
  for (const s of (students ?? []) as { id: string; admission_number: string }[]) {
    admMap.set(s.admission_number.trim().toLowerCase(), s.id)
  }
  for (const r of rows) {
    if (r.error) continue
    if (r.student_admission_number && !admMap.has(r.student_admission_number.trim().toLowerCase())) {
      rowErrors.push({ line: r.line, message: `Ligne ${r.line} : élève introuvable (${r.student_admission_number}).` })
    }
  }
  if (rowErrors.length > 0) {
    rowErrors.sort((a, b) => a.line - b.line)
    return { errors: { _form: ["Le fichier contient des erreurs. Corrigez-les puis réessayez (aucun parent n'a été importé)."] }, rowErrors }
  }

  // Existing-parent dedup keys: email and phone.
  const { data: existing } = await supabase
    .from('parents').select('email, phone').eq('school_id', schoolId)
  const emailSet = new Set<string>()
  const phoneSet = new Set<string>()
  for (const p of (existing ?? []) as { email: string | null; phone: string | null }[]) {
    if (p.email) emailSet.add(p.email.trim().toLowerCase())
    if (p.phone) phoneSet.add(p.phone.trim().toLowerCase())
  }

  const seenEmail = new Set<string>()
  const seenPhone = new Set<string>()
  type Pending = { first_name: string; last_name: string; email: string | null; phone: string | null; status: string; relationship: string; student_id: string | null }
  const toCreate: Pending[] = []
  let skipped = 0
  for (const r of rows) {
    const em = r.email.toLowerCase()
    const ph = r.phone.toLowerCase()
    const dupExisting = (em && emailSet.has(em)) || (ph && phoneSet.has(ph))
    const dupInFile   = (em && seenEmail.has(em)) || (ph && seenPhone.has(ph))
    if (dupExisting || dupInFile) { skipped++; continue }
    if (em) seenEmail.add(em)
    if (ph) seenPhone.add(ph)
    toCreate.push({
      first_name: r.first_name, last_name: r.last_name,
      email: r.email || null, phone: r.phone || null, status: r.status || 'active',
      relationship: r.relationship,
      student_id: r.student_admission_number ? (admMap.get(r.student_admission_number.trim().toLowerCase()) ?? null) : null,
    })
  }

  let created = 0
  let linked  = 0
  if (toCreate.length > 0) {
    const insertRows = toCreate.map((p) => ({
      school_id: schoolId, first_name: p.first_name, last_name: p.last_name,
      email: p.email, phone: p.phone, status: p.status,
    }))
    const { data: inserted, error } = await supabase.from('parents').insert(insertRows).select('id')
    if (error) {
      return {
        errors: {
          _form: [formatServerActionError(error, {
            action: 'importParentsFromCsv', schoolId, userId: user.id,
            entityIds: { count: toCreate.length },
            fallback: "Erreur lors de l'import des parents. Veuillez réessayer.",
          })._form?.[0] ?? "Erreur lors de l'import des parents. Veuillez réessayer."],
        },
      }
    }
    const ids = ((inserted ?? []) as { id: string }[]).map((x) => x.id)
    created = ids.length

    // Postgres RETURNING preserves the VALUES order, so inserted[i] ↔ toCreate[i].
    const linkRows = []
    for (let i = 0; i < ids.length; i++) {
      const p = toCreate[i]
      if (p.student_id) {
        linkRows.push({
          school_id: schoolId, parent_id: ids[i], student_id: p.student_id,
          relationship: p.relationship, is_primary_contact: false,
        })
      }
    }
    if (linkRows.length > 0) {
      const { error: linkErr } = await supabase
        .from('parent_student_links').upsert(linkRows, { onConflict: 'parent_id,student_id' })
      if (!linkErr) linked = linkRows.length
      else logSupabaseError(linkErr, { action: 'importParentsFromCsv:link', schoolId, userId: user.id, entityIds: { count: linkRows.length } })
    }

    await logAuditEvent(supabase, {
      actorId: user.id, actorEmail: user.email, schoolId,
      action: 'parents_bulk_created', resourceType: 'parent', resourceId: schoolId,
      metadata: { source: 'import', created, skipped, linked },
    })
  }

  redirect(`/school/parents?created=${created}&skipped=${skipped}&linked=${linked}`)
}
