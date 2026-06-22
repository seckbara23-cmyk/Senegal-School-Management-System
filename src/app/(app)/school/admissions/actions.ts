'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE, canAddStudent, logLimitBlocked, STUDENT_LIMIT_REACHED_MESSAGE } from '@/lib/tenant'
import { slugify } from '@/lib/admissions'
import { notifyInvoiceCreated } from '@/lib/notification-events'

// ─── Shared guard ───────────────────────────────────────────────────────────

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

const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v)

// ─── Public-intake settings (Phase 6.1) ──────────────────────────────────────

export type AdmissionsSettingsState = { error?: string }

const SettingsSchema = z.object({
  enabled: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  slug:    z.preprocess(emptyToUndef, z.string().max(60).optional()),
  intro:   z.preprocess(emptyToUndef, z.string().max(2000).optional()),
})

export async function updateAdmissionsSettings(_prev: AdmissionsSettingsState, formData: FormData): Promise<AdmissionsSettingsState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = SettingsSchema.safeParse({ enabled: formData.get('enabled'), slug: formData.get('slug'), intro: formData.get('intro') })
  if (!parsed.success) return { error: 'Données invalides.' }
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : null

  if (parsed.data.enabled && (!slug || slug.length < 3)) {
    return { error: 'Un identifiant public d’au moins 3 caractères est requis pour activer les candidatures en ligne.' }
  }

  const { error } = await supabase
    .from('schools')
    .update({ admissions_enabled: parsed.data.enabled, admissions_slug: slug, admissions_intro: parsed.data.intro ?? null })
    .eq('id', schoolId)

  if (error) {
    if (error.code === '23505') return { error: 'Cet identifiant public est déjà utilisé par une autre école. Choisissez-en un autre.' }
    logSupabaseError(error, { action: 'updateAdmissionsSettings', schoolId, userId: actor.id })
    return { error: 'Erreur lors de l’enregistrement. Veuillez réessayer.' }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'admissions_settings_updated', resourceType: 'school', resourceId: schoolId,
    metadata: { enabled: parsed.data.enabled, slug },
  })
  redirect('/school/admissions/settings?saved=1')
}

// ─── Create applicant ───────────────────────────────────────────────────────

const AdmissionSchema = z.object({
  first_name:       z.string().min(1, 'Prénom requis.').max(100, 'Prénom trop long.'),
  last_name:        z.string().min(1, 'Nom requis.').max(100, 'Nom trop long.'),
  gender:           z.preprocess(emptyToUndef, z.enum(['male', 'female', 'other']).optional()),
  date_of_birth:    z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).').optional()),
  guardian_name:    z.preprocess(emptyToUndef, z.string().max(200, 'Nom trop long.').optional()),
  guardian_phone:   z.preprocess(emptyToUndef, z.string().max(50, 'Numéro trop long.').optional()),
  guardian_email:   z.preprocess(emptyToUndef, z.string().email('Adresse email invalide.').max(200).optional()),
  desired_class_id: z.preprocess(emptyToUndef, z.string().uuid('Classe invalide.').optional()),
  academic_year_id: z.preprocess(emptyToUndef, z.string().uuid('Année invalide.').optional()),
  documents:        z.preprocess(emptyToUndef, z.string().max(1000, 'Texte trop long.').optional()),
  notes:            z.preprocess(emptyToUndef, z.string().max(1000, 'Texte trop long.').optional()),
  status:           z.preprocess((v) => (v === 'draft' ? 'draft' : 'submitted'), z.enum(['draft', 'submitted'])),
})

export type AdmissionState = {
  errors?: {
    first_name?:       string[]
    last_name?:        string[]
    gender?:           string[]
    date_of_birth?:    string[]
    guardian_email?:   string[]
    desired_class_id?: string[]
    _form?:            string[]
  }
}

export async function createAdmission(
  _prevState: AdmissionState,
  formData: FormData,
): Promise<AdmissionState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = AdmissionSchema.safeParse({
    first_name:       formData.get('first_name'),
    last_name:        formData.get('last_name'),
    gender:           formData.get('gender'),
    date_of_birth:    formData.get('date_of_birth'),
    guardian_name:    formData.get('guardian_name'),
    guardian_phone:   formData.get('guardian_phone'),
    guardian_email:   formData.get('guardian_email'),
    desired_class_id: formData.get('desired_class_id'),
    academic_year_id: formData.get('academic_year_id'),
    documents:        formData.get('documents'),
    notes:            formData.get('notes'),
    status:           formData.get('status'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as AdmissionState['errors'] }
  }
  const d = parsed.data

  // Resolve the campaign year: a chosen class fixes it (consistency); otherwise
  // use the optionally-selected academic year. Both are validated school-scoped.
  let academicYearId: string | null = null
  if (d.desired_class_id) {
    const { data: cls } = await supabase
      .from('classes').select('id, academic_year_id').eq('id', d.desired_class_id).eq('school_id', schoolId).maybeSingle()
    if (!cls) return { errors: { desired_class_id: ['Classe introuvable.'] } }
    academicYearId = (cls as { academic_year_id: string }).academic_year_id
  } else if (d.academic_year_id) {
    const { data: yr } = await supabase
      .from('academic_years').select('id').eq('id', d.academic_year_id).eq('school_id', schoolId).maybeSingle()
    if (!yr) return { errors: { _form: ['Année scolaire introuvable.'] } }
    academicYearId = d.academic_year_id
  }

  const { data: row, error } = await supabase
    .from('admission_applications')
    .insert({
      school_id:        schoolId,
      academic_year_id: academicYearId,
      first_name:       d.first_name.trim(),
      last_name:        d.last_name.trim(),
      gender:           d.gender ?? null,
      date_of_birth:    d.date_of_birth ?? null,
      guardian_name:    d.guardian_name ?? null,
      guardian_phone:   d.guardian_phone ?? null,
      guardian_email:   d.guardian_email ?? null,
      desired_class_id: d.desired_class_id ?? null,
      documents:        d.documents ?? null,
      notes:            d.notes ?? null,
      status:           d.status,
      created_by:       actor.id,
    })
    .select('id')
    .single()

  if (error || !row) {
    return {
      errors: formatServerActionError(error, {
        action: 'createAdmission', schoolId, userId: actor.id,
        entityIds: { last_name: d.last_name },
        fallback: 'Erreur lors de la création de la candidature. Veuillez réessayer.',
      }) as AdmissionState['errors'],
    }
  }

  const admissionId = (row as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'admission_created', resourceType: 'admission', resourceId: admissionId,
    metadata: { first_name: d.first_name.trim(), last_name: d.last_name.trim(), status: d.status, desired_class_id: d.desired_class_id ?? null },
  })

  redirect(`/school/admissions/${admissionId}`)
}

// ─── Status transitions ─────────────────────────────────────────────────────

async function recordEvent(supabase: ReturnType<typeof createClient>, schoolId: string, applicationId: string, e: { type: string; status_from?: string | null; status_to?: string | null; message?: string | null; visibility?: 'internal' | 'applicant'; actorId: string | null }) {
  await supabase.from('admission_events').insert({
    school_id: schoolId, application_id: applicationId, type: e.type,
    status_from: e.status_from ?? null, status_to: e.status_to ?? null, message: e.message ?? null,
    visibility: e.visibility ?? 'internal', actor_id: e.actorId,
  })
}

export async function setAdmissionStatus(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const admissionId = z.string().uuid().safeParse(formData.get('admission_id'))
  const newStatus   = z.enum(['submitted', 'under_review', 'accepted', 'rejected', 'waitlisted']).safeParse(formData.get('new_status'))
  if (!admissionId.success || !newStatus.success) redirect('/school/admissions')

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/admissions/${admissionId.data}?error=readonly`)
  }

  const { data: existing } = await supabase
    .from('admission_applications')
    .select('id, status, converted_student_id')
    .eq('id', admissionId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!existing) redirect('/school/admissions')
  const ex = existing as { id: string; status: string; converted_student_id: string | null }

  // A converted application is frozen.
  if (ex.converted_student_id) redirect(`/school/admissions/${ex.id}?error=converted`)

  const reasonRaw = (formData.get('decision_reason') as string | null)?.trim() ?? ''
  const reason = reasonRaw === '' ? null : reasonRaw.slice(0, 500)
  const isDecision = newStatus.data === 'accepted' || newStatus.data === 'rejected' || newStatus.data === 'waitlisted'

  const update: Record<string, unknown> = { status: newStatus.data, decision_reason: reason }
  if (isDecision) { update.decision_at = new Date().toISOString(); update.decision_by = actor.id }

  const { error } = await supabase.from('admission_applications').update(update).eq('id', ex.id).eq('school_id', schoolId)
  if (error) {
    logSupabaseError(error, { action: 'setAdmissionStatus', schoolId, userId: actor.id, entityIds: { admissionId: ex.id, newStatus: newStatus.data } })
    redirect(`/school/admissions/${ex.id}?error=server`)
  }

  await recordEvent(supabase, schoolId, ex.id, {
    type: isDecision ? 'decision' : 'status_change', status_from: ex.status, status_to: newStatus.data,
    message: reason, visibility: isDecision ? 'applicant' : 'internal', actorId: actor.id,
  })
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'admission_status_changed', resourceType: 'admission', resourceId: ex.id,
    metadata: { old_status: ex.status, new_status: newStatus.data, decision_reason: reason },
  })

  redirect(`/school/admissions/${ex.id}`)
}

// ─── Notes, document requests, withdrawal (Phase 6.3) ─────────────────────────

export async function addAdmissionNote(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('admission_id'))
  const message = z.string().trim().min(1).max(1000).safeParse(formData.get('message'))
  const visibility = (formData.get('visibility') === 'applicant' ? 'applicant' : 'internal') as 'internal' | 'applicant'
  if (!id.success || !message.success) redirect('/school/admissions')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/admissions/${id.data}?error=readonly`)

  const { data: app } = await supabase.from('admission_applications').select('id').eq('id', id.data).eq('school_id', schoolId).maybeSingle()
  if (!app) redirect('/school/admissions')

  await recordEvent(supabase, schoolId, id.data, { type: 'note', message: message.data, visibility, actorId: actor.id })
  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'admission_note_added', resourceType: 'admission', resourceId: id.data, metadata: { visibility } })
  redirect(`/school/admissions/${id.data}`)
}

export async function requestDocuments(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('admission_id'))
  const message = z.string().trim().min(1).max(1000).safeParse(formData.get('message'))
  if (!id.success || !message.success) redirect('/school/admissions')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/admissions/${id.data}?error=readonly`)

  const { data: app } = await supabase.from('admission_applications').select('id, status, converted_student_id').eq('id', id.data).eq('school_id', schoolId).maybeSingle()
  const ex = app as { id: string; status: string; converted_student_id: string | null } | null
  if (!ex) redirect('/school/admissions')
  if (ex.converted_student_id) redirect(`/school/admissions/${id.data}?error=converted`)

  await supabase.from('admission_applications').update({ status: 'documents_requested' }).eq('id', id.data).eq('school_id', schoolId)
  await recordEvent(supabase, schoolId, id.data, { type: 'documents_requested', status_from: ex.status, status_to: 'documents_requested', message: message.data, visibility: 'applicant', actorId: actor.id })
  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'admission_documents_requested', resourceType: 'admission', resourceId: id.data, metadata: {} })
  redirect(`/school/admissions/${id.data}`)
}

export async function withdrawAdmission(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()
  const id = z.string().uuid().safeParse(formData.get('admission_id'))
  if (!id.success) redirect('/school/admissions')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/admissions/${id.data}?error=readonly`)

  const { data: app } = await supabase.from('admission_applications').select('id, status, converted_student_id').eq('id', id.data).eq('school_id', schoolId).maybeSingle()
  const ex = app as { id: string; status: string; converted_student_id: string | null } | null
  if (!ex) redirect('/school/admissions')
  if (ex.converted_student_id) redirect(`/school/admissions/${id.data}?error=converted`)

  await supabase.from('admission_applications').update({ status: 'withdrawn' }).eq('id', id.data).eq('school_id', schoolId)
  await recordEvent(supabase, schoolId, id.data, { type: 'status_change', status_from: ex.status, status_to: 'withdrawn', visibility: 'internal', actorId: actor.id })
  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'admission_withdrawn', resourceType: 'admission', resourceId: id.data, metadata: { previous_status: ex.status } })
  redirect(`/school/admissions/${id.data}`)
}

// ─── Convert accepted applicant → student ───────────────────────────────────

const ConvertSchema = z.object({
  admission_id:     z.string().uuid('Candidature invalide.'),
  admission_number: z.string().min(1, "Le matricule est requis.").max(50, 'Matricule trop long.'),
  class_id:         z.preprocess(emptyToUndef, z.string().uuid('Classe invalide.').optional()),
  create_parent:    z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  invoice_due_date: z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.').optional()),
})

export type ConvertState = {
  errors?: {
    admission_number?: string[]
    class_id?:         string[]
    _form?:            string[]
  }
}

export async function convertAdmission(
  _prevState: ConvertState,
  formData: FormData,
): Promise<ConvertState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = ConvertSchema.safeParse({
    admission_id:     formData.get('admission_id'),
    admission_number: formData.get('admission_number'),
    class_id:         formData.get('class_id'),
    create_parent:    formData.get('create_parent'),
    invoice_due_date: formData.get('invoice_due_date'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as ConvertState['errors'] }
  }
  const { admission_id, admission_number, class_id, create_parent, invoice_due_date } = parsed.data
  const feeItemIds = formData.getAll('fee_item_ids').map((v) => String(v)).filter(Boolean)

  const { data: appRaw } = await supabase
    .from('admission_applications')
    .select('id, first_name, last_name, gender, date_of_birth, status, converted_student_id, guardian_name, guardian_phone, guardian_email, guardian_relationship, guardian_address')
    .eq('id', admission_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!appRaw) return { errors: { _form: ['Candidature introuvable.'] } }
  type AppRow = { id: string; first_name: string; last_name: string; gender: string | null; date_of_birth: string | null; status: string; converted_student_id: string | null; guardian_name: string | null; guardian_phone: string | null; guardian_email: string | null; guardian_relationship: string | null; guardian_address: string | null }
  const app = appRaw as AppRow

  if (app.converted_student_id) return { errors: { _form: ['Cette candidature a déjà été convertie en élève.'] } }
  if (app.status !== 'accepted') return { errors: { _form: ['Seules les candidatures acceptées peuvent être converties.'] } }

  // Subscription quota — conversion creates an ACTIVE student. Checked before any
  // record is created/modified so the conversion is all-or-nothing. Fails open.
  if (!(await canAddStudent(supabase, schoolId))) {
    logLimitBlocked('student', { schoolId, userId: actor.id })
    return { errors: { _form: [STUDENT_LIMIT_REACHED_MESSAGE] } }
  }

  // Resolve the optional target class (and its year) before creating anything.
  let enrollClass: { id: string; academic_year_id: string } | null = null
  if (class_id) {
    const { data: cls } = await supabase
      .from('classes').select('id, academic_year_id').eq('id', class_id).eq('school_id', schoolId).maybeSingle()
    if (!cls) return { errors: { class_id: ['Classe introuvable.'] } }
    enrollClass = cls as { id: string; academic_year_id: string }
  }

  // Create the student record.
  const { data: studentRow, error: studentError } = await supabase
    .from('students')
    .insert({
      school_id:        schoolId,
      first_name:       app.first_name,
      last_name:        app.last_name,
      gender:           app.gender,
      date_of_birth:    app.date_of_birth,
      admission_number: admission_number.trim(),
      status:           'active',
    })
    .select('id')
    .single()

  if (studentError || !studentRow) {
    return {
      errors: formatServerActionError(studentError, {
        action: 'convertAdmission', schoolId, userId: actor.id,
        entityIds: { admission_id, admission_number },
        constraints: {
          students_school_admission_unique: { field: 'admission_number', message: "Ce matricule est déjà utilisé par un autre élève." },
        },
        fallback: "Erreur lors de la création de l'élève. Veuillez réessayer.",
      }) as ConvertState['errors'],
    }
  }
  const studentId = (studentRow as { id: string }).id

  // Optional enrollment into the chosen class (reuses the enrollment pattern).
  let enrolled = false
  if (enrollClass) {
    const { error: enrollError } = await supabase
      .from('student_class_enrollments')
      .upsert({
        school_id:        schoolId,
        student_id:       studentId,
        class_id:         enrollClass.id,
        academic_year_id: enrollClass.academic_year_id,
        status:           'active',
        enrolled_at:      new Date().toISOString(),
      }, { onConflict: 'student_id,class_id,academic_year_id' })
    if (enrollError) {
      // Non-fatal: the student exists; surface a note but continue to link.
      logSupabaseError(enrollError, { action: 'convertAdmission:enroll', schoolId, userId: actor.id, entityIds: { studentId, classId: enrollClass.id } })
    } else {
      enrolled = true
    }
  }

  // Optional: create a parent from the guardian fields + link to the student.
  let parentId: string | null = null
  if (create_parent && app.guardian_name && app.guardian_name.trim()) {
    const parts = app.guardian_name.trim().split(/\s+/)
    const first = parts[0]
    const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0]
    const { data: parentRow } = await supabase.from('parents').insert({
      school_id: schoolId, first_name: first, last_name: last,
      phone: app.guardian_phone, email: app.guardian_email, address: app.guardian_address, status: 'active',
    }).select('id').single()
    if (parentRow) {
      parentId = (parentRow as { id: string }).id
      await supabase.from('parent_student_links').upsert({
        school_id: schoolId, parent_id: parentId, student_id: studentId,
        relationship: app.guardian_relationship ?? 'guardian', is_primary_contact: true,
      }, { onConflict: 'parent_id,student_id' })
      await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'admission_parent_created', resourceType: 'parent', resourceId: parentId, metadata: { admission_id, student_id: studentId } })
    }
  }

  // Optional: a registration / fee invoice from selected fee items.
  let invoiceId: string | null = null
  if (feeItemIds.length > 0) {
    const { data: items } = await supabase.from('fee_items').select('id, name, amount').eq('school_id', schoolId).in('id', feeItemIds)
    const details = (items ?? []) as { id: string; name: string; amount: number }[]
    const total = details.reduce((s, i) => s + i.amount, 0)
    if (details.length === feeItemIds.length && total > 0) {
      const year = new Date().getFullYear()
      const { count } = await supabase.from('student_invoices').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
      const number = `${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { data: inv } = await supabase.from('student_invoices').insert({
        school_id: schoolId, student_id: studentId, academic_year_id: enrollClass?.academic_year_id ?? null,
        invoice_number: number, title: 'Frais d’inscription', total_amount: total, amount_paid: 0, status: 'unpaid',
        due_date: invoice_due_date ?? null, created_by: actor.id,
      }).select('id').single()
      if (inv) {
        invoiceId = (inv as { id: string }).id
        await supabase.from('invoice_lines').insert(details.map((it) => ({ school_id: schoolId, invoice_id: invoiceId, fee_item_id: it.id, description: it.name, amount: it.amount })))
        await notifyInvoiceCreated(supabase, { schoolId, invoiceId, invoiceNumber: number, studentId, amount: total, dueDate: invoice_due_date ?? null })
        await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'admission_invoice_generated', resourceType: 'invoice', resourceId: invoiceId, metadata: { admission_id, student_id: studentId, total } })
      }
    }
  }

  // Link the application to the new student/parent/invoice (marks it converted).
  await supabase
    .from('admission_applications')
    .update({ converted_student_id: studentId, converted_parent_id: parentId, application_fee_invoice_id: invoiceId })
    .eq('id', admission_id)
    .eq('school_id', schoolId)

  await recordEvent(supabase, schoolId, admission_id, { type: 'converted', status_to: app.status, message: 'Candidature convertie en élève', visibility: 'applicant', actorId: actor.id })
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'admission_converted', resourceType: 'admission', resourceId: admission_id,
    metadata: { student_id: studentId, admission_number: admission_number.trim(), class_id: enrollClass?.id ?? null, enrolled, parent_id: parentId, invoice_id: invoiceId },
  })

  redirect(`/school/students/${studentId}`)
}
