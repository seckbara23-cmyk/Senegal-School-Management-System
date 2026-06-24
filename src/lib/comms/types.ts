// ─── Communication layer — shared types (Phase 9D) ───────────────────────────

import type { NotificationType } from '@/lib/notifications'

export type CommChannel = 'in_app' | 'email' | 'sms' | 'whatsapp'
export type ExternalChannel = 'email' | 'sms' | 'whatsapp'
export type CommCategory = 'finance' | 'attendance' | 'academic' | 'announcements' | 'marketing'

export type RecipientContact = { userId: string | null; email: string | null; phone: string | null; name: string }

// Resolved per-school channel config (per-school override creds, else platform env).
export type ResolvedChannelConfig = {
  schoolId: string
  channel: ExternalChannel
  providerCode: string
  mode: 'sandbox' | 'live'
  senderId: string | null
  apiKey: string         // '' → adapter falls back to platform env
  webhookSecret: string  // '' → adapter falls back to platform env
  config: Record<string, unknown>
}

export type OutboundMessage = {
  config: ResolvedChannelConfig
  to: string
  subject: string | null
  body: string
  templateKey: string
  category: CommCategory
}

export type SendResult = { providerMessageId: string | null; status: 'sent' | 'queued' | 'failed'; cost?: number | null; error?: string | null }

// Every external-channel provider implements this — no vendor lock-in.
export interface CommunicationChannelProvider {
  channel: ExternalChannel
  enabled: boolean
  send(msg: OutboundMessage): Promise<SendResult>
  verifyWebhook?(raw: string, headers: Headers, secret: string): { eventId: string; providerMessageId: string | null; status: string; valid: boolean }
}

// Input to the dispatcher: in-app (default) always fires; external channels
// fan out per per-school config + per-recipient preferences.
export type DispatchInput = {
  schoolId: string
  category: CommCategory
  templateKey: string
  recipients: RecipientContact[]
  vars: Record<string, string>
  // Ad-hoc content (broadcast composer) — bypasses template rendering when set.
  content?: { subject?: string | null; body: string }
  // Restrict which external channels to attempt (default: all). Preferences still apply.
  channels?: ExternalChannel[]
  inApp?: { type: NotificationType; title: string; body: string; metadata?: Record<string, unknown> }
  related?: { type: string; id: string }
  actorId?: string | null
}
