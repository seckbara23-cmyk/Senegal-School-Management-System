import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PaymentForm } from './_payment_form'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_LABEL: Record<string, string> = {
  unpaid:    'Impayée',
  partial:   'Partielle',
  paid:      'Réglée',
  cancelled: 'Annulée',
}

const STATUS_CLASS: Record<string, string> = {
  unpaid:    'border-red-300 bg-red-100 text-red-700',
  partial:   'border-amber-300 bg-amber-100 text-amber-700',
  paid:      'border-emerald-300 bg-emerald-100 text-emerald-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}

const METHOD_LABEL: Record<string, string> = {
  cash:                'Espèces',
  bank_transfer:       'Virement',
  cheque:              'Chèque',
  wave_manual:         'Wave',
  orange_money_manual: 'Orange Money',
  other:               'Autre',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params: { invoiceId: string }
}

export default async function InvoiceDetailPage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id

  // Fetch invoice with student info
  const { data: rawInvoice } = await supabase
    .from('student_invoices')
    .select(`
      id, invoice_number, title, total_amount, amount_paid, status, due_date, created_at,
      students!student_id(id, first_name, last_name),
      academic_years!academic_year_id(name)
    `)
    .eq('id', params.invoiceId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawInvoice) notFound()

  type InvoiceDetail = {
    id: string
    invoice_number: string
    title: string
    total_amount: number
    amount_paid: number
    status: string
    due_date: string | null
    created_at: string
    students: { id: string; first_name: string; last_name: string }
    academic_years: { name: string } | null
  }
  const invoice = rawInvoice as unknown as InvoiceDetail

  // Fetch lines and payments in parallel
  const [linesRes, paymentsRes] = await Promise.all([
    supabase
      .from('invoice_lines')
      .select('id, description, amount, fee_item_id')
      .eq('invoice_id', invoice.id)
      .order('created_at'),

    supabase
      .from('student_payments')
      .select('id, amount, payment_method, reference, notes, paid_at')
      .eq('invoice_id', invoice.id)
      .order('paid_at', { ascending: false }),
  ])

  type LineRow    = { id: string; description: string; amount: number; fee_item_id: string | null }
  type PaymentRow = { id: string; amount: number; payment_method: string; reference: string | null; notes: string | null; paid_at: string }

  const lines    = (linesRes.data    ?? []) as LineRow[]
  const payments = (paymentsRes.data ?? []) as PaymentRow[]

  const balance        = invoice.total_amount - invoice.amount_paid
  const canAddPayment  = invoice.status !== 'paid' && invoice.status !== 'cancelled'

  return (
    <div className="space-y-6">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/finance/invoices" className="text-primary-300 hover:text-white text-sm">
            ← Factures
          </a>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-sm text-primary-300">{invoice.invoice_number}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[invoice.status] ?? STATUS_CLASS.unpaid}`}>
                {STATUS_LABEL[invoice.status] ?? invoice.status}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">{invoice.title}</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              <a
                href={`/school/students/${invoice.students.id}`}
                className="hover:text-white hover:underline"
              >
                {invoice.students.first_name} {invoice.students.last_name}
              </a>
              {invoice.academic_years && (
                <span> · {invoice.academic_years.name}</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary-400">Échéance</p>
            <p className="text-sm font-medium text-white">{fmtDate(invoice.due_date)}</p>
          </div>
        </div>
      </div>

      {/* ── Amount stat strip ────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-3 shadow-sm">
        <div className="bg-primary-600 px-4 py-4 text-center">
          <p className="text-xl font-bold text-white">{fmt(invoice.total_amount)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Total facturé</p>
        </div>
        <div className="bg-emerald-600 px-4 py-4 text-center">
          <p className="text-xl font-bold text-white">{fmt(invoice.amount_paid)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-1">Encaissé</p>
        </div>
        <div className={`px-4 py-4 text-center ${balance > 0 ? 'bg-red-600' : 'bg-gray-500'}`}>
          <p className="text-xl font-bold text-white">{fmt(balance)}</p>
          <p className={`text-xs font-semibold uppercase tracking-wider mt-1 ${balance > 0 ? 'text-red-200' : 'text-gray-300'}`}>
            Solde
          </p>
        </div>
      </div>

      {/* ── Invoice lines ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Détail de la facture</h2>
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Désignation</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={line.id}
                  className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  <td className="px-4 py-3 text-gray-800">
                    {line.description}
                    {!line.fee_item_id && (
                      <span className="ml-2 text-xs text-gray-400">(personnalisé)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                    {fmt(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-primary-50 border-t-2 border-primary-200">
                <td className="px-4 py-3 text-sm font-bold text-primary-800">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-primary-800 whitespace-nowrap">
                  {fmt(invoice.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Payments history ────────────────────────────────────────────────── */}
      {payments.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Paiements reçus</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Référence</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {fmtDateTime(p.paid_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      {fmt(p.amount)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600">
                      {METHOD_LABEL[p.payment_method] ?? p.payment_method}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs">
                      {p.reference ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payment form ────────────────────────────────────────────────────── */}
      {canAddPayment && (
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Enregistrer un paiement</h2>
          <div className="rounded-xl border border-sand-200 bg-white px-6 py-5 shadow-sm">
            <PaymentForm invoiceId={invoice.id} balance={balance} />
          </div>
        </div>
      )}

      {invoice.status === 'paid' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✓ Cette facture est entièrement réglée.
        </div>
      )}

      {invoice.status === 'cancelled' && (
        <div className="rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-500">
          Cette facture a été annulée.
        </div>
      )}

    </div>
  )
}
