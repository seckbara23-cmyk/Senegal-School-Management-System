'use server'

import { requireParentCtx } from '../_auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createPaymentRequestAndCharge } from '@/lib/payments/service'

export type PayState = { error?: string }

const Schema = z.object({
  invoice_id: z.string().uuid('Facture invalide.'),
  provider:   z.enum(['wave', 'orange_money']),
  amount:     z.preprocess((v) => parseInt(String(v), 10), z.number().int().positive('Montant invalide.')),
})

export async function initiatePayment(_prev: PayState, formData: FormData): Promise<PayState> {
  const { supabase, schoolId, userId, parent } = await requireParentCtx()

  const parsed = Schema.safeParse({ invoice_id: formData.get('invoice_id'), provider: formData.get('provider'), amount: formData.get('amount') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const d = parsed.data

  const { data: invRaw } = await supabase
    .from('student_invoices').select('id, student_id, total_amount, amount_paid, status').eq('id', d.invoice_id).eq('school_id', schoolId).maybeSingle()
  const inv = invRaw as { id: string; student_id: string; total_amount: number; amount_paid: number; status: string } | null
  if (!inv) return { error: 'Facture introuvable.' }

  // Ownership: the invoice's student must be linked to this parent.
  const { data: link } = await supabase.from('parent_student_links').select('id').eq('school_id', schoolId).eq('parent_id', parent.id).eq('student_id', inv.student_id).maybeSingle()
  if (!link) return { error: 'Accès non autorisé.' }
  if (inv.status === 'paid' || inv.status === 'cancelled') return { error: 'Cette facture n’est pas payable.' }

  const balance = inv.total_amount - inv.amount_paid
  const amount = Math.min(d.amount, balance)   // server-side clamp; never trust client amount
  if (amount <= 0) return { error: 'Aucun montant restant à payer.' }

  const h = headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`

  const res = await createPaymentRequestAndCharge({ schoolId, invoiceId: inv.id, studentId: inv.student_id, initiatedBy: userId, provider: d.provider, amount, origin })
  if (res.error || !res.checkoutUrl) return { error: res.error ?? 'Échec de l’initialisation du paiement.' }
  redirect(res.checkoutUrl)
}
