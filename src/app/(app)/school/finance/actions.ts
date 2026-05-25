'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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

  const { error } = await supabase.from('fee_items').insert({
    school_id:        schoolId,
    name:             parsed.data.name,
    description:      parsed.data.description ?? null,
    amount:           parsed.data.amount,
    due_date:         parsed.data.due_date ?? null,
    academic_year_id: parsed.data.academic_year_id ?? null,
    is_active:        parsed.data.is_active,
  })

  if (error) {
    console.error('[createFeeItem]', error.message)
    return { errors: { _form: ['Erreur lors de la création. Veuillez réessayer.'] } }
  }

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
    console.error('[createInvoice] invoice insert:', invoiceError?.message)
    return { errors: { _form: ['Erreur lors de la création de la facture.'] } }
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
    console.error('[createInvoice] lines insert:', linesError.message)
  }

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

  // Insert payment
  const { error: paymentError } = await supabase.from('student_payments').insert({
    school_id:      schoolId,
    student_id:     inv.student_id,
    invoice_id:     invoice_id,
    amount:         amount,
    payment_method: payment_method,
    reference:      reference ?? null,
    notes:          notes ?? null,
    created_by:     user.id,
  })

  if (paymentError) {
    console.error('[recordPayment]', paymentError.message)
    return { errors: { _form: ["Erreur lors de l'enregistrement du paiement."] } }
  }

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

  redirect(`/school/finance/invoices/${invoice_id}`)
}
