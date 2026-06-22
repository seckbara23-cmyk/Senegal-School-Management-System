import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readAdmissionSession } from '@/lib/admissions-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

export async function POST() {
  const session = readAdmissionSession()
  if (!session) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: appRaw } = await admin
    .from('admission_applications')
    .select('id, school_id, status, public_token, reference_code, first_name, last_name, schools!school_id(admissions_slug)')
    .eq('id', session.id).maybeSingle()
  const app = appRaw as unknown as { id: string; school_id: string; status: string; public_token: string; reference_code: string | null; first_name: string; last_name: string; schools: { admissions_slug: string | null } | null } | null
  if (!app || app.public_token !== session.token) return NextResponse.json({ error: 'Candidature introuvable.' }, { status: 403 })
  if (app.status !== 'draft') return NextResponse.json({ error: 'Candidature déjà soumise.' }, { status: 409 })

  const now = new Date().toISOString()
  const { error } = await admin.from('admission_applications').update({ status: 'submitted', submitted_at: now }).eq('id', app.id)
  if (error) return NextResponse.json({ error: 'Échec de la soumission. Réessayez.' }, { status: 500 })

  await admin.from('admission_events').insert({
    school_id: app.school_id, application_id: app.id, type: 'submitted', status_to: 'submitted',
    visibility: 'applicant', message: 'Candidature soumise en ligne', actor_id: null,
  })

  // Notify active school admins (best-effort).
  try {
    const { data: admins } = await admin.from('school_memberships').select('user_id').eq('school_id', app.school_id).eq('role', 'school_admin').eq('status', 'active')
    const recipients = Array.from(new Set(((admins ?? []) as { user_id: string }[]).map((m) => m.user_id)))
    await Promise.all(recipients.map((userId) => createNotification(admin, {
      userId, type: 'admission_received', title: 'Nouvelle candidature en ligne',
      body: `${app.first_name} ${app.last_name} a soumis une candidature (${app.reference_code ?? ''}).`,
      schoolId: app.school_id, metadata: { application_id: app.id },
    })))
  } catch { /* non-blocking */ }

  const slug = app.schools?.admissions_slug ?? ''
  const jar = cookies()
  jar.set('admission', '', { httpOnly: true, path: '/', maxAge: 0 })
  jar.set('admission_done', `${app.reference_code ?? ''}.${app.public_token}`, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 })

  return NextResponse.json({ ok: true, redirect: `/apply/${slug}/submitted` })
}
