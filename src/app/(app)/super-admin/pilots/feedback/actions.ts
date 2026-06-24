'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'

const empty = (v: unknown) => (v === '' || v == null ? undefined : v)

async function guard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('global_role').eq('id', user.id).single()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')
  return { user, admin: createAdminClient() }
}

export type FeedbackState = { error?: string }

export const FEEDBACK_TYPES = ['bug', 'usability', 'feature', 'praise'] as const

// Feedback rides on the support-ticket CRM via a category convention so it reuses
// the existing timeline, status workflow and detail view — no new table.
const Schema = z.object({
  school_id: z.string().uuid('École invalide.'),
  type:      z.enum(FEEDBACK_TYPES),
  subject:   z.string().trim().min(1, 'Résumé requis.').max(200),
  body:      z.preprocess(empty, z.string().max(4000).optional()),
  priority:  z.enum(['low', 'normal', 'high', 'urgent']),
})

export async function createPilotFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const { user, admin } = await guard()
  const parsed = Schema.safeParse({
    school_id: formData.get('school_id'), type: formData.get('type'), subject: formData.get('subject'), body: formData.get('body'), priority: formData.get('priority'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const d = parsed.data

  const { data: school } = await admin.from('schools').select('id').eq('id', d.school_id).maybeSingle()
  if (!school) return { error: 'École introuvable.' }

  const category = `feedback_${d.type}`
  const { data: ticket, error } = await admin.from('support_tickets').insert({
    school_id: d.school_id, subject: d.subject, body: d.body ?? null, category, priority: d.priority, status: 'open', created_by: user.id,
  }).select('id').single()
  if (error || !ticket) return { error: 'Erreur lors de l’enregistrement du retour.' }
  const ticketId = (ticket as { id: string }).id

  await admin.from('support_ticket_events').insert({ ticket_id: ticketId, school_id: d.school_id, type: 'created', message: d.subject, actor_id: user.id })
  await logAuditEvent(admin, { actorId: user.id, actorEmail: user.email, schoolId: d.school_id, action: 'support_ticket_created', resourceType: 'support_ticket', resourceId: ticketId, metadata: { feedback: true, type: d.type } })
  redirect('/super-admin/pilots/feedback?created=1')
}
