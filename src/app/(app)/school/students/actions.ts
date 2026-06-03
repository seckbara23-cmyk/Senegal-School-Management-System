'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE, canAddStudent, logLimitBlocked, STUDENT_LIMIT_REACHED_MESSAGE } from '@/lib/tenant'

// Unique-constraint name → friendly field message (see migration 002).
const STUDENT_CONSTRAINTS = {
  students_school_admission_unique: {
    field: 'admission_number',
    message: "Ce numéro d'admission est déjà utilisé par un autre élève.",
  },
}

// ─── Validation schema (shared by create and update) ─────────────────────────

const StudentSchema = z.object({
  first_name: z
    .string()
    .min(1, 'Le prénom est requis.')
    .max(100, 'Prénom trop long (100 caractères max).'),
  last_name: z
    .string()
    .min(1, 'Le nom est requis.')
    .max(100, 'Nom trop long (100 caractères max).'),
  admission_number: z
    .string()
    .min(1, "Le numéro d'admission est requis.")
    .max(50, "Numéro d'admission trop long (50 caractères max)."),
  // Empty string from a blank <select> is coerced to undefined (optional field).
  gender: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum(['male', 'female', 'other']).optional()
  ),
  // Empty string from a blank <input type="date"> is coerced to undefined.
  date_of_birth: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).')
      .optional()
  ),
  // Missing or blank value defaults to 'active'.
  status: z.preprocess(
    (v) => (!v || v === '' ? 'active' : v),
    z.enum(['active', 'inactive', 'graduated'])
  ),
})

// ─── State type (shared with the client form component) ───────────────────────

export type CreateStudentState = {
  errors?: {
    first_name?:       string[]
    last_name?:        string[]
    admission_number?: string[]
    gender?:           string[]
    date_of_birth?:    string[]
    status?:           string[]
    _form?:            string[]
  }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function createStudent(
  _prevState: CreateStudentState,
  formData: FormData
): Promise<CreateStudentState> {
  const supabase = createClient()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  // ── School admin guard ─────────────────────────────────────────────────────
  // school_id is read from the server — never trusted from the form.
  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    return { errors: { _form: ['Non autorisé.'] } }
  }

  const schoolId = memberships[0].school_id as string

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const parsed = StudentSchema.safeParse({
    first_name:       formData.get('first_name'),
    last_name:        formData.get('last_name'),
    admission_number: formData.get('admission_number'),
    gender:           formData.get('gender'),
    date_of_birth:    formData.get('date_of_birth'),
    status:           formData.get('status'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as CreateStudentState['errors'],
    }
  }

  // ── Subscription quota ───────────────────────────────────────────────────────
  // Only an ACTIVE student counts against the plan limit. Checked after
  // validation and before any insert so no partial record is created. Fails open.
  if (parsed.data.status === 'active' && !(await canAddStudent(supabase, schoolId))) {
    logLimitBlocked('student', { schoolId, userId: user.id })
    return { errors: { _form: [STUDENT_LIMIT_REACHED_MESSAGE] } }
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  // school_id comes from the server-side membership lookup above.
  // RLS on the students table provides a second isolation layer.
  const { data: newStudent, error: insertError } = await supabase
    .from('students')
    .insert({
      school_id:        schoolId,
      first_name:       parsed.data.first_name,
      last_name:        parsed.data.last_name,
      admission_number: parsed.data.admission_number,
      gender:           parsed.data.gender        ?? null,
      date_of_birth:    parsed.data.date_of_birth ?? null,
      status:           parsed.data.status,
    })
    .select('id')
    .single()

  if (insertError || !newStudent) {
    return {
      errors: formatServerActionError(insertError, {
        action: 'createStudent',
        schoolId,
        userId: user.id,
        entityIds: { admission_number: parsed.data.admission_number },
        constraints: STUDENT_CONSTRAINTS,
        fallback: "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.",
      }) as CreateStudentState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'student_created', resourceType: 'student', resourceId: newStudent.id,
    metadata: { admission_number: parsed.data.admission_number, first_name: parsed.data.first_name, last_name: parsed.data.last_name, status: parsed.data.status },
  })

  // redirect() throws NEXT_REDIRECT — must be called outside try/catch.
  redirect(`/school/students/${newStudent.id}`)
}

// ─── Update student ───────────────────────────────────────────────────────────

export type UpdateStudentState = {
  errors?: {
    first_name?:       string[]
    last_name?:        string[]
    admission_number?: string[]
    gender?:           string[]
    date_of_birth?:    string[]
    status?:           string[]
    _form?:            string[]
  }
}

export async function updateStudent(
  _prevState: UpdateStudentState,
  formData: FormData
): Promise<UpdateStudentState> {
  const supabase = createClient()

  // ── Auth check ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  // ── School admin guard ─────────────────────────────────────────────────────
  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    return { errors: { _form: ['Non autorisé.'] } }
  }

  const schoolId = memberships[0].school_id as string

  // ── Student ID from form ───────────────────────────────────────────────────
  // The studentId is taken from a hidden field, but we always combine it with
  // the server-side schoolId in the WHERE clause — so a tampered ID cannot
  // reach a student from another school.
  const studentId = (formData.get('studentId') as string | null)?.trim()
  if (!studentId) return { errors: { _form: ['Identifiant élève manquant.'] } }

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const parsed = StudentSchema.safeParse({
    first_name:       formData.get('first_name'),
    last_name:        formData.get('last_name'),
    admission_number: formData.get('admission_number'),
    gender:           formData.get('gender'),
    date_of_birth:    formData.get('date_of_birth'),
    status:           formData.get('status'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as UpdateStudentState['errors'],
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  // Both id and school_id must match — prevents cross-school writes.
  // RLS on the students table provides a second isolation layer.
  const { error: updateError } = await supabase
    .from('students')
    .update({
      first_name:       parsed.data.first_name,
      last_name:        parsed.data.last_name,
      admission_number: parsed.data.admission_number,
      gender:           parsed.data.gender        ?? null,
      date_of_birth:    parsed.data.date_of_birth ?? null,
      status:           parsed.data.status,
    })
    .eq('id', studentId)
    .eq('school_id', schoolId)

  if (updateError) {
    return {
      errors: formatServerActionError(updateError, {
        action: 'updateStudent',
        schoolId,
        userId: user.id,
        entityIds: { studentId, admission_number: parsed.data.admission_number },
        constraints: STUDENT_CONSTRAINTS,
        fallback: 'Une erreur est survenue lors de la mise à jour. Veuillez réessayer.',
      }) as UpdateStudentState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'student_updated', resourceType: 'student', resourceId: studentId,
    metadata: { admission_number: parsed.data.admission_number, status: parsed.data.status },
  })

  redirect(`/school/students/${studentId}`)
}
