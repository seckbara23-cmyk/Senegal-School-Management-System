// ─── Online payment service (server-only, service-role) ──────────────────────
//
// The two money-adjacent operations shared by the parent initiate action, the
// webhook, and the return-page fallback. All run via the service-role admin
// client (payment_requests writes + record_online_payment are not parent-writable).

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { notifyPaymentRecorded } from '@/lib/notification-events'
import { loadProviderConfig, type OnlineProvider } from './config'
import { getOnlineProvider } from './providers/index'

type Admin = ReturnType<typeof createAdminClient>

async function nextReceiptNumber(admin: Admin, schoolId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await admin.from('student_payments').select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId).gte('paid_at', `${year}-01-01T00:00:00.000Z`).lt('paid_at', `${year + 1}-01-01T00:00:00.000Z`)
  return `REC-${year}-${String((count ?? 0) + 1).padStart(6, '0')}`
}

type RecordRow = { payment_id: string | null; outcome: string; new_status: string }

// Record via the RPC, retrying with a fresh receipt number on a receipt-uniqueness
// collision (concurrent reconciliations for different invoices in the same school
// can compute the same sequential REC-… number). The RPC transaction rolls back on
// the unique violation, so the request is untouched and the retry is safe.
async function recordWithRetry(admin: Admin, requestId: string, providerRef: string, schoolId: string): Promise<{ row: RecordRow | null; receipt: string | null; failed: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const receipt = await nextReceiptNumber(admin, schoolId)
    const { data, error } = await admin.rpc('record_online_payment' as never, { p_request_id: requestId, p_provider_ref: providerRef, p_receipt_number: receipt } as never)
    if (!error) return { row: (data as RecordRow[] | null)?.[0] ?? null, receipt, failed: false }
    const code = (error as { code?: string }).code
    const msg = String((error as { message?: string }).message ?? '')
    const collision = code === '23505' || /duplicate|unique|receipt/i.test(msg)
    if (!collision) return { row: null, receipt, failed: true }
  }
  return { row: null, receipt: null, failed: true }
}

// ── Create a request + open the provider checkout ─────────────────────────────
export async function createPaymentRequestAndCharge(input: {
  schoolId: string; invoiceId: string; studentId: string; initiatedBy: string | null
  provider: OnlineProvider; amount: number; origin: string
}): Promise<{ checkoutUrl?: string; error?: string }> {
  const config = await loadProviderConfig(input.schoolId, input.provider)
  if (!config) return { error: 'Ce moyen de paiement n’est pas disponible pour cette école.' }
  const providerImpl = getOnlineProvider(input.provider)
  if (!providerImpl) return { error: 'Fournisseur de paiement inconnu.' }

  const admin = createAdminClient()
  const { data: reqRow, error } = await admin.from('payment_requests').insert({
    school_id: input.schoolId, invoice_id: input.invoiceId, student_id: input.studentId, initiated_by: input.initiatedBy,
    provider: input.provider, amount: input.amount, status: 'pending', idempotency_key: randomUUID(),
  }).select('id').single()
  if (error || !reqRow) return { error: 'Impossible d’initier le paiement. Réessayez.' }
  const requestId = (reqRow as { id: string }).id

  try {
    const charge = await providerImpl.createCharge({
      config, amount: input.amount, reference: requestId,
      successUrl: `${input.origin}/parent/finance/payment/${requestId}`,
      cancelUrl: `${input.origin}/parent/finance/payment/${requestId}?cancelled=1`,
      webhookUrl: `${input.origin}/api/payments/webhook/${input.provider}`,
      description: 'Frais scolaires',
    })
    await admin.from('payment_requests').update({ status: 'processing', provider_session_id: charge.providerSessionId, checkout_url: charge.checkoutUrl }).eq('id', requestId)
    if (input.initiatedBy) {
      await logAuditEvent(admin, { actorId: input.initiatedBy, schoolId: input.schoolId, action: 'payment_request_created', resourceType: 'payment_request', resourceId: requestId, metadata: { provider: input.provider, amount: input.amount, invoice_id: input.invoiceId } })
    }
    return { checkoutUrl: charge.checkoutUrl }
  } catch (e) {
    await admin.from('payment_requests').update({ status: 'failed', error_message: String((e as Error).message ?? e).slice(0, 200) }).eq('id', requestId)
    return { error: 'Le service de paiement est momentanément indisponible. Réessayez plus tard.' }
  }
}

// ── Reconcile: poll provider → record once via record_online_payment ──────────
export type ReconcileResult = { status: 'paid' | 'failed' | 'processing' | 'pending' | 'cancelled' | 'expired'; paymentId?: string | null }

export async function reconcilePaymentRequest(requestId: string): Promise<ReconcileResult> {
  const admin = createAdminClient()
  const { data: reqRaw } = await admin.from('payment_requests')
    .select('id, school_id, invoice_id, student_id, provider, amount, status, provider_session_id, payment_id, initiated_by')
    .eq('id', requestId).maybeSingle()
  const req = reqRaw as { id: string; school_id: string; invoice_id: string; student_id: string; provider: OnlineProvider; amount: number; status: string; provider_session_id: string | null; payment_id: string | null; initiated_by: string | null } | null
  if (!req) return { status: 'failed' }
  if (req.status === 'paid') return { status: 'paid', paymentId: req.payment_id }
  if (req.status === 'failed' || req.status === 'cancelled' || req.status === 'expired') return { status: req.status }

  const config = await loadProviderConfig(req.school_id, req.provider)
  const providerImpl = getOnlineProvider(req.provider)
  if (!config || !providerImpl || !req.provider_session_id) return { status: 'processing' }

  const tx = await providerImpl.verifyTransaction(config, req.provider_session_id, { orderId: req.id, amount: req.amount })

  if (tx.status === 'paid') {
    // Defence in depth: reject a settled amount that disagrees with the request.
    if (tx.amount !== null && tx.amount !== req.amount) {
      await admin.from('payment_requests').update({ status: 'failed', error_message: 'amount_mismatch' }).eq('id', req.id)
      return { status: 'failed' }
    }
    const providerRef = tx.providerReference ?? req.provider_session_id
    const { row, receipt, failed } = await recordWithRetry(admin, req.id, providerRef, req.school_id)
    if (failed || !row) return { status: 'processing' }
    if (row.outcome === 'recorded') {
      await notifyPaymentRecorded(admin, { schoolId: req.school_id, paymentId: row.payment_id!, receiptNumber: receipt ?? '', invoiceId: req.invoice_id, studentId: req.student_id, amount: req.amount, paymentMethod: req.provider })
      if (req.initiated_by) {
        await createNotification(admin, { userId: req.initiated_by, type: 'payment_succeeded', title: 'Paiement confirmé', body: `Votre paiement de ${new Intl.NumberFormat('fr-FR').format(req.amount)} FCFA a été reçu.`, schoolId: req.school_id, metadata: { invoice_id: req.invoice_id, payment_id: row.payment_id } })
        await logAuditEvent(admin, { actorId: req.initiated_by, schoolId: req.school_id, action: 'online_payment_reconciled', resourceType: 'payment_request', resourceId: req.id, metadata: { invoice_id: req.invoice_id, amount: req.amount, payment_id: row.payment_id, provider: req.provider } })
      }
    }
    return { status: 'paid', paymentId: row?.payment_id ?? null }
  }

  if (tx.status === 'failed') {
    await admin.from('payment_requests').update({ status: 'failed', error_message: 'provider_failed' }).eq('id', req.id)
    if (req.initiated_by) await logAuditEvent(admin, { actorId: req.initiated_by, schoolId: req.school_id, action: 'online_payment_failed', resourceType: 'payment_request', resourceId: req.id, metadata: { invoice_id: req.invoice_id, provider: req.provider } })
    return { status: 'failed' }
  }

  return { status: 'processing' }
}
