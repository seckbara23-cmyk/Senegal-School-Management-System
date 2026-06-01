'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { notifyAttendanceRecorded } from '@/lib/notification-events'

// ─── Schema ───────────────────────────────────────────────────────────────────

const AttendanceSessionSchema = z.object({
  class_id: z
    .string()
    .uuid('Veuillez sélectionner une classe valide.'),
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (AAAA-MM-JJ).'),
  notes: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().max(500, 'Notes trop longues (500 caractères max.).').optional()
  ),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitiseStatus(
  value: FormDataEntryValue | null
): 'present' | 'absent' | 'late' | 'excused' {
  if (
    value === 'present' ||
    value === 'absent' ||
    value === 'late' ||
    value === 'excused'
  ) {
    return value
  }
  return 'absent'
}

async function resolveTeacher() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'teacher')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) return null
  const schoolId = (membership as { school_id: string }).school_id

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('profile_id', user.id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!teacher) return null

  return { supabase, userId: user.id, userEmail: user.email ?? null, schoolId, teacherId: (teacher as { id: string }).id }
}

// ─── State type ───────────────────────────────────────────────────────────────

export type CreateTeacherAttendanceState = {
  errors?: {
    class_id?:     string[]
    session_date?: string[]
    notes?:        string[]
    _form?:        string[]
  }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function createTeacherAttendanceSession(
  _prevState: CreateTeacherAttendanceState,
  formData: FormData
): Promise<CreateTeacherAttendanceState> {
  const ctx = await resolveTeacher()
  if (!ctx) return { errors: { _form: ['Non autorisé.'] } }

  const { supabase, userId, userEmail, schoolId, teacherId } = ctx

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = AttendanceSessionSchema.safeParse({
    class_id:     formData.get('class_id'),
    session_date: formData.get('session_date'),
    notes:        formData.get('notes'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as CreateTeacherAttendanceState['errors'],
    }
  }

  const { class_id, session_date, notes } = parsed.data

  // Verify this teacher is assigned to the chosen class.
  // Fetch class_subjects for the class, then check teacher_subject_assignments.
  const { data: csRows } = await supabase
    .from('class_subjects')
    .select('id')
    .eq('class_id', class_id)
    .eq('school_id', schoolId)

  const csIds = ((csRows ?? []) as { id: string }[]).map((r) => r.id)

  if (csIds.length === 0) {
    return { errors: { class_id: ['Classe introuvable.'] } }
  }

  const { data: tsa } = await supabase
    .from('teacher_subject_assignments')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .in('class_subject_id', csIds)
    .maybeSingle()

  if (!tsa) {
    return { errors: { class_id: ["Vous n'êtes pas assigné à cette classe."] } }
  }

  // Fetch class for academic_year_id
  const { data: cls } = await supabase
    .from('classes')
    .select('id, academic_year_id')
    .eq('id', class_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!cls) return { errors: { class_id: ['Classe introuvable.'] } }

  // Fetch enrolled students server-side — never trust student IDs from form
  const { data: enrollments } = await supabase
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', class_id)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const enrolledIds = ((enrollments ?? []) as { student_id: string }[]).map(
    (e) => e.student_id
  )

  if (enrolledIds.length === 0) {
    return {
      errors: {
        _form: [
          'Aucun élève inscrit dans cette classe. Inscrivez des élèves avant de saisir les présences.',
        ],
      },
    }
  }

  // Insert attendance session
  const { data: session, error: sessionError } = await supabase
    .from('attendance_sessions')
    .insert({
      school_id:        schoolId,
      class_id:         class_id,
      academic_year_id: (cls as { id: string; academic_year_id: string }).academic_year_id,
      session_date:     session_date,
      notes:            notes ?? null,
      created_by:       userId,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    if (sessionError?.code === '23505') {
      return {
        errors: {
          _form: [
            'Une séance de présence existe déjà pour cette classe à cette date.',
          ],
        },
      }
    }
    return {
      errors: { _form: ['Erreur lors de la création de la séance. Veuillez réessayer.'] },
    }
  }

  // Insert attendance records
  const records = enrolledIds.map((studentId) => ({
    school_id:  schoolId,
    session_id: session.id,
    student_id: studentId,
    status:     sanitiseStatus(formData.get(`status_${studentId}`)),
    notes:      null,
  }))

  const { error: recordsError } = await supabase
    .from('attendance_records')
    .insert(records)

  if (recordsError) {
    // Best-effort cleanup — teacher DELETE policy allows this (created_by = user.id)
    await supabase.from('attendance_sessions').delete().eq('id', session.id)
    return {
      errors: {
        _form: [
          "Erreur lors de l'enregistrement des présences. Veuillez réessayer.",
        ],
      },
    }
  }

  await logAuditEvent(supabase, {
    actorId: userId, actorEmail: userEmail, schoolId,
    action: 'teacher_attendance_session_created', resourceType: 'attendance_session', resourceId: session.id as string,
    metadata: { teacher_id: teacherId, class_id, session_date },
  })
  await logAuditEvent(supabase, {
    actorId: userId, actorEmail: userEmail, schoolId,
    action: 'teacher_attendance_records_saved', resourceType: 'attendance_session', resourceId: session.id as string,
    metadata: { teacher_id: teacherId, class_id, session_id: session.id, changed_count: records.length },
  })

  // Best-effort: notify student + parents for non-present statuses only.
  await notifyAttendanceRecorded(supabase, {
    schoolId,
    sessionId: session.id as string,
    classId:   class_id,
    date:      session_date,
    records:   records
      .filter((r) => r.status !== 'present')
      .map((r) => ({ studentId: r.student_id, status: r.status as 'absent' | 'late' | 'excused' })),
  })

  redirect(`/teacher/attendance/${session.id}`)
}
