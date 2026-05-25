'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// ─── Schema ───────────────────────────────────────────────────────────────────

const AUDIENCE_TYPES = ['all_school', 'parents', 'students', 'staff', 'class'] as const
type AudienceType = typeof AUDIENCE_TYPES[number]

const AnnouncementSchema = z.object({
  title:         z.string().min(1, 'Titre requis.').max(200, 'Titre trop long (200 car. max).'),
  body:          z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(2000, 'Texte trop long (2000 car. max.).').optional()),
  audience_type: z.enum(AUDIENCE_TYPES),
  class_id:      z.preprocess((v) => (v === '' ? undefined : v),
    z.string().uuid('Classe invalide.').optional()),
})

// ─── State type ───────────────────────────────────────────────────────────────

export type CreateAnnouncementState = {
  errors?: {
    title?:         string[]
    body?:          string[]
    audience_type?: string[]
    class_id?:      string[]
    _form?:         string[]
  }
}

// ─── Guard helper ─────────────────────────────────────────────────────────────

async function getSchoolId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', userId)
    .eq('role', 'school_admin')
    .eq('status', 'active')
  return (data?.[0]?.school_id as string) ?? null
}

// ─── Notification dispatch ─────────────────────────────────────────────────────
// Fetches profile/user IDs for the given audience and calls create_notification()
// for each one. Dispatch errors are non-fatal — the announcement is already saved.

async function dispatchNotifications(
  supabase: ReturnType<typeof createClient>,
  {
    schoolId,
    announcementId,
    title,
    body,
    audienceType,
    classId,
  }: {
    schoolId:       string
    announcementId: string
    title:          string
    body:           string | undefined
    audienceType:   AudienceType
    classId:        string | undefined
  }
): Promise<void> {
  let userIds: string[] = []

  try {
    if (audienceType === 'all_school') {
      const { data } = await supabase
        .from('school_memberships')
        .select('user_id')
        .eq('school_id', schoolId)
      userIds = (data ?? []).map((r) => r.user_id as string)
    } else if (audienceType === 'staff') {
      const { data } = await supabase
        .from('school_memberships')
        .select('user_id')
        .eq('school_id', schoolId)
        .in('role', ['school_admin', 'teacher', 'finance_officer'])
      userIds = (data ?? []).map((r) => r.user_id as string)
    } else if (audienceType === 'parents') {
      const { data } = await supabase
        .from('parents')
        .select('profile_id')
        .eq('school_id', schoolId)
        .not('profile_id', 'is', null)
      userIds = (data ?? [])
        .map((r) => (r as { profile_id: string | null }).profile_id)
        .filter(Boolean) as string[]
    } else if (audienceType === 'students') {
      const { data } = await supabase
        .from('students')
        .select('profile_id')
        .eq('school_id', schoolId)
        .not('profile_id', 'is', null)
      userIds = (data ?? [])
        .map((r) => (r as { profile_id: string | null }).profile_id)
        .filter(Boolean) as string[]
    } else if (audienceType === 'class' && classId) {
      // Students enrolled in this class with a profile
      const { data: enrollments } = await supabase
        .from('student_class_enrollments')
        .select('student_id, students!student_id(id, profile_id)')
        .eq('class_id', classId)
        .eq('school_id', schoolId)
        .eq('status', 'active')

      type EnrollRow = { student_id: string; students: { id: string; profile_id: string | null } }
      const rows = (enrollments ?? []) as unknown as EnrollRow[]
      const enrolledStudentIds = rows.map((r) => r.student_id)
      const studentProfileIds = rows
        .map((r) => r.students.profile_id)
        .filter(Boolean) as string[]

      // Parents of those students with a profile
      let parentProfileIds: string[] = []
      if (enrolledStudentIds.length > 0) {
        const { data: links } = await supabase
          .from('parent_student_links')
          .select('parents!parent_id(profile_id)')
          .eq('school_id', schoolId)
          .in('student_id', enrolledStudentIds)

        type LinkRow = { parents: { profile_id: string | null } }
        parentProfileIds = ((links ?? []) as unknown as LinkRow[])
          .map((l) => l.parents.profile_id)
          .filter(Boolean) as string[]
      }

      userIds = Array.from(new Set([...studentProfileIds, ...parentProfileIds]))
    }

    if (userIds.length === 0) return

    const metadata = { announcement_id: announcementId, audience_type: audienceType }

    await Promise.all(
      userIds.map((uid) =>
        supabase.rpc('create_notification', {
          p_user_id:   uid,
          p_title:     title,
          p_body:      body ?? null,
          p_type:      'info',
          p_school_id: schoolId,
          p_metadata:  metadata,
        })
      )
    )
  } catch (err) {
    // Dispatch failure is logged but does not block the announcement
    console.error('[dispatchNotifications] error:', err)
  }
}

// ─── createAnnouncement ───────────────────────────────────────────────────────

export async function createAnnouncement(
  _prevState: CreateAnnouncementState,
  formData: FormData
): Promise<CreateAnnouncementState> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = AnnouncementSchema.safeParse({
    title:         formData.get('title'),
    body:          formData.get('body'),
    audience_type: formData.get('audience_type'),
    class_id:      formData.get('class_id'),
  })

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as CreateAnnouncementState['errors'],
    }
  }

  const { title, body, audience_type, class_id } = parsed.data

  // When audience is "class", class_id is required and must belong to this school
  if (audience_type === 'class') {
    if (!class_id) {
      return { errors: { class_id: ['Sélectionnez une classe.'] } }
    }
    const { data: cls } = await supabase
      .from('classes')
      .select('id')
      .eq('id', class_id)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!cls) {
      return { errors: { class_id: ['Classe introuvable.'] } }
    }
  }

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      school_id:     schoolId,
      title,
      body:          body ?? null,
      audience_type,
      class_id:      audience_type === 'class' ? (class_id ?? null) : null,
      created_by:    user.id,
    })
    .select('id')
    .single()

  if (error || !announcement) {
    console.error('[createAnnouncement] insert error:', error?.message)
    return {
      errors: { _form: ["Erreur lors de la publication de l'annonce. Veuillez réessayer."] },
    }
  }

  // Fan-out notifications (non-blocking)
  await dispatchNotifications(supabase, {
    schoolId,
    announcementId: announcement.id as string,
    title,
    body,
    audienceType:   audience_type,
    classId:        class_id,
  })

  redirect(`/school/announcements`)
}
