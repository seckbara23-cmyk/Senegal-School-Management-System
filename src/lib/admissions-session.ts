// ─── Public admission session (server-only) ──────────────────────────────────
//
// The family's draft is identified by an httpOnly cookie `admission = "{id}.{token}"`
// set on /api/admissions/start. We always re-verify the token against the row via
// the service-role client (admissions RLS is admin-only), so a tampered cookie
// can't reach another application.

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export function readAdmissionSession(): { id: string; token: string } | null {
  const raw = cookies().get('admission')?.value
  if (!raw) return null
  const i = raw.indexOf('.')
  if (i <= 0) return null
  return { id: raw.slice(0, i), token: raw.slice(i + 1) }
}

export type DraftApp = {
  id: string; school_id: string; status: string; public_token: string; reference_code: string | null
  first_name: string; last_name: string; gender: string | null; date_of_birth: string | null
  desired_class_id: string | null; desired_level: string | null; previous_school: string | null
  guardian_name: string | null; guardian_phone: string | null; guardian_email: string | null
  guardian_relationship: string | null; guardian_address: string | null
  schools: { name: string; admissions_slug: string | null } | null
}

const SELECT = 'id, school_id, status, public_token, reference_code, first_name, last_name, gender, date_of_birth, desired_class_id, desired_level, previous_school, guardian_name, guardian_phone, guardian_email, guardian_relationship, guardian_address, schools!school_id(name, admissions_slug)'

// Loads the cookie-identified draft (token-verified). Returns the row + an admin
// client for follow-up reads, or null if no valid session.
export async function loadActiveDraft(expectedSlug?: string): Promise<{ app: DraftApp; admin: ReturnType<typeof createAdminClient> } | null> {
  const s = readAdmissionSession()
  if (!s) return null
  const admin = createAdminClient()
  const { data } = await admin.from('admission_applications').select(SELECT).eq('id', s.id).maybeSingle()
  if (!data) return null
  const app = data as unknown as DraftApp
  if (app.public_token !== s.token) return null
  if (expectedSlug && app.schools?.admissions_slug !== expectedSlug) return null
  return { app, admin }
}
