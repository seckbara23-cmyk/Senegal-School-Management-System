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

export type TicketState = { error?: string }

const CreateSchema = z.object({
  school_id: z.string().uuid('École invalide.'),
  subject:   z.string().trim().min(1, 'Sujet requis.').max(200),
  body:      z.preprocess(empty, z.string().max(4000).optional()),
  category:  z.preprocess(empty, z.string().max(100).optional()),
  priority:  z.enum(['low', 'normal', 'high', 'urgent']),
})

export async function createTicket(_prev: TicketState, formData: FormData): Promise<TicketState> {
  const { user, admin } = await guard()
  const parsed = CreateSchema.safeParse({
    school_id: formData.get('school_id'), subject: formData.get('subject'), body: formData.get('body'), category: formData.get('category'), priority: formData.get('priority'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const d = parsed.data

  const { data: school } = await admin.from('schools').select('id').eq('id', d.school_id).maybeSingle()
  if (!school) return { error: 'École introuvable.' }

  const { data: ticket, error } = await admin.from('support_tickets').insert({
    school_id: d.school_id, subject: d.subject, body: d.body ?? null, category: d.category ?? null, priority: d.priority, status: 'open', created_by: user.id,
  }).select('id').single()
  if (error || !ticket) return { error: 'Erreur lors de la création du ticket.' }
  const ticketId = (ticket as { id: string }).id

  await admin.from('support_ticket_events').insert({ ticket_id: ticketId, school_id: d.school_id, type: 'created', message: d.subject, actor_id: user.id })
  await logAuditEvent(admin, { actorId: user.id, actorEmail: user.email, schoolId: d.school_id, action: 'support_ticket_created', resourceType: 'support_ticket', resourceId: ticketId, metadata: { priority: d.priority } })
  redirect(`/super-admin/support/${ticketId}`)
}

export async function setTicketStatus(formData: FormData): Promise<void> {
  const { user, admin } = await guard()
  const id = z.string().uuid().safeParse(formData.get('ticket_id'))
  const status = z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).safeParse(formData.get('status'))
  if (!id.success || !status.success) redirect('/super-admin/support')

  const { data: t } = await admin.from('support_tickets').select('id, status, school_id').eq('id', id.data).maybeSingle()
  const ticket = t as { id: string; status: string; school_id: string } | null
  if (!ticket) redirect('/super-admin/support')

  const resolved = status.data === 'resolved' || status.data === 'closed'
  await admin.from('support_tickets').update({ status: status.data, resolved_at: resolved ? new Date().toISOString() : null }).eq('id', ticket.id)
  await admin.from('support_ticket_events').insert({ ticket_id: ticket.id, school_id: ticket.school_id, type: 'status_change', status_from: ticket.status, status_to: status.data, actor_id: user.id })
  await logAuditEvent(admin, { actorId: user.id, actorEmail: user.email, schoolId: ticket.school_id, action: 'support_ticket_updated', resourceType: 'support_ticket', resourceId: ticket.id, metadata: { status: status.data } })
  redirect(`/super-admin/support/${ticket.id}`)
}

export async function addTicketNote(formData: FormData): Promise<void> {
  const { user, admin } = await guard()
  const id = z.string().uuid().safeParse(formData.get('ticket_id'))
  const message = z.string().trim().min(1).max(4000).safeParse(formData.get('message'))
  if (!id.success || !message.success) redirect('/super-admin/support')

  const { data: t } = await admin.from('support_tickets').select('id, school_id').eq('id', id.data).maybeSingle()
  const ticket = t as { id: string; school_id: string } | null
  if (!ticket) redirect('/super-admin/support')

  await admin.from('support_ticket_events').insert({ ticket_id: ticket.id, school_id: ticket.school_id, type: 'note', message: message.data, actor_id: user.id })
  await logAuditEvent(admin, { actorId: user.id, actorEmail: user.email, schoolId: ticket.school_id, action: 'support_ticket_note_added', resourceType: 'support_ticket', resourceId: ticket.id })
  redirect(`/super-admin/support/${ticket.id}`)
}
