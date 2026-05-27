import { requireStudentCtx } from '../_auth'

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-SN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' FCFA'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: 'Non payé', partial: 'Partiel', paid: 'Payé', cancelled: 'Annulé',
}
const STATUS_CLASS: Record<string, string> = {
  unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-gray-100 text-gray-500',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre',
}

type InvoiceRow = {
  id: string; title: string; total_amount: number; amount_paid: number
  status: string; due_date: string | null; invoice_number: string
}
type PaymentRow = {
  id: string; amount: number; payment_method: string; paid_at: string
  receipt_number: string | null; student_invoices: { title: string } | null
}

export default async function StudentFinancePage() {
  const { supabase, schoolId, student } = await requireStudentCtx()

  const [invRes, payRes] = await Promise.all([
    supabase
      .from('student_invoices')
      .select('id, title, total_amount, amount_paid, status, due_date, invoice_number')
      .eq('student_id', student.id)
      .eq('school_id', schoolId)
      .order('due_date', { ascending: false }),

    supabase
      .from('student_payments')
      .select('id, amount, payment_method, paid_at, receipt_number, student_invoices!invoice_id(title)')
      .eq('student_id', student.id)
      .eq('school_id', schoolId)
      .order('paid_at', { ascending: false })
      .limit(20),
  ])

  const invoices = (invRes.data ?? []) as InvoiceRow[]
  const payments = (payRes.data ?? []) as unknown as PaymentRow[]

  const totalInvoiced = invoices.reduce((s, i) => s + i.total_amount, 0)
  const totalPaid     = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const outstanding   = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Math.max(0, i.total_amount - i.amount_paid), 0)
  const overdueCount  = invoices.filter(
    (i) => ['unpaid', 'partial'].includes(i.status) && i.due_date && new Date(i.due_date) < new Date()
  ).length

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Ma finance</h1>
        <p className="mt-0.5 text-sm text-primary-300">{student.first_name} {student.last_name}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
          <p className="text-lg font-bold text-gray-900 truncate">{fmtCurrency(totalInvoiced)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Total facturé</p>
        </div>
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
          <p className="text-lg font-bold text-emerald-600 truncate">{fmtCurrency(totalPaid)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Payé</p>
        </div>
        <div className={`rounded-xl border shadow-sm px-4 py-4 text-center ${outstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-sand-200'}`}>
          <p className={`text-lg font-bold truncate ${outstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {fmtCurrency(outstanding)}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Solde dû</p>
        </div>
        <div className={`rounded-xl border shadow-sm px-4 py-4 text-center ${overdueCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-sand-200'}`}>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {overdueCount}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">En retard</p>
        </div>
      </div>

      {/* Invoices */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Mes factures</h2>
        {invoices.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-8 px-6 text-center">
            <p className="text-sm text-gray-500">Aucune facture pour le moment.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Facture</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Échéance</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Montant</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Payé</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Statut</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={inv.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[140px]">{inv.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">#{inv.invoice_number}</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600">
                      {inv.due_date ? fmtDate(inv.due_date) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">{fmtCurrency(inv.total_amount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmtCurrency(inv.amount_paid)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payment history */}
      {payments.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Historique des paiements</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Date</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Facture</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Montant</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Reçu</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-900">{fmtDate(p.paid_at)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600 truncate max-w-[160px]">
                      {(p.student_invoices as { title: string } | null)?.title ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{fmtCurrency(p.amount)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 font-mono">{p.receipt_number ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  )
}
