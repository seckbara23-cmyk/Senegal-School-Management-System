// Exam result publication state (server-only).
//
// A publication row scopes to either a whole exam session (class_id === null)
// or a single class (class_id set). status drives portal visibility. This
// module centralises fetching those rows and deriving a convenient state shape
// for both the school-admin UI and the portal visibility checks.

import type { createClient as createServerClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createServerClient>

export type PublicationStatus = 'draft' | 'published' | 'unpublished'

export type PublicationRow = {
  id:           string
  class_id:     string | null
  status:       PublicationStatus
  published_at: string | null
}

export type PublicationState = {
  rows:              PublicationRow[]
  sessionRow:        PublicationRow | null
  sessionPublished:  boolean
  publishedClassIds: Set<string>
  byClass:           Map<string, PublicationRow>
}

// Fetch every publication row for a session (school-scoped). For school_admin
// this returns all rows (draft/published/unpublished) via the manage policy.
export async function fetchExamPublications(
  client: Client,
  schoolId: string,
  sessionId: string,
): Promise<PublicationRow[]> {
  const { data } = await client
    .from('exam_result_publications')
    .select('id, class_id, status, published_at')
    .eq('school_id', schoolId)
    .eq('exam_session_id', sessionId)

  return (data ?? []) as PublicationRow[]
}

export function derivePublicationState(rows: PublicationRow[]): PublicationState {
  const sessionRow = rows.find((r) => r.class_id === null) ?? null
  const publishedClassIds = new Set<string>()
  const byClass = new Map<string, PublicationRow>()

  for (const r of rows) {
    if (r.class_id === null) continue
    byClass.set(r.class_id, r)
    if (r.status === 'published') publishedClassIds.add(r.class_id)
  }

  return {
    rows,
    sessionRow,
    sessionPublished: sessionRow?.status === 'published',
    publishedClassIds,
    byClass,
  }
}

// Convenience: load + derive in one call.
export async function getPublicationState(
  client: Client,
  schoolId: string,
  sessionId: string,
): Promise<PublicationState> {
  return derivePublicationState(await fetchExamPublications(client, schoolId, sessionId))
}

// Is a given class's exam result visible to its students/parents? True when the
// whole session is published OR that specific class is published. Pass the set
// of class ids the viewer belongs to.
export function isResultVisibleForClasses(
  state: PublicationState,
  classIds: string[],
): boolean {
  if (state.sessionPublished) return true
  return classIds.some((id) => state.publishedClassIds.has(id))
}
