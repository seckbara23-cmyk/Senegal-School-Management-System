'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { dispatch } from '@/lib/comms/dispatch'
import type { ExternalChannel, RecipientContact } from '@/lib/comms/types'

const empty = (v: unknown) => (v === '' || v == null ? undefined : v)

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase.from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  return { supabase, schoolId: (m as { school_id: string }).school_id, actor: user }
}

export type BroadcastState = { error?: string }

const Schema = z.object({
  audience: z.enum(['parents', 'teachers', 'all']),
  subject:  z.preprocess(empty, z.string().max(300).optional()),
  body:     z.string().trim().min(1, 'Le message est obligatoire.').max(4000),
})

const ROLES: Record<string, string[]> = { parents: ['parent'], teachers: ['teacher'], all: ['parent', 'teacher', 'student'] }

export async function sendBroadcast(_prev: BroadcastState, formData: FormData): Promise<BroadcastState> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = Schema.safeParse({ audience: formData.get('audience'), subject: formData.get('subject'), body: formData.get('body') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const { audience, subject, body } = parsed.data
  const channels = formData.getAll('channels').map(String).filter((c): c is ExternalChannel => ['email', 'sms', 'whatsapp'].includes(c))

  const { data: members } = await supabase.from('school_memberships').select('user_id').eq('school_id', schoolId).eq('status', 'active').in('role', ROLES[audience])
  const userIds = Array.from(new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id)))
  if (userIds.length === 0) return { error: 'Aucun destinataire pour cette audience.' }

  const [{ data: profs }, { data: tch }, { data: par }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').in('id', userIds),
    supabase.from('teachers').select('profile_id, phone').eq('school_id', schoolId).in('profile_id', userIds),
    supabase.from('parents').select('profile_id, phone').eq('school_id', schoolId).in('profile_id', userIds),
  ])
  const profMap = new Map(((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p]))
  const phoneMap = new Map<string, string>()
  for (const r of [...((tch ?? []) as { profile_id: string | null; phone: string | null }[]), ...((par ?? []) as { profile_id: string | null; phone: string | null }[])]) {
    if (r.profile_id && r.phone) phoneMap.set(r.profile_id, r.phone)
  }

  const recipients: RecipientContact[] = userIds.map((id) => {
    const p = profMap.get(id)
    return { userId: id, email: p?.email ?? null, phone: phoneMap.get(id) ?? null, name: p?.full_name ?? '' }
  })

  await dispatch({
    schoolId, category: 'announcements', templateKey: 'broadcast', recipients, vars: {}, channels,
    content: { subject: subject ?? null, body },
    inApp: { type: 'announcement_published', title: subject?.trim() || 'Annonce de l’école', body },
    related: { type: 'communication', id: schoolId }, actorId: actor.id,
  })

  await logAuditEvent(supabase, { actorId: actor.id, actorEmail: actor.email, schoolId, action: 'comms_broadcast_sent', resourceType: 'communication', resourceId: schoolId, metadata: { audience, channels, recipients: recipients.length } })
  redirect(`/school/communications/broadcast?sent=${recipients.length}`)
}
