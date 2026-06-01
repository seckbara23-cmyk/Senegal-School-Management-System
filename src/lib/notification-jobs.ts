// ─── Notification jobs (Phase 36.3) ─────────────────────────────────────────
//
// Batch/scheduled notification processes. Unlike the per-mutation event helpers
// in notification-events.ts, these scan existing data and fan out catch-up
// notifications. They are designed to be run by a super-admin manual trigger
// today, and by a cron worker later — both pass the service-role admin client.
//
// In-app only. Best-effort per notification; the job always returns summary
// counts and never throws.

import type { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

// Service-role client (bypasses RLS — needed to scan invoices across tenants).
// Type-only import → erased at build time.
type AdminClient = ReturnType<typeof createAdminClient>

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

export type OverdueJobSummary = {
  invoicesProcessed:         number
  notificationsSent:         number
  notificationsSkipped:      number
  invoicesWithoutRecipients: number
}

// ── notifyOverdueInvoices() ──────────────────────────────────────────────────
//
// Selects invoices that are overdue (status unpaid/partial, due_date strictly
// before today) and belong to an ACTIVE school, then notifies the student and
// their linked parents. Idempotent per (invoice, recipient): a recipient who
// already has an invoice_overdue notification for that invoice is skipped, so
// the job is safe to re-run (daily, on demand, etc.).

export async function notifyOverdueInvoices(client: AdminClient): Promise<OverdueJobSummary> {
  const summary: OverdueJobSummary = {
    invoicesProcessed:         0,
    notificationsSent:         0,
    notificationsSkipped:      0,
    invoicesWithoutRecipients: 0,
  }

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Overdue, payable invoices in active schools. 'cancelled'/'paid' are excluded
  // by the status filter; a NULL due_date never satisfies `< today`.
  // schools!inner + the subscription_status filter restricts to active tenants.
  const { data: invoicesData, error } = await client
    .from('student_invoices')
    .select('id, invoice_number, student_id, school_id, total_amount, amount_paid, due_date, schools!inner(subscription_status)')
    .in('status', ['unpaid', 'partial'])
    .lt('due_date', today)
    .eq('schools.subscription_status', 'active')
    .order('due_date', { ascending: true })
    .limit(1000)

  if (error) {
    console.error('[jobs] notifyOverdueInvoices: query failed', error.message)
    return summary
  }

  type InvoiceRow = {
    id: string; invoice_number: string; student_id: string; school_id: string
    total_amount: number; amount_paid: number; due_date: string
  }
  const invoices = (invoicesData ?? []) as unknown as InvoiceRow[]
  if (invoices.length === 0) return summary

  const studentIds = Array.from(new Set(invoices.map((i) => i.student_id)))

  // Resolve student names + profile ids (batched).
  const studentMap = new Map<string, { name: string; profileId: string | null }>()
  {
    const { data } = await client
      .from('students')
      .select('id, first_name, last_name, profile_id')
      .in('id', studentIds)
    type Row = { id: string; first_name: string; last_name: string; profile_id: string | null }
    for (const r of (data ?? []) as Row[]) {
      studentMap.set(r.id, { name: `${r.first_name} ${r.last_name}`.trim(), profileId: r.profile_id })
    }
  }

  // Resolve linked parent profile ids per student (batched).
  const parentMap = new Map<string, string[]>()
  {
    const { data } = await client
      .from('parent_student_links')
      .select('student_id, parents!parent_id(profile_id)')
      .in('student_id', studentIds)
    type Row = { student_id: string; parents: { profile_id: string | null } | null }
    for (const r of (data ?? []) as unknown as Row[]) {
      const pid = r.parents?.profile_id
      if (!pid) continue
      const list = parentMap.get(r.student_id) ?? []
      list.push(pid)
      parentMap.set(r.student_id, list)
    }
  }

  for (const inv of invoices) {
    summary.invoicesProcessed++
    try {
      const recipientSet = new Set<string>()
      const sp = studentMap.get(inv.student_id)?.profileId
      if (sp) recipientSet.add(sp)
      for (const pid of parentMap.get(inv.student_id) ?? []) recipientSet.add(pid)
      const recipients = Array.from(recipientSet)

      if (recipients.length === 0) {
        summary.invoicesWithoutRecipients++
        continue
      }

      // Idempotency: who has ALREADY received an invoice_overdue notification
      // for THIS invoice? Skip them so re-runs don't duplicate.
      const { data: existing } = await client
        .from('notifications')
        .select('user_id')
        .eq('type', 'invoice_overdue')
        .eq('metadata->>invoice_id', inv.id)
      const already = new Set(((existing ?? []) as { user_id: string }[]).map((e) => e.user_id))

      const amountDue = inv.total_amount - inv.amount_paid
      const studentName = studentMap.get(inv.student_id)?.name ?? "l'élève"
      const metadata = {
        invoice_id:     inv.id,
        invoice_number: inv.invoice_number,
        student_id:     inv.student_id,
        amount_due:     amountDue,
        due_date:       inv.due_date,
      }

      for (const userId of recipients) {
        if (already.has(userId)) {
          summary.notificationsSkipped++
          continue
        }
        await createNotification(client, {
          userId,
          type:     'invoice_overdue',
          title:    'Facture en retard',
          body:     `La facture ${inv.invoice_number} de ${fmtAmount(amountDue)} est en retard pour ${studentName}.`,
          schoolId: inv.school_id,
          metadata,
        })
        summary.notificationsSent++
      }
    } catch (err) {
      console.error('[jobs] notifyOverdueInvoices: invoice failed', inv.id, err)
    }
  }

  return summary
}
