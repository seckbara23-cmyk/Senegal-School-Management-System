'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { notifyPaymentRecorded } from '@/lib/notification-events'

const PAYMENT_METHODS = [
  'cash', 'bank_transfer', 'cheque', 'wave_manual', 'orange_money_manual', 'other',
] as const

const PaymentSchema = z.object({
  invoice_id:     z.string().uuid('Facture invalide.'),
  amount:         z.preprocess((v) => {
    const n = parseInt(String(v), 10)
    return isNaN(n) ? undefined : n
  }, z.number().int().positive('Le montant doit être supérieur à 0.')),
  payment_method: z.enum(PAYMENT_METHODS),
  // Optional payment date (defaults to now). Must be a calendar date if given.
  paid_at:        z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de paiement invalide (AAAA-MM-JJ).').optional()),
  reference:      z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(200, 'Référence trop longue.').optional()),
  notes:          z.preprocess((v) => (v === '' || v == null ? undefined : v),
    z.string().max(500, 'Notes trop longues.').optional()),
})

export type FoPaymentState = {
  errors?: {
    amount?:         string[]
    payment_method?: string[]
    paid_at?:        string[]
    reference?:      string[]
    _form?:          string[]
  }
}

// Resolve the active finance_officer school for the caller (never from form).
async function getFinanceOfficerSchoolId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', userId)
    .eq('role', 'finance_officer')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return (data as { school_id: string } | null)?.school_id ?? null
}

export async function recordFinanceOfficerPayment(
  _prevState: FoPaymentState,
  formData: FormData,
): Promise<FoPaymentState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getFinanceOfficerSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  // Tenant lifecycle gate (suspended/archived schools are read-only).
  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

  const parsed = PaymentSchema.safeParse({
    invoice_id:     formData.get('invoice_id'),
    amount:         formData.get('amount'),
    payment_method: formData.get('payment_method'),
    paid_at:        formData.get('paid_at'),
    reference:      formData.get('reference'),
    notes:          formData.get('notes'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as FoPaymentState['errors'] }
  }

  const { invoice_id, amount, payment_method, paid_at, reference, notes } = parsed.data

  // Verify the invoice belongs to THIS finance officer's school and is payable.
  const { data: raw } = await supabase
    .from('student_invoices')
    .select('id, student_id, total_amount, amount_paid, status')
    .eq('id', invoice_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!raw) return { errors: { _form: ['Facture introuvable.'] } }
  type InvoiceRow = { id: string; student_id: string; total_amount: number; amount_paid: number; status: string }
  const inv = raw as InvoiceRow

  if (inv.status === 'cancelled') return { errors: { _form: ['Cette facture est annulée.'] } }
  if (inv.status === 'paid')      return { errors: { _form: ['Cette facture est déjà réglée.'] } }

  // Reject overpayment: a payment must not exceed the remaining balance (which
  // would push amount_paid above total_amount and yield a negative balance).
  const remaining = inv.total_amount - inv.amount_paid
  if (amount > remaining) {
    return { errors: { amount: [`Le montant dépasse le solde restant (${new Intl.NumberFormat('fr-FR').format(remaining)} FCFA).`] } }
  }

  // paid_at: provided date at noon UTC, else now. Receipt year derives from it.
  const paidAtIso = paid_at ? `${paid_at}T12:00:00.000Z` : new Date().toISOString()
  const payYear = new Date(paidAtIso).getFullYear()

  // Receipt number: REC-YYYY-NNNNNN (per school per calendar year).
  const { count: paymentCount } = await supabase
    .from('student_payments')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .gte('paid_at', `${payYear}-01-01T00:00:00.000Z`)
    .lt('paid_at',  `${payYear + 1}-01-01T00:00:00.000Z`)
  const receiptNumber = `REC-${payYear}-${String((paymentCount ?? 0) + 1).padStart(6, '0')}`

  // Insert the payment (RLS: "Finance officers can record payments").
  const { data: paymentRow, error: paymentError } = await supabase
    .from('student_payments')
    .insert({
      school_id:      schoolId,
      student_id:     inv.student_id,
      invoice_id:     invoice_id,
      amount:         amount,
      payment_method: payment_method,
      reference:      reference ?? null,
      notes:          notes ?? null,
      receipt_number: receiptNumber,
      paid_at:        paidAtIso,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (paymentError || !paymentRow) {
    if (paymentError?.code === '23505') {
      logSupabaseError(paymentError, { action: 'recordFinanceOfficerPayment', schoolId, userId: user.id, entityIds: { invoice_id, receiptNumber } })
      return { errors: { _form: ['Numéro de reçu déjà utilisé. Veuillez réessayer.'] } }
    }
    return {
      errors: formatServerActionError(paymentError, {
        action: 'recordFinanceOfficerPayment',
        schoolId,
        userId: user.id,
        entityIds: { invoice_id, receiptNumber },
        fallback: "Erreur lors de l'enregistrement du paiement.",
      }) as FoPaymentState['errors'],
    }
  }

  const paymentId = (paymentRow as { id: string }).id

  // Recompute invoice status (RLS: "Finance officers can update invoice payment status").
  const newAmountPaid = inv.amount_paid + amount
  const newStatus =
    newAmountPaid >= inv.total_amount ? 'paid'
    : newAmountPaid > 0              ? 'partial'
    :                                  'unpaid'

  await supabase
    .from('student_invoices')
    .update({ amount_paid: newAmountPaid, status: newStatus })
    .eq('id', invoice_id)
    .eq('school_id', schoolId)

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'payment_recorded', resourceType: 'payment', resourceId: paymentId,
    metadata: { receipt_number: receiptNumber, invoice_id, amount, payment_method, invoice_new_status: newStatus, student_id: inv.student_id, by_role: 'finance_officer' },
  })

  // Best-effort notification to school_admin + finance_officer users. Uses the
  // service-role client so recipient resolution isn't limited by the finance
  // officer's own-membership-only RLS view of school_memberships.
  await notifyPaymentRecorded(createAdminClient(), {
    schoolId,
    paymentId,
    receiptNumber,
    invoiceId:     invoice_id,
    studentId:     inv.student_id,
    amount,
    paymentMethod: payment_method,
  })

  redirect(`/finance-officer/payments/${paymentId}`)
}
