// ─── Notification foundation (Phase 36.1) ───────────────────────────────────
//
// Shared, client-safe notification utilities: the supported event types, their
// French labels and badge colours, a relative-time formatter, a reusable
// createNotification() write helper, and a getNotificationSummary() reader for
// the header bell. Importing this module from a client component is safe — the
// only server-coupled import (the server client type) is type-only and erased
// at build time.

import type { createClient as createServerClient } from '@/lib/supabase/server'

// ── Event types ──────────────────────────────────────────────────────────────
// The semantic notification types Phase 36.1 supports. Stored in
// notifications.type (see migration 027). Event-specific context lives in
// notifications.metadata.

export const NOTIFICATION_TYPES = [
  'announcement_published',
  'invoice_created',
  'invoice_overdue',
  'payment_recorded',
  'attendance_recorded',
  'bulletin_published',
  'assessment_created',
  'timetable_created',
  'timetable_updated',
  'timetable_deleted',
  'exam_results_published',
  'homework_assigned',
  'message_received',
  'invoice_reminder',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

// ── Labels & badge colours ─────────────────────────────────────────────────
// Cover both the legacy severity values (info/…/system) and the event types so
// every notification renders with a friendly label and a coloured dot.

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  // legacy severities
  info:    'Info',
  success: 'Succès',
  warning: 'Attention',
  error:   'Erreur',
  system:  'Système',
  // event types
  announcement_published: 'Annonce',
  invoice_created:        'Facture',
  invoice_overdue:        'Facture en retard',
  payment_recorded:       'Paiement',
  attendance_recorded:    'Présence',
  bulletin_published:     'Bulletin',
  assessment_created:     'Évaluation',
  timetable_created:      'Nouvel horaire',
  timetable_updated:      'Horaire modifié',
  timetable_deleted:      'Cours annulé',
  exam_results_published: "Résultats d'examen",
  homework_assigned:      'Devoir',
  message_received:       'Message',
  invoice_reminder:       'Rappel de paiement',
}

export const NOTIFICATION_TYPE_DOT: Record<string, string> = {
  // legacy severities
  info:    'bg-primary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
  system:  'bg-gray-400',
  // event types
  announcement_published: 'bg-primary-500',
  invoice_created:        'bg-amber-500',
  invoice_overdue:        'bg-red-500',
  payment_recorded:       'bg-emerald-500',
  attendance_recorded:    'bg-emerald-500',
  bulletin_published:     'bg-indigo-500',
  assessment_created:     'bg-blue-500',
  timetable_created:      'bg-primary-500',
  timetable_updated:      'bg-blue-500',
  timetable_deleted:      'bg-red-500',
  exam_results_published: 'bg-indigo-500',
  homework_assigned:      'bg-amber-500',
  message_received:       'bg-primary-500',
  invoice_reminder:       'bg-red-500',
}

export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABEL[type] ?? type
}

export function notificationTypeDot(type: string): string {
  return NOTIFICATION_TYPE_DOT[type] ?? NOTIFICATION_TYPE_DOT.info
}

// ── Relative-time formatter (fr) ─────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  if (mins < 1)   return "À l'instant"
  if (mins < 60)  return `Il y a ${mins} min`
  if (hours < 24) return `Il y a ${hours} h`
  if (days === 1) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ── Preview shape used by the header bell ────────────────────────────────────

export type NotificationPreview = {
  id:         string
  title:      string
  type:       string
  read_at:    string | null
  created_at: string
  metadata:   Record<string, unknown> | null
}

// ── createNotification() — reusable write helper ─────────────────────────────
// Thin best-effort wrapper over the SECURITY DEFINER create_notification() RPC
// (migration 006). Because the function runs as its owner, it can be invoked
// with the caller's session client. NEVER throws — a failed notification write
// must not block the action that triggered it.

type RpcCapableClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message?: string | null } | null }>
}

export type CreateNotificationInput = {
  userId:    string
  type:      NotificationType
  title:     string
  body?:     string | null
  schoolId?: string | null
  metadata?: Record<string, unknown>
}

export async function createNotification(
  client: RpcCapableClient,
  input: CreateNotificationInput,
): Promise<void> {
  try {
    const { error } = await client.rpc('create_notification', {
      p_user_id:   input.userId,
      p_title:     input.title,
      p_body:      input.body ?? null,
      p_type:      input.type,
      p_school_id: input.schoolId ?? null,
      p_metadata:  input.metadata ?? {},
    })
    if (error) {
      console.error(`[notifications] create_notification failed for type=${input.type}:`, error.message)
    }
  } catch (err) {
    console.error(`[notifications] unexpected failure for type=${input.type}`, err)
  }
}

// ── getNotificationSummary() — header bell data ──────────────────────────────
// Returns the unread count and the most recent notifications for a user. Fails
// soft: any query error yields zero/empty so the header still renders.

type ServerClient = ReturnType<typeof createServerClient>

export async function getNotificationSummary(
  client: ServerClient,
  userId: string,
  limit = 5,
): Promise<{ unreadCount: number; recent: NotificationPreview[] }> {
  const [unreadResult, listResult] = await Promise.all([
    client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null),
    client
      .from('notifications')
      .select('id, title, type, read_at, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  return {
    unreadCount: unreadResult.count ?? 0,
    recent: (listResult.data ?? []) as NotificationPreview[],
  }
}
