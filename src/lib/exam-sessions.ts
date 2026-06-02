import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

// Validates an optional exam_session_id for attaching to an assessment.
// Rules (Phase 38.2):
//   - empty → null (allowed; assessment is unattached)
//   - must belong to the same school
//   - must be draft or active (completed/archived are closed)
//   - the session's academic_year_id must match the assessment's class
//     (class_subject → class) academic year
// Returns the resolved id (or null), or a friendly French error message.
export async function validateExamSessionForAssessment(
  client: Client,
  schoolId: string,
  examSessionId: string | null | undefined,
  classAcademicYearId: string,
): Promise<{ ok: true; id: string | null } | { ok: false; message: string }> {
  if (!examSessionId) return { ok: true, id: null }

  const { data } = await client
    .from('exam_sessions')
    .select('id, status, academic_year_id')
    .eq('id', examSessionId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!data) return { ok: false, message: "Session d'examen invalide." }
  const s = data as { id: string; status: string; academic_year_id: string }

  if (s.status === 'completed' || s.status === 'archived') {
    return { ok: false, message: "Cette session d'examen est clôturée." }
  }
  if (s.status !== 'draft' && s.status !== 'active') {
    return { ok: false, message: "Session d'examen invalide." }
  }
  if (s.academic_year_id !== classAcademicYearId) {
    return { ok: false, message: "Session d'examen invalide." }
  }
  return { ok: true, id: s.id }
}
