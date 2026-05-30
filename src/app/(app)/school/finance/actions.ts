'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const FeeItemSchema = z.object({
  name:             z.string().min(1, 'Nom requis.').max(200, 'Nom trop long.'),
  description:      z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(500).optional()),
  amount:           z.preprocess((v) => {
    const n = parseInt(String(v), 10)
    return isNaN(n) ? undefined : n
  }, z.number().int().min(0, 'Montant invalide.')),
  due_date:         z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  academic_year_id: z.preprocess((v) => (v === '' ? undefined : v),
    z.string().uuid().optional()),
  is_active:        z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
})

const PAYMENT_METHODS = [
  'cash', 'bank_transfer', 'cheque',
  'wave_manual', 'orange_money_manual', 'other',
] as const

const PaymentSchema = z.object({
  invoice_id:     z.string().uuid('Facture invalide.'),
  amount:         z.preprocess((v) => {
    const n = parseInt(String(v), 10)
    return isNaN(n) ? undefined : n
  }, z.number().int().positive('Le montant doit être supérieur à 0.')),
  payment_method: z.enum(PAYMENT_METHODS),
  reference:      z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(200).optional()),
  notes:          z.preprocess((v) => (v === '' ? undefined : v),
    z.string().max(500).optional()),
})

// ─── State types ──────────────────────────────────────────────────────────────

export type FeeItemState = {
  errors?: {
    name?:        string[]
    description?: string[]
    amount?:      string[]
    due_date?:    string[]
    _form?:       string[]
  }
}

export type InvoiceState = {
  errors?: {
    student_id?:        string[]
    title?:             string[]
    due_date?:          string[]
    fee_items?:         string[]
    custom_description?: string[]
    custom_amount?:     string[]
    _form?:             string[]
  }
}

export type PaymentState = {
  errors?: {
    amount?:         string[]
    payment_method?: string[]
    reference?:      string[]
    _form?:          string[]
  }
}

export type BulkInvoiceState = {
  errors?: {
    class_id?:    string[]
    fee_items?:   string[]
    custom_amount?: string[]
    _form?:       string[]
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

// ─── createFeeItem ────────────────────────────────────────────────────────────

export async function createFeeItem(
  _prevState: FeeItemState,
  formData: FormData
): Promise<FeeItemState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = FeeItemSchema.safeParse({
    name:             formData.get('name'),
    description:      formData.get('description'),
    amount:           formData.get('amount'),
    due_date:         formData.get('due_date'),
    academic_year_id: formData.get('academic_year_id'),
    is_active:        formData.get('is_active'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as FeeItemState['errors'] }
  }

  // Ownership: an academic_year_id from the form must belong to this school.
  if (parsed.data.academic_year_id) {
    const { data: year } = await supabase
      .from('academic_years')
      .select('id')
      .eq('id', parsed.data.academic_year_id)
      .eq('school_id', schoolId)
      .maybeSingle()
    if (!year) return { errors: { _form: ['Année scolaire invalide.'] } }
  }

  const { data: feeItem, error } = await supabase.from('fee_items').insert({
    school_id:        schoolId,
    name:             parsed.data.name,
    description:      parsed.data.description ?? null,
    amount:           parsed.data.amount,
    due_date:         parsed.data.due_date ?? null,
    academic_year_id: parsed.data.academic_year_id ?? null,
    is_active:        parsed.data.is_active,
  })
    .select('id')
    .single()

  if (error || !feeItem) {
    return {
      errors: formatServerActionError(error, {
        action: 'createFeeItem',
        schoolId,
        userId: user.id,
        entityIds: { name: parsed.data.name },
        fallback: 'Erreur lors de la création. Veuillez réessayer.',
      }) as FeeItemState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'fee_item_created', resourceType: 'fee_item', resourceId: (feeItem as { id: string }).id,
    metadata: { name: parsed.data.name, amount: parsed.data.amount, academic_year_id: parsed.data.academic_year_id ?? null },
  })

  redirect('/school/finance/fees')
}

// ─── createInvoice ────────────────────────────────────────────────────────────

export async function createInvoice(
  _prevState: InvoiceState,
  formData: FormData
): Promise<InvoiceState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const studentId       = formData.get('student_id')
  const title           = formData.get('title')
  const dueDate         = formData.get('due_date')
  const academicYearId  = formData.get('academic_year_id')
  const customDesc      = formData.get('custom_description')
  const customAmountRaw = formData.get('custom_amount')

  if (!studentId || String(studentId).trim() === '') {
    return { errors: { student_id: ["Sélectionnez un élève."] } }
  }
  if (!title || String(title).trim() === '') {
    return { errors: { title: ['Titre requis.'] } }
  }

  // Verify student belongs to school
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', String(studentId))
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!student) return { errors: { student_id: ["Élève introuvable."] } }

  // Ownership: an academic_year_id from the form must belong to this school.
  if (academicYearId && String(academicYearId) !== '') {
    const { data: year } = await supabase
      .from('academic_years')
      .select('id')
      .eq('id', String(academicYearId))
      .eq('school_id', schoolId)
      .maybeSingle()
    if (!year) return { errors: { _form: ['Année scolaire invalide.'] } }
  }

  // Collect selected fee item IDs
  const feeItemIds = formData.getAll('fee_item_ids').map((v) => String(v)).filter(Boolean)

  // Verify all selected fee items belong to school
  let feeItemDetails: { id: string; name: string; amount: number }[] = []
  if (feeItemIds.length > 0) {
    const { data: items } = await supabase
      .from('fee_items')
      .select('id, name, amount')
      .eq('school_id', schoolId)
      .in('id', feeItemIds)
    feeItemDetails = (items ?? []) as { id: string; name: string; amount: number }[]
    if (feeItemDetails.length !== feeItemIds.length) {
      return { errors: { fee_items: ['Un ou plusieurs frais sélectionnés sont invalides.'] } }
    }
  }

  // Custom line validation
  const hasCustomDesc = customDesc && String(customDesc).trim() !== ''
  const customAmount  = hasCustomDesc ? parseInt(String(customAmountRaw), 10) : 0
  if (hasCustomDesc && (isNaN(customAmount) || customAmount <= 0)) {
    return { errors: { custom_amount: ['Montant invalide pour la ligne personnalisée.'] } }
  }

  // Must have at least one line
  if (feeItemIds.length === 0 && !hasCustomDesc) {
    return { errors: { fee_items: ["Ajoutez au moins un frais ou une ligne personnalisée."] } }
  }

  // Compute total
  const feeTotal    = feeItemDetails.reduce((sum, i) => sum + i.amount, 0)
  const totalAmount = feeTotal + (hasCustomDesc ? customAmount : 0)
  if (totalAmount <= 0) {
    return { errors: { _form: ['Le montant total doit être supérieur à 0.'] } }
  }

  // Generate invoice number: YYYY-NNNN
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('student_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
  const invoiceNumber = `${year}-${String((count ?? 0) + 1).padStart(4, '0')}`

  // Insert invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('student_invoices')
    .insert({
      school_id:        schoolId,
      student_id:       String(studentId),
      academic_year_id: (academicYearId && String(academicYearId) !== '') ? String(academicYearId) : null,
      invoice_number:   invoiceNumber,
      title:            String(title).trim(),
      total_amount:     totalAmount,
      amount_paid:      0,
      status:           'unpaid',
      due_date:         (dueDate && String(dueDate) !== '') ? String(dueDate) : null,
      created_by:       user.id,
    })
    .select('id')
    .single()

  if (invoiceError || !invoice) {
    // invoice_number is generated from a COUNT and can collide under concurrency.
    if (invoiceError?.code === '23505') {
      logSupabaseError(invoiceError, { action: 'createInvoice', schoolId, userId: user.id, entityIds: { invoiceNumber } })
      return { errors: { _form: ['Numéro de facture déjà utilisé. Veuillez réessayer.'] } }
    }
    return {
      errors: formatServerActionError(invoiceError, {
        action: 'createInvoice',
        schoolId,
        userId: user.id,
        entityIds: { studentId: String(studentId), invoiceNumber },
        fallback: 'Erreur lors de la création de la facture.',
      }) as InvoiceState['errors'],
    }
  }

  const invoiceId = (invoice as { id: string }).id

  // Insert lines
  const lines = [
    ...feeItemDetails.map((item) => ({
      school_id:   schoolId,
      invoice_id:  invoiceId,
      fee_item_id: item.id,
      description: item.name,
      amount:      item.amount,
    })),
    ...(hasCustomDesc ? [{
      school_id:   schoolId,
      invoice_id:  invoiceId,
      fee_item_id: null,
      description: String(customDesc).trim(),
      amount:      customAmount,
    }] : []),
  ]

  const { error: linesError } = await supabase.from('invoice_lines').insert(lines)
  if (linesError) {
    // Roll back the header so we never leave an invoice with a total but no
    // line items. Both id and school_id are matched to stay within the tenant.
    await supabase.from('student_invoices').delete().eq('id', invoiceId).eq('school_id', schoolId)
    return {
      errors: formatServerActionError(linesError, {
        action: 'createInvoice:lines',
        schoolId,
        userId: user.id,
        entityIds: { invoiceId, lineCount: lines.length },
        fallback: 'Erreur lors de la création des lignes de facture. Veuillez réessayer.',
      }) as InvoiceState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'invoice_created', resourceType: 'invoice', resourceId: invoiceId,
    metadata: { invoice_number: invoiceNumber, student_id: String(studentId), total_amount: totalAmount, due_date: (dueDate && String(dueDate) !== '') ? String(dueDate) : null },
  })

  redirect(`/school/finance/invoices/${invoiceId}`)
}

// ─── recordPayment ────────────────────────────────────────────────────────────

export async function recordPayment(
  _prevState: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = PaymentSchema.safeParse({
    invoice_id:     formData.get('invoice_id'),
    amount:         formData.get('amount'),
    payment_method: formData.get('payment_method'),
    reference:      formData.get('reference'),
    notes:          formData.get('notes'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as PaymentState['errors'] }
  }

  const { invoice_id, amount, payment_method, reference, notes } = parsed.data

  // Verify invoice belongs to school and is payable
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

  // Generate receipt number: REC-YYYY-NNNNNN (per school per calendar year)
  const payYear = new Date().getFullYear()
  const { count: paymentCount } = await supabase
    .from('student_payments')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .gte('paid_at', `${payYear}-01-01T00:00:00.000Z`)
    .lt('paid_at',  `${payYear + 1}-01-01T00:00:00.000Z`)
  const receiptNumber = `REC-${payYear}-${String((paymentCount ?? 0) + 1).padStart(6, '0')}`

  // Insert payment
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
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (paymentError || !paymentRow) {
    // receipt_number is generated from a COUNT and can collide under concurrency.
    if (paymentError?.code === '23505') {
      logSupabaseError(paymentError, { action: 'recordPayment', schoolId, userId: user.id, entityIds: { invoice_id, receiptNumber } })
      return { errors: { _form: ['Numéro de reçu déjà utilisé. Veuillez réessayer.'] } }
    }
    return {
      errors: formatServerActionError(paymentError, {
        action: 'recordPayment',
        schoolId,
        userId: user.id,
        entityIds: { invoice_id, receiptNumber },
        fallback: "Erreur lors de l'enregistrement du paiement.",
      }) as PaymentState['errors'],
    }
  }

  const paymentId = (paymentRow as { id: string }).id

  // Recompute invoice status
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
    metadata: { receipt_number: receiptNumber, invoice_id, amount, payment_method, invoice_new_status: newStatus, student_id: inv.student_id },
  })

  redirect(`/school/finance/payments/${paymentId}`)
}

// ─── createBulkInvoices ───────────────────────────────────────────────────────

export async function createBulkInvoices(
  _prevState: BulkInvoiceState,
  formData: FormData
): Promise<BulkInvoiceState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const classId = formData.get('class_id')
  if (!classId || String(classId).trim() === '') {
    return { errors: { class_id: ['Sélectionnez une classe.'] } }
  }

  // Verify class belongs to school and derive academic_year_id
  const { data: classRow } = await supabase
    .from('classes')
    .select('id, name, section, academic_year_id')
    .eq('id', String(classId))
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!classRow) return { errors: { class_id: ['Classe introuvable.'] } }
  type ClassRow = { id: string; name: string; section: string | null; academic_year_id: string }
  const cls = classRow as ClassRow

  // Fee items
  const feeItemIds = formData.getAll('fee_item_ids').map((v) => String(v)).filter(Boolean)
  const customDesc      = formData.get('custom_description')
  const customAmountRaw = formData.get('custom_amount')
  const hasCustomDesc   = customDesc && String(customDesc).trim() !== ''
  const customAmount    = hasCustomDesc ? parseInt(String(customAmountRaw), 10) : 0

  if (hasCustomDesc && (isNaN(customAmount) || customAmount <= 0)) {
    return { errors: { custom_amount: ['Montant invalide pour la ligne personnalisée.'] } }
  }
  if (feeItemIds.length === 0 && !hasCustomDesc) {
    return { errors: { fee_items: ['Sélectionnez au moins un frais ou ajoutez une ligne personnalisée.'] } }
  }

  // Title: use provided or default
  const titleRaw = formData.get('title')
  const title = (titleRaw && String(titleRaw).trim() !== '')
    ? String(titleRaw).trim()
    : `Frais – ${[cls.name, cls.section].filter(Boolean).join(' ')}`

  const dueDateRaw = formData.get('due_date')
  const dueDate    = (dueDateRaw && String(dueDateRaw) !== '') ? String(dueDateRaw) : null

  // Call SECURITY DEFINER RPC — atomically creates all invoices + lines
  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_bulk_invoices', {
    p_school_id:        schoolId,
    p_class_id:         String(classId),
    p_academic_year_id: cls.academic_year_id,
    p_title:            title,
    p_due_date:         dueDate,
    p_fee_item_ids:     feeItemIds.length > 0 ? feeItemIds : [],
    p_custom_desc:      hasCustomDesc ? String(customDesc).trim() : null,
    p_custom_amount:    hasCustomDesc ? customAmount : null,
    p_created_by:       user.id,
  })

  if (rpcError) {
    logSupabaseError(rpcError, {
      action: 'createBulkInvoices',
      schoolId,
      userId: user.id,
      entityIds: { classId: String(classId) },
    })
    const msg = rpcError.message.includes('amount')
      ? 'Le montant total doit être supérieur à 0.'
      : rpcError.message.includes('fee item')
      ? 'Un ou plusieurs frais sont invalides ou inactifs.'
      : 'Erreur lors de la facturation groupée. Veuillez réessayer.'
    return { errors: { _form: [msg] } }
  }

  type RpcResult = { created_count: number; skipped_count: number }
  const result = rpcResult as RpcResult

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'bulk_invoices_created', resourceType: 'class', resourceId: String(classId),
    metadata: { class_id: String(classId), title, created_count: result.created_count, skipped_count: result.skipped_count },
  })

  const qs = new URLSearchParams({ created: String(result.created_count) })
  if (result.skipped_count > 0) qs.set('skipped', String(result.skipped_count))

  redirect(`/school/finance/invoices?${qs.toString()}`)
}

// ─── cancelInvoice ────────────────────────────────────────────────────────────

const CancelSchema = z.object({
  invoice_id:          z.string().uuid('Facture invalide.'),
  cancellation_reason: z.string().min(1, 'Motif requis.').max(500, 'Motif trop long.'),
})

export type CancelInvoiceState = {
  errors?: {
    cancellation_reason?: string[]
    _form?: string[]
  }
}

export async function cancelInvoice(
  _prevState: CancelInvoiceState,
  formData: FormData
): Promise<CancelInvoiceState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { errors: { _form: ['Non autorisé.'] } }

  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { errors: { _form: ['Non autorisé.'] } }

  const parsed = CancelSchema.safeParse({
    invoice_id:          formData.get('invoice_id'),
    cancellation_reason: formData.get('cancellation_reason'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as CancelInvoiceState['errors'] }
  }

  const { invoice_id, cancellation_reason } = parsed.data

  const { data: raw } = await supabase
    .from('student_invoices')
    .select('id, status')
    .eq('id', invoice_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!raw) return { errors: { _form: ['Facture introuvable.'] } }

  type InvRow = { id: string; status: string }
  const inv = raw as InvRow

  if (inv.status === 'paid') {
    return { errors: { _form: ['Une facture réglée ne peut pas être annulée.'] } }
  }
  if (inv.status === 'cancelled') {
    return { errors: { _form: ['Cette facture est déjà annulée.'] } }
  }

  const { error } = await supabase
    .from('student_invoices')
    .update({
      status:              'cancelled',
      cancelled_at:        new Date().toISOString(),
      cancelled_by:        user.id,
      cancellation_reason: cancellation_reason,
    })
    .eq('id', invoice_id)
    .eq('school_id', schoolId)

  if (error) {
    return {
      errors: formatServerActionError(error, {
        action: 'cancelInvoice',
        schoolId,
        userId: user.id,
        entityIds: { invoice_id },
        fallback: "Erreur lors de l'annulation. Veuillez réessayer.",
      }) as CancelInvoiceState['errors'],
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'invoice_cancelled', resourceType: 'invoice', resourceId: invoice_id,
    metadata: { previous_status: inv.status, cancellation_reason },
  })

  redirect(`/school/finance/invoices/${invoice_id}`)
}
