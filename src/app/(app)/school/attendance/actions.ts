'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
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
  // Default to absent when no valid status submitted for a student.
  return 'absent'
}

// ─── State type ───────────────────────────────────────────────────────────────

export type CreateAttendanceState = {
  errors?: {
    class_id?:     string[]
    session_date?: string[]
    notes?:        string[]
    _form?:        string[]
  }
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function createAttendanceSession(
  _prevState: CreateAttendanceState,
  formData: FormData
): Promise<CreateAttendanceState> {
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  // ── Validate inputs ────────────────────────────────────────────────────────
  const parsed = AttendanceSessionSchema.safeParse({
    class_id:     formData.get('class_id'),
    session_date: formData.get('session_date'),
    notes:        formData.get('notes'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as CreateAttendanceState['errors'],
    }
  }

  const { class_id, session_date, notes } = parsed.data

  // ── Verify class belongs to this school ────────────────────────────────────
  const { data: cls } = await supabase
    .from('classes')
    .select('id, academic_year_id')
    .eq('id', class_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!cls) return { errors: { class_id: ['Classe introuvable.'] } }

  // ── Fetch enrolled students (server-side, never from form) ─────────────────
  // Re-querying here ensures we only record attendance for students who are
  // genuinely enrolled at the time of submission, ignoring any form tampering.
  const { data: enrollments } = await supabase
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', class_id)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const enrolledIds = (enrollments ?? []).map(
    (e) => (e as { student_id: string }).student_id
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

  // ── Insert attendance session ──────────────────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from('attendance_sessions')
    .insert({
      school_id:        schoolId,
      class_id:         class_id,
      academic_year_id: cls.academic_year_id as string,
      session_date:     session_date,
      notes:            notes ?? null,
      created_by:       user.id,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    if (sessionError?.code === '23505') {
      logSupabaseError(sessionError, { action: 'createAttendanceSession', schoolId, userId: user.id, entityIds: { class_id, session_date } })
      return {
        errors: {
          _form: [
            'Une séance de présence existe déjà pour cette classe à cette date.',
          ],
        },
      }
    }
    return {
      errors: formatServerActionError(sessionError, {
        action: 'createAttendanceSession',
        schoolId,
        userId: user.id,
        entityIds: { class_id, session_date },
        fallback: 'Erreur lors de la création de la séance. Veuillez réessayer.',
      }) as CreateAttendanceState['errors'],
    }
  }

  // ── Insert attendance records ──────────────────────────────────────────────
  // Status for each student is read from the form by student ID.
  // Only enrolled student IDs (from DB) are processed — form field names are
  // constructed server-side, so no tampering can inject foreign student IDs.
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
    logSupabaseError(recordsError, {
      action: 'createAttendanceSession:records',
      schoolId,
      userId: user.id,
      entityIds: { sessionId: session.id, recordCount: records.length },
    })
    // Best-effort cleanup: delete the orphaned session so the UNIQUE constraint
    // doesn't block a retry on the same class+date.
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
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'admin_attendance_session_created', resourceType: 'attendance_session', resourceId: session.id as string,
    metadata: { class_id, session_date },
  })
  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'admin_attendance_records_saved', resourceType: 'attendance_session', resourceId: session.id as string,
    metadata: { class_id, session_id: session.id, changed_count: records.length },
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

  redirect(`/school/attendance/${session.id}`)
}
