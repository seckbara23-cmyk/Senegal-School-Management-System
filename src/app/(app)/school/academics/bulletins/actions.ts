'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { COMMENT_TEMPLATE_VERSION } from '@/lib/academic/bulletin-comments'

export type CommentState = { errors?: { _form?: string[] }; ok?: boolean }

async function resolveAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!m) redirect('/school')
  return { supabase, schoolId: (m as { school_id: string }).school_id, actor: user }
}

const Schema = z.object({
  student_id:     z.string().uuid(),
  period_id:      z.string().uuid(),
  locale:         z.enum(['fr', 'wo', 'en']).default('fr'),
  generated_text: z.preprocess((v) => (v == null ? '' : v), z.string().max(4000)),
  approved_text:  z.string().min(1, 'Le commentaire ne peut pas être vide.').max(4000),
})

// Approve (save) a reviewed comment. The suggestion is generated client-side from
// real metrics; this persists both the suggestion (generated_text) and the final
// reviewed text (approved_text) — separately — with provenance, then audits both
// the generation and the approval. Nothing is written until the teacher accepts.
export async function approveBulletinComment(_prev: CommentState, formData: FormData): Promise<CommentState> {
  const { supabase, schoolId, actor } = await resolveAdmin()
  if (!(await isSchoolWritable(supabase, schoolId))) return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }

  const parsed = Schema.safeParse({
    student_id:     formData.get('student_id'),
    period_id:      formData.get('period_id'),
    locale:         formData.get('locale') ?? 'fr',
    generated_text: formData.get('generated_text'),
    approved_text:  formData.get('approved_text'),
  })
  if (!parsed.success) return { errors: { _form: [parsed.error.flatten().fieldErrors.approved_text?.[0] ?? 'Données invalides.'] } }
  const d = parsed.data

  // Student + period must belong to this school.
  const [{ data: student }, { data: period }] = await Promise.all([
    supabase.from('students').select('id').eq('id', d.student_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('academic_periods').select('id').eq('id', d.period_id).eq('school_id', schoolId).maybeSingle(),
  ])
  if (!student || !period) return { errors: { _form: ['Élève ou période introuvable.'] } }

  const now = new Date().toISOString()
  const { error } = await supabase.from('bulletin_comments').upsert({
    school_id: schoolId, student_id: d.student_id, academic_period_id: d.period_id, locale: d.locale,
    template_version: COMMENT_TEMPLATE_VERSION,
    generated_text: d.generated_text || d.approved_text,
    generated_at: now,
    approved_text: d.approved_text,
    approved_at: now,
    approved_by: actor.id,
  }, { onConflict: 'student_id,academic_period_id,locale' })

  if (error) {
    logSupabaseError(error, { action: 'approveBulletinComment', schoolId, userId: actor.id, entityIds: { student_id: d.student_id, period_id: d.period_id } })
    return { errors: { _form: ["Erreur lors de l'enregistrement de l'appréciation. Veuillez réessayer."] } }
  }

  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'comment_generated', resourceType: 'student', resourceId: d.student_id,
    metadata: { period_id: d.period_id, locale: d.locale, template_version: COMMENT_TEMPLATE_VERSION },
  })
  await logAuditEvent(supabase, {
    actorId: actor.id, actorEmail: actor.email, schoolId,
    action: 'comment_approved', resourceType: 'student', resourceId: d.student_id,
    metadata: { period_id: d.period_id, locale: d.locale, length: d.approved_text.length },
  })

  redirect(`/school/academics/bulletins/${d.student_id}?period_id=${d.period_id}&comment_ok=1`)
}
