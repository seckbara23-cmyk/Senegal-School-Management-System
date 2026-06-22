'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { z }            from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE, canAddTeacher, logLimitBlocked, TEACHER_LIMIT_REACHED_MESSAGE } from '@/lib/tenant'

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
    .order('created_at', { ascending: true })
    .limit(1)
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
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

  // Subscription quota — new teachers are created active. Checked before insert
  // so no partial record is created. Fails open (see canAddTeacher).
  if (!(await canAddTeacher(supabase, schoolId))) {
    logLimitBlocked('teacher', { schoolId, userId: actor.id })
    return { errors: { _form: [TEACHER_LIMIT_REACHED_MESSAGE] } }
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
        userId: actor.id,
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
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
        userId: actor.id,
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(`/school/teachers/${teacherId.data}?error=readonly`)
  }

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

// ─── Teacher ↔ class-subject assignments (Phase 39.2) ──────────────────────────
//
// A teacher is assigned to a class_subject (class + subject + year) via the
// existing teacher_subject_assignments table (UNIQUE on class_subject_id → one
// teacher per class-subject). These actions power the teacher-centric page at
// /school/teachers/[teacherId]/assignments.

const AssignmentSchema = z.object({
  teacher_id:       z.string().uuid(),
  class_subject_id: z.string().uuid(),
})

function assignmentsPath(teacherId: string, param?: string): string {
  return `/school/teachers/${teacherId}/assignments${param ? `?${param}` : ''}`
}

export async function assignTeacherToClassSubject(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const parsed = AssignmentSchema.safeParse({
    teacher_id:       formData.get('teacher_id'),
    class_subject_id: formData.get('class_subject_id'),
  })
  if (!parsed.success) redirect('/school/teachers')
  const { teacher_id, class_subject_id } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(assignmentsPath(teacher_id, 'error=readonly'))
  }

  // Teacher must belong to this school and be active.
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, status')
    .eq('id', teacher_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!teacher) redirect('/school/teachers')
  if ((teacher as { status: string }).status !== 'active') {
    redirect(assignmentsPath(teacher_id, 'error=inactive'))
  }

  // Class-subject must belong to the same school.
  const { data: cs } = await supabase
    .from('class_subjects')
    .select('id')
    .eq('id', class_subject_id)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!cs) redirect(assignmentsPath(teacher_id, 'error=invalid'))

  const { error } = await supabase
    .from('teacher_subject_assignments')
    .insert({ school_id: schoolId, teacher_id, class_subject_id })

  if (error) {
    // UNIQUE(class_subject_id) → this class-subject already has a teacher.
    if (error.code === '23505') redirect(assignmentsPath(teacher_id, 'error=duplicate'))
    logSupabaseError(error, { action: 'assignTeacherToClassSubject', schoolId, userId: actor.id, entityIds: { teacher_id, class_subject_id } })
    redirect(assignmentsPath(teacher_id, 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_assignment_created', resourceType: 'class_subject', resourceId: class_subject_id,
    metadata: { teacher_id, class_subject_id },
  })

  redirect(assignmentsPath(teacher_id, 'created=1'))
}

export async function removeTeacherAssignment(formData: FormData): Promise<void> {
  const { supabase, schoolId, actor } = await resolveSchoolAdmin()

  const parsed = AssignmentSchema.safeParse({
    teacher_id:       formData.get('teacher_id'),
    class_subject_id: formData.get('class_subject_id'),
  })
  if (!parsed.success) redirect('/school/teachers')
  const { teacher_id, class_subject_id } = parsed.data

  if (!(await isSchoolWritable(supabase, schoolId))) {
    redirect(assignmentsPath(teacher_id, 'error=readonly'))
  }

  // Scope the delete by school + teacher + class_subject — a tampered id cannot
  // remove another school's or another teacher's assignment.
  const { error } = await supabase
    .from('teacher_subject_assignments')
    .delete()
    .eq('school_id', schoolId)
    .eq('teacher_id', teacher_id)
    .eq('class_subject_id', class_subject_id)

  if (error) {
    logSupabaseError(error, { action: 'removeTeacherAssignment', schoolId, userId: actor.id, entityIds: { teacher_id, class_subject_id } })
    redirect(assignmentsPath(teacher_id, 'error=server'))
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'teacher_assignment_removed', resourceType: 'class_subject', resourceId: class_subject_id,
    metadata: { teacher_id, class_subject_id },
  })

  redirect(assignmentsPath(teacher_id, 'removed=1'))
}
