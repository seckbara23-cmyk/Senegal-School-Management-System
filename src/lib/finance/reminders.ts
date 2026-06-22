// ─── Payment reminder framework (Phase 4.5) ──────────────────────────────────
//
// Channel-abstracted reminders. Only the in-app channel is implemented today
// (creates a notification + logs a payment_reminders row). SMS / email / WhatsApp
// are declared but disabled — a real provider later just implements send() and
// flips `enabled`, with no change to callers. Reminders are MANUAL: nothing here
// sends automatically.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

type Client = ReturnType<typeof createServerClient>

function fmtAmount(n: number): string { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export type ReminderContext = {
  client: Client
  schoolId: string
  invoiceId: string
  studentId: string
  studentName: string
  recipientUserIds: string[]
  balance: number
  dueDate: string | null
}

export type ReminderChannelCode = 'in_app' | 'sms' | 'email' | 'whatsapp'

export interface ReminderChannel {
  code: ReminderChannelCode
  label: string
  enabled: boolean
  // Returns the number of recipients actually delivered to.
  send(ctx: ReminderContext): Promise<number>
}

const inAppChannel: ReminderChannel = {
  code: 'in_app',
  label: 'Notification in-app',
  enabled: true,
  async send(ctx) {
    if (ctx.recipientUserIds.length === 0) return 0
    const dueLabel = ctx.dueDate ? ` (échéance du ${fmtDate(ctx.dueDate)})` : ''
    await Promise.all(ctx.recipientUserIds.map((userId) =>
      createNotification(ctx.client, {
        userId, type: 'invoice_reminder',
        title: 'Rappel de paiement',
        body: `Un solde de ${fmtAmount(ctx.balance)} reste à régler pour ${ctx.studentName}${dueLabel}.`,
        schoolId: ctx.schoolId,
        metadata: { invoice_id: ctx.invoiceId, student_id: ctx.studentId, balance: ctx.balance },
      })))
    return ctx.recipientUserIds.length
  },
}

// Future channels — present in the registry but not yet wired to a provider.
function stubChannel(code: ReminderChannelCode, label: string): ReminderChannel {
  return { code, label, enabled: false, async send() { throw new Error(`Reminder channel '${code}' is not configured yet.`) } }
}

export const REMINDER_CHANNELS: Record<ReminderChannelCode, ReminderChannel> = {
  in_app:   inAppChannel,
  sms:      stubChannel('sms', 'SMS'),
  email:    stubChannel('email', 'E-mail'),
  whatsapp: stubChannel('whatsapp', 'WhatsApp'),
}

// Resolve the student + their linked parents' auth user IDs (best-effort).
export async function resolveReminderRecipients(client: Client, schoolId: string, studentId: string): Promise<{ userIds: string[]; studentName: string }> {
  const { data: student } = await client.from('students').select('first_name, last_name, profile_id').eq('id', studentId).eq('school_id', schoolId).maybeSingle()
  const s = student as { first_name: string; last_name: string; profile_id: string | null } | null
  const userIds = new Set<string>()
  if (s?.profile_id) userIds.add(s.profile_id)

  const { data: links } = await client
    .from('parent_student_links').select('parents!parent_id(profile_id)').eq('school_id', schoolId).eq('student_id', studentId)
  for (const l of (links ?? []) as unknown as { parents: { profile_id: string | null } | null }[]) {
    const pid = l.parents?.profile_id; if (pid) userIds.add(pid)
  }
  return { userIds: Array.from(userIds), studentName: s ? `${s.first_name} ${s.last_name}` : "l'élève" }
}

// Send one reminder via a channel and log it. Returns recipient count (or null on no-op).
export async function sendInvoiceReminder(
  client: Client,
  input: { schoolId: string; invoiceId: string; studentId: string; balance: number; dueDate: string | null; actorId: string; channel?: ReminderChannelCode },
): Promise<number> {
  const channel = REMINDER_CHANNELS[input.channel ?? 'in_app']
  if (!channel.enabled) return 0

  const { userIds, studentName } = await resolveReminderRecipients(client, input.schoolId, input.studentId)
  let delivered = 0
  try {
    delivered = await channel.send({
      client, schoolId: input.schoolId, invoiceId: input.invoiceId, studentId: input.studentId,
      studentName, recipientUserIds: userIds, balance: input.balance, dueDate: input.dueDate,
    })
  } catch (err) {
    console.error('[reminders] channel send failed', err)
  }

  await client.from('payment_reminders').insert({
    school_id: input.schoolId, invoice_id: input.invoiceId, student_id: input.studentId,
    channel: channel.code, status: delivered > 0 ? 'sent' : 'failed', recipient_count: delivered, created_by: input.actorId,
  })
  return delivered
}
