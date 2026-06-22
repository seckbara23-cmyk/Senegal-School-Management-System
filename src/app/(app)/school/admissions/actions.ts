'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE, canAddStudent, logLimitBlocked, STUDENT_LIMIT_REACHED_MESSAGE } from '@/lib/tenant'

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

export async function setAdmissionStatus(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const admissionId = z.string().uuid().safeParse(formData.get('admission_id'))
  const newStatus   = z.enum(['submitted', 'accepted', 'rejected', 'waitlisted']).safeParse(formData.get('new_status'))
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

  const { error } = await supabase
    .from('admission_applications')
    .update({ status: newStatus.data, decision_reason: reason })
    .eq('id', ex.id)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setAdmissionStatus', schoolId, userId: actor.id, entityIds: { admissionId: ex.id, newStatus: newStatus.data } })
    redirect(`/school/admissions/${ex.id}?error=server`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'admission_status_changed', resourceType: 'admission', resourceId: ex.id,
    metadata: { old_status: ex.status, new_status: newStatus.data, decision_reason: reason },
  })

  redirect(`/school/admissions/${ex.id}`)
}

// ─── Convert accepted applicant → student ───────────────────────────────────

const ConvertSchema = z.object({
  admission_id:     z.string().uuid('Candidature invalide.'),
  admission_number: z.string().min(1, "Le matricule est requis.").max(50, 'Matricule trop long.'),
  class_id:         z.preprocess(emptyToUndef, z.string().uuid('Classe invalide.').optional()),
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
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as ConvertState['errors'] }
  }
  const { admission_id, admission_number, class_id } = parsed.data

  const { data: appRaw } = await supabase
    .from('admission_applications')
    .select('id, first_name, last_name, gender, date_of_birth, status, converted_student_id')
    .eq('id', admission_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!appRaw) return { errors: { _form: ['Candidature introuvable.'] } }
  type AppRow = { id: string; first_name: string; last_name: string; gender: string | null; date_of_birth: string | null; status: string; converted_student_id: string | null }
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

  // Link the application to the new student (marks it converted).
  await supabase
    .from('admission_applications')
    .update({ converted_student_id: studentId })
    .eq('id', admission_id)
    .eq('school_id', schoolId)

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'admission_converted', resourceType: 'admission', resourceId: admission_id,
    metadata: { student_id: studentId, admission_number: admission_number.trim(), class_id: enrollClass?.id ?? null, enrolled },
  })

  redirect(`/school/students/${studentId}`)
}
