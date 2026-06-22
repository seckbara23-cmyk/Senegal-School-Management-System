import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { ADMISSION_STATUS_LABEL } from '@/lib/admissions'

const Schema = z.object({
  reference: z.string().trim().min(1).max(40),
  token:     z.string().trim().min(1).max(100),
})

const EVENT_LABEL: Record<string, string> = {
  submitted: 'Candidature soumise', status_change: 'Mise à jour', note: 'Message de l’école',
  documents_requested: 'Pièces demandées', decision: 'Décision', converted: 'Inscription confirmée',
}

export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ found: false }, { status: 400 }) }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ found: false })

  const admin = createAdminClient()
  // Both reference AND token must match — never reveal which is wrong.
  const { data: appRaw } = await admin
    .from('admission_applications')
    .select('id, first_name, status, reference_code, submitted_at')
    .eq('reference_code', parsed.data.reference).eq('public_token', parsed.data.token).maybeSingle()
  const app = appRaw as { id: string; first_name: string; status: string; reference_code: string | null; submitted_at: string | null } | null
  if (!app) return NextResponse.json({ found: false })

  const { data: evData } = await admin
    .from('admission_events').select('type, message, status_to, created_at')
    .eq('application_id', app.id).eq('visibility', 'applicant').order('created_at', { ascending: false })

  const events = ((evData ?? []) as { type: string; message: string | null; status_to: string | null; created_at: string }[]).map((e) => ({
    label: EVENT_LABEL[e.type] ?? e.type,
    message: e.message,
    statusLabel: e.status_to ? (ADMISSION_STATUS_LABEL[e.status_to] ?? e.status_to) : null,
    created_at: e.created_at,
  }))

  return NextResponse.json({
    found: true,
    reference: app.reference_code,
    firstName: app.first_name,
    status: app.status,
    statusLabel: ADMISSION_STATUS_LABEL[app.status] ?? app.status,
    events,
  })
}
