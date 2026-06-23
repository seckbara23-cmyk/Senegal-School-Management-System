// ─── Finance CSV export builders (server-only) ───────────────────────────────
//
// Pure query + CSV builders shared by the school-admin and finance-officer
// export route handlers. Each takes the caller's USER-SCOPED Supabase client
// (so RLS enforces school + role access) and the resolved school_id, applies
// the same filters as the on-screen pages, and returns a CSV string.

import type { createClient as createServerClient } from '@/lib/supabase/server'
import { toCsv, sanitizeOrTerm } from '@/lib/csv'

type Client = ReturnType<typeof createServerClient>

const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money',
  wave: 'Wave',
  orange_money: 'Orange Money', other: 'Autre',
}
const STATUS_LABEL: Record<string, string> = {
  unpaid: 'Impayée', partial: 'Partielle', paid: 'Réglée', cancelled: 'Annulée',
}
const VALID_METHODS = ['cash', 'bank_transfer', 'cheque', 'wave_manual', 'orange_money_manual', 'other']
const VALID_STATUS  = ['unpaid', 'partial', 'paid', 'cancelled']

function dateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

export type PaymentFilters = { dateFrom?: string | null; dateTo?: string | null; method?: string | null; q?: string }

export async function buildPaymentsCsv(client: Client, schoolId: string, f: PaymentFilters): Promise<string> {
  let studentIds: string[] = []
  const q = (f.q ?? '').trim()
  if (q) {
    const term = sanitizeOrTerm(q)
    if (term) {
      const { data } = await client.from('students').select('id').eq('school_id', schoolId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      studentIds = ((data ?? []) as { id: string }[]).map((s) => s.id)
    }
  }

  let query = client
    .from('student_payments')
    .select('id, receipt_number, amount, payment_method, reference, paid_at, students!student_id(first_name, last_name), student_invoices!invoice_id(invoice_number, title)')
    .eq('school_id', schoolId)
    .order('paid_at', { ascending: false })
    .limit(5000)

  if (f.dateFrom) query = query.gte('paid_at', `${f.dateFrom}T00:00:00.000Z`)
  if (f.dateTo)   query = query.lte('paid_at', `${f.dateTo}T23:59:59.999Z`)
  if (f.method && VALID_METHODS.includes(f.method)) query = query.eq('payment_method', f.method)
  if (q) {
    const term = sanitizeOrTerm(q)
    const orParts = [`receipt_number.ilike.%${term}%`]
    if (studentIds.length > 0) orParts.push(`student_id.in.(${studentIds.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const { data } = await query
  type Row = {
    receipt_number: string | null; amount: number; payment_method: string; reference: string | null; paid_at: string
    students: { first_name: string; last_name: string } | null
    student_invoices: { invoice_number: string; title: string } | null
  }
  const rows = (data ?? []) as unknown as Row[]

  return toCsv(
    ['N° Reçu', 'Date', 'Élève', 'N° Facture', 'Objet', 'Mode', 'Montant', 'Référence'],
    rows.map((p) => [
      p.receipt_number ?? '',
      dateOnly(p.paid_at),
      p.students ? `${p.students.first_name} ${p.students.last_name}` : '',
      p.student_invoices?.invoice_number ?? '',
      p.student_invoices?.title ?? '',
      METHOD_LABEL[p.payment_method] ?? p.payment_method,
      p.amount,
      p.reference ?? '',
    ]),
  )
}

export type InvoiceFilters = { status?: string | null; q?: string; academicYearId?: string | null }

export async function buildInvoicesCsv(client: Client, schoolId: string, f: InvoiceFilters): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  let studentIds: string[] = []
  const q = (f.q ?? '').trim()
  if (q) {
    const term = sanitizeOrTerm(q)
    if (term) {
      const { data } = await client.from('students').select('id').eq('school_id', schoolId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      studentIds = ((data ?? []) as { id: string }[]).map((s) => s.id)
    }
  }

  let query = client
    .from('student_invoices')
    .select('invoice_number, title, total_amount, amount_paid, status, due_date, created_at, students!student_id(first_name, last_name), academic_years!academic_year_id(name)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (f.status === 'overdue') {
    query = query.in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null)
  } else if (f.status && VALID_STATUS.includes(f.status)) {
    query = query.eq('status', f.status)
  }
  if (f.academicYearId) query = query.eq('academic_year_id', f.academicYearId)
  if (q) {
    const term = sanitizeOrTerm(q)
    const orParts = [`invoice_number.ilike.%${term}%`]
    if (studentIds.length > 0) orParts.push(`student_id.in.(${studentIds.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const { data } = await query
  type Row = {
    invoice_number: string; title: string; total_amount: number; amount_paid: number
    status: string; due_date: string | null; created_at: string
    students: { first_name: string; last_name: string } | null
    academic_years: { name: string } | null
  }
  const rows = (data ?? []) as unknown as Row[]

  return toCsv(
    ['N° Facture', 'Élève', 'Objet', 'Année scolaire', 'Total', 'Réglé', 'Solde', 'Statut', 'Échéance', 'Créée le'],
    rows.map((inv) => [
      inv.invoice_number,
      inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : '',
      inv.title,
      inv.academic_years?.name ?? '',
      inv.total_amount,
      inv.amount_paid,
      inv.total_amount - inv.amount_paid,
      STATUS_LABEL[inv.status] ?? inv.status,
      dateOnly(inv.due_date),
      dateOnly(inv.created_at),
    ]),
  )
}

export type ReportFilters = { dateFrom: string; dateTo: string }

export async function buildReportCsv(client: Client, schoolId: string, f: ReportFilters): Promise<string> {
  const today  = new Date().toISOString().split('T')[0]
  const fromTs = `${f.dateFrom}T00:00:00.000Z`
  const toTs   = `${f.dateTo}T23:59:59.999Z`

  const [invoicedRes, paymentsRes, activeBalRes, overdueRes] = await Promise.all([
    client.from('student_invoices').select('total_amount').eq('school_id', schoolId).neq('status', 'cancelled').gte('created_at', fromTs).lte('created_at', toTs),
    client.from('student_payments').select('amount, payment_method').eq('school_id', schoolId).gte('paid_at', fromTs).lte('paid_at', toTs),
    client.from('student_invoices').select('total_amount, amount_paid').eq('school_id', schoolId).neq('status', 'cancelled'),
    client.from('student_invoices').select('total_amount, amount_paid').eq('school_id', schoolId).in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null),
  ])

  const invoiced = (invoicedRes.data ?? []) as { total_amount: number }[]
  const payments = (paymentsRes.data ?? []) as { amount: number; payment_method: string }[]
  const active   = (activeBalRes.data ?? []) as { total_amount: number; amount_paid: number }[]
  const overdue  = (overdueRes.data ?? []) as { total_amount: number; amount_paid: number }[]

  const totalInvoiced  = invoiced.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected = payments.reduce((s, p) => s + p.amount, 0)
  const outstanding    = active.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const overdueBalance = overdue.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)

  const byMethod: Record<string, number> = {}
  for (const p of payments) byMethod[p.payment_method] = (byMethod[p.payment_method] ?? 0) + p.amount
  const methodEntries = Object.entries(byMethod).sort((a, b) => b[1] - a[1])

  // Section 1: summary indicators. Section 2: payments by method. Sections are
  // separated by a blank line — common, spreadsheet-friendly multi-block CSV.
  const summary = toCsv(['Indicateur', 'Valeur'], [
    ['Période du', f.dateFrom],
    ['Période au', f.dateTo],
    ['Facturé (période)', totalInvoiced],
    ['Encaissé (période)', totalCollected],
    ['Nombre de paiements (période)', payments.length],
    ['Solde en attente (actuel)', outstanding],
    ['Solde en retard (actuel)', overdueBalance],
  ])
  const methods = toCsv(['Mode de paiement', 'Montant'],
    methodEntries.map(([m, amt]) => [METHOD_LABEL[m] ?? m, amt]),
  )

  return `${summary}\r\n\r\n${methods}`
}
