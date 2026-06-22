'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatServerActionError, logSupabaseError } from '@/lib/errors'
import { logAuditEvent } from '@/lib/audit'
import { isSchoolWritable, TENANT_WRITE_BLOCKED_MESSAGE } from '@/lib/tenant'
import { notifyInvoiceCreated, notifyPaymentRecorded } from '@/lib/notification-events'
import { splitInstallments } from '@/lib/finance/payment-plans'

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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

  // Optional transport fee line — pulls the student's active assignment fee
  // and bills it as a normal invoice line (source='transport'). Phase 4.2.
  let transportLine: { description: string; amount: number } | null = null
  if (formData.get('include_transport') === 'on') {
    const { data: ta } = await supabase
      .from('student_transport_assignments')
      .select('monthly_fee, transport_routes!route_id(name)')
      .eq('school_id', schoolId).eq('student_id', String(studentId)).eq('status', 'active')
      .maybeSingle()
    const taRow = ta as unknown as { monthly_fee: number; transport_routes: { name: string } | { name: string }[] | null } | null
    if (taRow && taRow.monthly_fee > 0) {
      const r = taRow.transport_routes
      const routeName = (Array.isArray(r) ? r[0]?.name : r?.name) ?? 'Transport'
      transportLine = { description: `Transport — ${routeName}`, amount: taRow.monthly_fee }
    }
  }

  // Must have at least one line
  if (feeItemIds.length === 0 && !hasCustomDesc && !transportLine) {
    return { errors: { fee_items: ["Ajoutez au moins un frais ou une ligne personnalisée."] } }
  }

  // Compute total
  const feeTotal    = feeItemDetails.reduce((sum, i) => sum + i.amount, 0)
  const totalAmount = feeTotal + (hasCustomDesc ? customAmount : 0) + (transportLine ? transportLine.amount : 0)
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
    ...(transportLine ? [{
      school_id:   schoolId,
      invoice_id:  invoiceId,
      fee_item_id: null,
      description: transportLine.description,
      amount:      transportLine.amount,
      source:      'transport',
    }] : []),
  ]

  // `source` (migration 050) may not yet be in generated types → cast.
  const { error: linesError } = await supabase.from('invoice_lines').insert(lines as never)
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

  // Best-effort in-app notification to the student + linked parents.
  await notifyInvoiceCreated(supabase, {
    schoolId,
    invoiceId,
    invoiceNumber,
    studentId: String(studentId),
    amount:    totalAmount,
    dueDate:   (dueDate && String(dueDate) !== '') ? String(dueDate) : null,
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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

  // Reject overpayment: a payment must not exceed the remaining balance (which
  // would push amount_paid above total_amount and yield a negative balance).
  const remaining = inv.total_amount - inv.amount_paid
  if (amount > remaining) {
    return { errors: { amount: [`Le montant dépasse le solde restant (${new Intl.NumberFormat('fr-FR').format(remaining)} FCFA).`] } }
  }

  // Generate receipt number: REC-YYYY-NNNNNN (per school per calendar year)
  const payYear = new Date().getFullYear()
  const { count: paymentCount } = await supabase
    .from('student_payments')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .gte('paid_at', `${payYear}-01-01T00:00:00.000Z`)
    .lt('paid_at',  `${payYear + 1}-01-01T00:00:00.000Z`)
  const receiptNumber = `REC-${payYear}-${String((paymentCount ?? 0) + 1).padStart(6, '0')}`

  // Record the payment atomically: the RPC locks the invoice, re-validates, and
  // updates amount_paid + status in one transaction (migration 042). This fixes
  // the lost-update race of a separate insert + read-modify-write.
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_student_payment', {
    p_invoice_id:     invoice_id,
    p_amount:         amount,
    p_payment_method: payment_method,
    p_receipt_number: receiptNumber,
    p_reference:      reference ?? null,
    p_notes:          notes ?? null,
  })

  const rpcRow = (rpcData as { payment_id: string; new_status: string }[] | null)?.[0]
  if (rpcError || !rpcRow) {
    const msg = rpcError?.message ?? ''
    if (rpcError?.code === '23505') {
      logSupabaseError(rpcError, { action: 'recordPayment', schoolId, userId: user.id, entityIds: { invoice_id, receiptNumber } })
      return { errors: { _form: ['Numéro de reçu déjà utilisé. Veuillez réessayer.'] } }
    }
    if (msg.includes('amount_exceeds_balance')) return { errors: { amount: ['Le solde a changé entre-temps. Veuillez réessayer.'] } }
    if (msg.includes('invoice_paid'))           return { errors: { _form: ['Cette facture est déjà réglée.'] } }
    if (msg.includes('invoice_cancelled'))      return { errors: { _form: ['Cette facture est annulée.'] } }
    if (msg.includes('school_readonly'))        return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
    if (msg.includes('forbidden'))              return { errors: { _form: ['Non autorisé.'] } }
    return {
      errors: formatServerActionError(rpcError, {
        action: 'recordPayment',
        schoolId,
        userId: user.id,
        entityIds: { invoice_id, receiptNumber },
        fallback: "Erreur lors de l'enregistrement du paiement.",
      }) as PaymentState['errors'],
    }
  }

  const paymentId = rpcRow.payment_id
  const newStatus = rpcRow.new_status

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'payment_recorded', resourceType: 'payment', resourceId: paymentId,
    metadata: { receipt_number: receiptNumber, invoice_id, amount, payment_method, invoice_new_status: newStatus, student_id: inv.student_id },
  })

  // Best-effort in-app notification to school_admin + finance_officer users.
  await notifyPaymentRecorded(supabase, {
    schoolId,
    paymentId,
    receiptNumber,
    invoiceId:     invoice_id,
    studentId:     inv.student_id,
    amount,
    paymentMethod: payment_method,
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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

  // NOTE: No per-invoice notification here. create_bulk_invoices() is a
  // SECURITY DEFINER RPC that returns only counts (created/skipped), not the
  // created invoice or student IDs, so recipients cannot be resolved reliably
  // without fragile re-querying. Wiring bulk-invoice notifications is deferred
  // to Phase 36.3 (would require the RPC to return the created invoice IDs).

  const qs = new URLSearchParams({ created: String(result.created_count) })
  if (result.skipped_count > 0) qs.set('skipped', String(result.skipped_count))

  redirect(`/school/finance/invoices?${qs.toString()}`)
}

// ─── createPaymentPlan ────────────────────────────────────────────────────────
// Splits ONE invoice into a due-dated installment schedule. The invoice is NOT
// modified — installments are a schedule overlay (see lib/finance/payment-plans).

export type PaymentPlanState = { error?: string }

const PlanSchema = z.object({
  invoice_id:      z.string().uuid('Facture invalide.'),
  installments:    z.preprocess((v) => parseInt(String(v), 10), z.number().int().min(2, 'Au moins 2 échéances.').max(24, 'Maximum 24 échéances.')),
  start_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début invalide.'),
  interval_months: z.preprocess((v) => parseInt(String(v), 10), z.number().int().min(1).max(6)),
})

export async function createPaymentPlan(_prev: PaymentPlanState, formData: FormData): Promise<PaymentPlanState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autorisé.' }
  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { error: 'Non autorisé.' }
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = PlanSchema.safeParse({
    invoice_id:      formData.get('invoice_id'),
    installments:    formData.get('installments'),
    start_date:      formData.get('start_date'),
    interval_months: formData.get('interval_months'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const d = parsed.data

  const { data: raw } = await supabase
    .from('student_invoices').select('id, student_id, total_amount, status')
    .eq('id', d.invoice_id).eq('school_id', schoolId).maybeSingle()
  if (!raw) return { error: 'Facture introuvable.' }
  const inv = raw as { id: string; student_id: string; total_amount: number; status: string }
  if (inv.status === 'cancelled') return { error: 'Cette facture est annulée.' }
  if (inv.status === 'paid')      return { error: 'Cette facture est déjà réglée.' }
  if (inv.total_amount < d.installments) return { error: 'Le montant est trop faible pour ce nombre d’échéances.' }

  const { data: existing } = await supabase.from('payment_plans').select('id').eq('school_id', schoolId).eq('invoice_id', d.invoice_id).maybeSingle()
  if (existing) return { error: 'Un échéancier existe déjà pour cette facture.' }

  const { data: plan, error: planError } = await supabase.from('payment_plans').insert({
    school_id: schoolId, student_id: inv.student_id, invoice_id: d.invoice_id,
    name: `Échéancier en ${d.installments} fois`, total_amount: inv.total_amount, status: 'active', created_by: user.id,
  }).select('id').single()
  if (planError || !plan) {
    logSupabaseError(planError, { action: 'createPaymentPlan', schoolId, userId: user.id, entityIds: { invoice_id: d.invoice_id } })
    return { error: "Erreur lors de la création de l'échéancier." }
  }
  const planId = (plan as { id: string }).id

  const rows = splitInstallments(inv.total_amount, d.installments, d.start_date, d.interval_months)
    .map((r) => ({ school_id: schoolId, plan_id: planId, sequence: r.sequence, amount: r.amount, due_date: r.due_date }))
  const { error: instError } = await supabase.from('payment_plan_installments').insert(rows)
  if (instError) {
    await supabase.from('payment_plans').delete().eq('id', planId).eq('school_id', schoolId)
    logSupabaseError(instError, { action: 'createPaymentPlan:installments', schoolId, userId: user.id, entityIds: { planId } })
    return { error: "Erreur lors de la création des échéances." }
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'payment_plan_created', resourceType: 'payment_plan', resourceId: planId,
    metadata: { invoice_id: d.invoice_id, student_id: inv.student_id, installments: d.installments, total_amount: inv.total_amount },
  })

  redirect(`/school/finance/invoices/${d.invoice_id}`)
}

export async function cancelPaymentPlan(formData: FormData): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/school/finance')
  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) redirect('/school/finance')

  const planId = z.string().uuid().safeParse(formData.get('plan_id'))
  const invoiceId = z.string().uuid().safeParse(formData.get('invoice_id'))
  if (!planId.success || !invoiceId.success) redirect('/school/finance')
  if (!(await isSchoolWritable(supabase, schoolId))) redirect(`/school/finance/invoices/${invoiceId.data}`)

  const { error } = await supabase.from('payment_plans').delete().eq('id', planId.data).eq('school_id', schoolId)
  if (!error) {
    await logAuditEvent(supabase, {
      actorId: user.id, actorEmail: user.email, schoolId,
      action: 'payment_plan_cancelled', resourceType: 'payment_plan', resourceId: planId.data,
      metadata: { invoice_id: invoiceId.data },
    })
  }
  redirect(`/school/finance/invoices/${invoiceId.data}`)
}

// ─── generateTransportInvoices ────────────────────────────────────────────────
// Bills the active transport assignment fee for every subscribed student as a
// normal invoice (one transport line, source='transport'). Reuses the existing
// invoice model — no special-case billing path. Phase 4.2.

export type TransportBillingState = { error?: string }

const TransportBillingSchema = z.object({
  title:    z.string().trim().min(1, 'Titre requis.').max(200, 'Titre trop long.'),
  due_date: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.').nullable()),
})

export async function generateTransportInvoices(_prev: TransportBillingState, formData: FormData): Promise<TransportBillingState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autorisé.' }
  const schoolId = await getSchoolId(supabase, user.id)
  if (!schoolId) return { error: 'Non autorisé.' }
  if (!(await isSchoolWritable(supabase, schoolId))) return { error: TENANT_WRITE_BLOCKED_MESSAGE }

  const parsed = TransportBillingSchema.safeParse({ title: formData.get('title'), due_date: formData.get('due_date') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' }
  const { title, due_date } = parsed.data

  const { data: assignsRaw } = await supabase
    .from('student_transport_assignments')
    .select('student_id, monthly_fee, transport_routes!route_id(name)')
    .eq('school_id', schoolId).eq('status', 'active')
  type Assign = { student_id: string; monthly_fee: number; transport_routes: { name: string } | { name: string }[] | null }
  const list = ((assignsRaw ?? []) as unknown as Assign[])
    .map((a) => ({ student_id: a.student_id, fee: a.monthly_fee, route: (Array.isArray(a.transport_routes) ? a.transport_routes[0]?.name : a.transport_routes?.name) ?? 'Transport' }))
    .filter((a) => a.fee > 0)
  if (list.length === 0) return { error: 'Aucun élève avec un abonnement transport actif.' }

  const studentIds = list.map((a) => a.student_id)
  const { data: existing } = await supabase
    .from('student_invoices').select('student_id').eq('school_id', schoolId).eq('title', title).neq('status', 'cancelled').in('student_id', studentIds)
  const already = new Set(((existing ?? []) as { student_id: string }[]).map((e) => e.student_id))

  const year = new Date().getFullYear()
  const { count } = await supabase.from('student_invoices').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
  let seq = count ?? 0
  let created = 0, skipped = 0
  const createdInvoices: { invoiceId: string; studentId: string; number: string; amount: number }[] = []

  for (const a of list) {
    if (already.has(a.student_id)) { skipped++; continue }
    seq++
    const number = `${year}-${String(seq).padStart(4, '0')}`
    const { data: inv, error } = await supabase.from('student_invoices').insert({
      school_id: schoolId, student_id: a.student_id, academic_year_id: null, invoice_number: number,
      title, total_amount: a.fee, amount_paid: 0, status: 'unpaid', due_date, created_by: user.id,
    }).select('id').single()
    if (error || !inv) { skipped++; continue }
    const invoiceId = (inv as { id: string }).id
    const { error: lineErr } = await supabase.from('invoice_lines')
      .insert({ school_id: schoolId, invoice_id: invoiceId, fee_item_id: null, description: `Transport — ${a.route}`, amount: a.fee, source: 'transport' } as never)
    if (lineErr) { await supabase.from('student_invoices').delete().eq('id', invoiceId).eq('school_id', schoolId); skipped++; continue }
    created++
    createdInvoices.push({ invoiceId, studentId: a.student_id, number, amount: a.fee })
  }

  await logAuditEvent(supabase, {
    actorId: user.id, actorEmail: user.email, schoolId,
    action: 'transport_invoices_generated', resourceType: 'school', resourceId: schoolId,
    metadata: { title, created_count: created, skipped_count: skipped },
  })

  for (const ci of createdInvoices) {
    await notifyInvoiceCreated(supabase, { schoolId, invoiceId: ci.invoiceId, invoiceNumber: ci.number, studentId: ci.studentId, amount: ci.amount, dueDate: due_date })
  }

  const qs = new URLSearchParams({ created: String(created) })
  if (skipped > 0) qs.set('skipped', String(skipped))
  redirect(`/school/finance/transport?${qs.toString()}`)
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

  if (!(await isSchoolWritable(supabase, schoolId))) {
    return { errors: { _form: [TENANT_WRITE_BLOCKED_MESSAGE] } }
  }

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
    .select('id, status, amount_paid')
    .eq('id', invoice_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!raw) return { errors: { _form: ['Facture introuvable.'] } }

  type InvRow = { id: string; status: string; amount_paid: number }
  const inv = raw as InvRow

  if (inv.status === 'paid') {
    return { errors: { _form: ['Une facture réglée ne peut pas être annulée.'] } }
  }
  if (inv.status === 'cancelled') {
    return { errors: { _form: ['Cette facture est déjà annulée.'] } }
  }
  // Block cancelling an invoice that already has payments — cancelling would
  // orphan those payments and skew reconciliation. Reverse the payments first.
  if (inv.amount_paid > 0) {
    return { errors: { _form: ['Cette facture a déjà des paiements enregistrés et ne peut pas être annulée. Annulez ou remboursez d\'abord les paiements.'] } }
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
