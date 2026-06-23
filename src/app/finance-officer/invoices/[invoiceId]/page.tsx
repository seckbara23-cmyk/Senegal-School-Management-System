import { requireFinanceOfficerCtx } from '../../_auth'
import { notFound } from 'next/navigation'
import { FinanceOfficerPaymentForm } from './_payment_form'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: 'Impayée', partial: 'Partielle', paid: 'Réglée', cancelled: 'Annulée',
}
const STATUS_CLASS: Record<string, string> = {
  unpaid: 'border-red-300 bg-red-100 text-red-700',
  partial: 'border-amber-300 bg-amber-100 text-amber-700',
  paid: 'border-emerald-300 bg-emerald-100 text-emerald-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money',
  wave: 'Wave',
  orange_money: 'Orange Money', other: 'Autre',
}

type Props = { params: { invoiceId: string } }

export default async function FinanceOfficerInvoiceDetailPage({ params }: Props) {
  const { supabase, schoolId } = await requireFinanceOfficerCtx()

  const { data: rawInvoice } = await supabase
    .from('student_invoices')
    .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, created_at, cancellation_reason, cancelled_at, students!student_id(first_name, last_name), academic_years!academic_year_id(name)')
    .eq('id', params.invoiceId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawInvoice) notFound()
  type Inv = {
    id: string; invoice_number: string; title: string; total_amount: number; amount_paid: number
    status: string; due_date: string | null; created_at: string; cancellation_reason: string | null
    cancelled_at: string | null; students: { first_name: string; last_name: string } | null
    academic_years: { name: string } | null
  }
  const invoice = rawInvoice as unknown as Inv

  const [linesRes, paymentsRes] = await Promise.all([
    supabase.from('invoice_lines').select('id, description, amount, fee_item_id').eq('invoice_id', invoice.id).order('created_at'),
    supabase.from('student_payments').select('id, amount, payment_method, reference, paid_at, receipt_number').eq('invoice_id', invoice.id).order('paid_at', { ascending: false }),
  ])
  type LineRow = { id: string; description: string; amount: number; fee_item_id: string | null }
  type PayRow  = { id: string; amount: number; payment_method: string; reference: string | null; paid_at: string; receipt_number: string | null }
  const lines    = (linesRes.data ?? []) as LineRow[]
  const payments = (paymentsRes.data ?? []) as PayRow[]

  const balance = invoice.total_amount - invoice.amount_paid
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = invoice.due_date !== null && invoice.due_date < today && (invoice.status === 'unpaid' || invoice.status === 'partial')
  const studentName = invoice.students ? `${invoice.students.first_name} ${invoice.students.last_name}` : ''

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/finance-officer/invoices" className="text-primary-300 hover:text-white text-sm">← Factures</a>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-mono text-sm text-primary-300">{invoice.invoice_number}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[invoice.status] ?? STATUS_CLASS.unpaid}`}>
            {STATUS_LABEL[invoice.status] ?? invoice.status}
          </span>
          {isOverdue && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">En retard</span>}
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">{invoice.title}</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {studentName}{invoice.academic_years && <span> · {invoice.academic_years.name}</span>} · Échéance {fmtDate(invoice.due_date)}
        </p>
      </div>

      {/* Amount strip */}
      <div className="overflow-hidden rounded-xl grid grid-cols-3 shadow-sm">
        <div className="bg-primary-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{fmt(invoice.total_amount)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Total</p>
        </div>
        <div className="bg-emerald-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{fmt(invoice.amount_paid)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-1">Encaissé</p>
        </div>
        <div className={`px-4 py-4 text-center ${balance > 0 ? 'bg-red-600' : 'bg-gray-500'}`}>
          <p className="text-lg font-bold text-white">{fmt(balance)}</p>
          <p className={`text-xs font-semibold uppercase tracking-wider mt-1 ${balance > 0 ? 'text-red-200' : 'text-gray-300'}`}>Solde</p>
        </div>
      </div>

      {/* Lines */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Détail de la facture</h2>
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3 text-gray-800">
                    {line.description}{!line.fee_item_id && <span className="ml-2 text-xs text-gray-400">(personnalisé)</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900 whitespace-nowrap">{fmt(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-primary-50 border-t-2 border-primary-200">
                <td className="px-4 py-3 text-sm font-bold text-primary-800">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-primary-800 whitespace-nowrap">{fmt(invoice.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Payments */}
      {payments.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Paiements reçus</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Reçu</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDate(p.paid_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(p.amount)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a href={`/finance-officer/payments/${p.id}`} className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline">Voir reçu</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {invoice.status === 'cancelled' && (
        <div className="rounded-lg border border-gray-200 bg-gray-100 px-4 py-4">
          <p className="text-sm font-semibold text-gray-600 mb-1">Facture annulée</p>
          {invoice.cancellation_reason && <p className="text-sm text-gray-600"><span className="font-medium">Motif :</span> {invoice.cancellation_reason}</p>}
        </div>
      )}

      {/* Record a payment — only for payable invoices (unpaid/partial). */}
      {(invoice.status === 'unpaid' || invoice.status === 'partial') && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Enregistrer un paiement</h2>
          <div className="rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm">
            <FinanceOfficerPaymentForm invoiceId={invoice.id} balance={balance} />
          </div>
        </section>
      )}

      {invoice.status === 'paid' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✓ Cette facture est entièrement réglée.
        </div>
      )}
    </div>
  )
}
