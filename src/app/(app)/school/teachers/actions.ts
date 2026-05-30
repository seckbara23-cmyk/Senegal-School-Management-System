'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { z }            from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'

// Unique-constraint name → friendly field message (see migration 002).
const TEACHER_CONSTRAINTS = {
  teachers_school_employee_unique: {
    field: 'employee_number',
    message: 'Ce matricule est déjà utilisé dans cet établissement.',
  },
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const TeacherSchema = z.object({
  first_name:      z.string().min(1, 'Prénom requis.').max(100),
  last_name:       z.string().min(1, 'Nom requis.').max(100),
  employee_number: z.string().min(1, 'Matricule requis.').max(50),
  phone: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().max(30, 'Numéro trop long.').optional()
  ),
  email: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().email('Adresse email invalide.').max(200).optional()
  ),
})

// ─── State type (shared by create and update) ─────────────────────────────────

export type TeacherFormState = {
  errors?: {
    first_name?:      string[]
    last_name?:       string[]
    employee_number?: string[]
    phone?:           string[]
    email?:           string[]
    _form?:           string[]
  }
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

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

// ─── createTeacher ────────────────────────────────────────────────────────────

export async function createTeacher(
  _prevState: TeacherFormState,
  formData: FormData,
): Promise<TeacherFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const parsed = TeacherSchema.safeParse({
    first_name:      formData.get('first_name'),
    last_name:       formData.get('last_name'),
    employee_number: formData.get('employee_number'),
    phone:           formData.get('phone'),
    email:           formData.get('email'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as TeacherFormState['errors'] }
  }

  const { data: teacher, error } = await supabase
    .from('teachers')
    .insert({
      school_id:       schoolId,
      first_name:      parsed.data.first_name,
      last_name:       parsed.data.last_name,
      employee_number: parsed.data.employee_number,
      phone:           parsed.data.phone  ?? null,
      email:           parsed.data.email  ?? null,
      status:          'active',
    })
    .select('id')
    .single()

  if (error || !teacher) {
    return {
      errors: formatServerActionError(error, {
        action: 'createTeacher',
        schoolId,
        entityIds: { employee_number: parsed.data.employee_number },
        constraints: TEACHER_CONSTRAINTS,
        fallback: 'Erreur lors de la création. Veuillez réessayer.',
      }) as TeacherFormState['errors'],
    }
  }

  const teacherId = (teacher as { id: string }).id
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_created', resourceType: 'teacher', resourceId: teacherId,
    metadata: { employee_number: parsed.data.employee_number, first_name: parsed.data.first_name, last_name: parsed.data.last_name },
  })

  redirect(`/school/teachers/${teacherId}`)
}

// ─── updateTeacher ────────────────────────────────────────────────────────────

export async function updateTeacher(
  _prevState: TeacherFormState,
  formData: FormData,
): Promise<TeacherFormState> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const teacherId = z.string().uuid().safeParse(formData.get('teacher_id'))
  if (!teacherId.success) {
    return { errors: { _form: ['Identifiant enseignant invalide.'] } }
  }

  const parsed = TeacherSchema.safeParse({
    first_name:      formData.get('first_name'),
    last_name:       formData.get('last_name'),
    employee_number: formData.get('employee_number'),
    phone:           formData.get('phone'),
    email:           formData.get('email'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as TeacherFormState['errors'] }
  }

  const { error } = await supabase
    .from('teachers')
    .update({
      first_name:      parsed.data.first_name,
      last_name:       parsed.data.last_name,
      employee_number: parsed.data.employee_number,
      phone:           parsed.data.phone  ?? null,
      email:           parsed.data.email  ?? null,
    })
    .eq('id', teacherId.data)
    .eq('school_id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'updateTeacher',
        schoolId,
        entityIds: { teacherId: teacherId.data, employee_number: parsed.data.employee_number },
        constraints: TEACHER_CONSTRAINTS,
        fallback: 'Erreur lors de la mise à jour. Veuillez réessayer.',
      }) as TeacherFormState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_updated', resourceType: 'teacher', resourceId: teacherId.data,
    metadata: { employee_number: parsed.data.employee_number },
  })

  redirect(`/school/teachers/${teacherId.data}`)
}

// ─── setTeacherStatus ─────────────────────────────────────────────────────────

export async function setTeacherStatus(formData: FormData) {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const teacherId = z.string().uuid().safeParse(formData.get('teacher_id'))
  const newStatus = z.enum(['active', 'inactive']).safeParse(formData.get('new_status'))
  if (!teacherId.success || !newStatus.success) redirect('/school/teachers')

  // Capture the previous status for the audit trail.
  const { data: before } = await supabase
    .from('teachers')
    .select('status')
    .eq('id', teacherId.data)
    .eq('school_id', schoolId)
    .maybeSingle()
  const oldStatus = (before as { status: string } | null)?.status ?? null

  const { error } = await supabase
    .from('teachers')
    .update({ status: newStatus.data })
    .eq('id', teacherId.data)
    .eq('school_id', schoolId)

  if (error) {
    logSupabaseError(error, { action: 'setTeacherStatus', schoolId, entityIds: { teacherId: teacherId.data, newStatus: newStatus.data } })
    redirect(`/school/teachers/${teacherId.data}?error=status`)
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_status_changed', resourceType: 'teacher', resourceId: teacherId.data,
    metadata: { old_status: oldStatus, new_status: newStatus.data },
  })

  redirect(`/school/teachers/${teacherId.data}`)
}
