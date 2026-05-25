'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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
    console.error('[createAttendanceSession] session insert error:', sessionError?.message)
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
    console.error('[createAttendanceSession] records insert error:', recordsError.message)
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

  redirect(`/school/attendance/${session.id}`)
}
