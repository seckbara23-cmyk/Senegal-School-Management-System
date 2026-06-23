import { requireParentCtx } from '../../../_auth'
import { notFound } from 'next/navigation'
import { deriveInstallments, INSTALLMENT_STATUS_LABEL } from '@/lib/finance/payment-plans'
import { enabledProvidersForSchool } from '@/lib/payments/config'
import { PayPanel } from './_pay'

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
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
  wave_manual: 'Wave', orange_money_manual: 'Orange Money',
  wave: 'Wave',
  orange_money: 'Orange Money', other: 'Autre',
}

type Props = { params: { invoiceId: string } }

export default async function ParentInvoiceDetailPage({ params }: Props) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  // Linked children — ownership is checked against this set (never the URL alone).
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parent.id)
  const childIds = new Set((links ?? []).map((l) => (l as { student_id: string }).student_id))

  const { data: rawInv } = await supabase
    .from('student_invoices')
    .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, created_at, student_id, students!student_id(first_name, last_name)')
    .eq('id', params.invoiceId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawInv) notFound()
  type Inv = {
    id: string; invoice_number: string; title: string; total_amount: number; amount_paid: number
    status: string; due_date: string | null; created_at: string; student_id: string
    students: { first_name: string; last_name: string } | null
  }
  const inv = rawInv as unknown as Inv

  // Ownership: the invoice's student must be a linked child.
  if (!childIds.has(inv.student_id)) notFound()

  const [linesRes, paymentsRes, planRes] = await Promise.all([
    supabase.from('invoice_lines').select('id, description, amount, fee_item_id').eq('invoice_id', inv.id).order('created_at'),
    supabase.from('student_payments').select('id, amount, payment_method, paid_at, receipt_number').eq('invoice_id', inv.id).order('paid_at', { ascending: false }),
    supabase.from('payment_plans').select('name, payment_plan_installments(sequence, amount, due_date)').eq('invoice_id', inv.id).eq('school_id', schoolId).maybeSingle(),
  ])
  type LineRow = { id: string; description: string; amount: number; fee_item_id: string | null }
  type PayRow  = { id: string; amount: number; payment_method: string; paid_at: string; receipt_number: string | null }
  const lines    = (linesRes.data ?? []) as LineRow[]
  const payments = (paymentsRes.data ?? []) as PayRow[]

  const balance = inv.total_amount - inv.amount_paid
  const today = new Date().toISOString().split('T')[0]

  type PlanRow = { name: string; payment_plan_installments: { sequence: number; amount: number; due_date: string | null }[] }
  const plan = planRes.data as unknown as PlanRow | null
  const planInstallments = plan
    ? deriveInstallments([...(plan.payment_plan_installments ?? [])].sort((a, b) => a.sequence - b.sequence), inv.amount_paid, today)
    : []

  // Online payment: which providers are enabled + a plan-aware default amount.
  const payable = balance > 0 && (inv.status === 'unpaid' || inv.status === 'partial')
  const providers = payable ? await enabledProvidersForSchool(schoolId) : []
  const nextInstallment = planInstallments.find((i) => i.status !== 'paid')
  const defaultAmount = nextInstallment ? Math.min(nextInstallment.remaining || nextInstallment.amount, balance) : balance
  const isOverdue = inv.due_date !== null && inv.due_date < today && (inv.status === 'unpaid' || inv.status === 'partial')
  const childName = inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : ''

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/parent/finance" className="text-primary-300 hover:text-white text-sm">← Finance</a>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-mono text-sm text-primary-300">#{inv.invoice_number}</span>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[inv.status] ?? inv.status}
          </span>
          {isOverdue && (
            <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">En retard</span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white">{inv.title}</h1>
        <p className="mt-0.5 text-sm text-primary-300">{childName} · Échéance {fmtDate(inv.due_date)}</p>
      </div>

      {/* Amount strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-3 py-4 text-center">
          <p className="text-base font-bold text-gray-900 truncate">{fmt(inv.total_amount)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Total</p>
        </div>
        <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-3 py-4 text-center">
          <p className="text-base font-bold text-emerald-600 truncate">{fmt(inv.amount_paid)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Payé</p>
        </div>
        <div className={`rounded-xl border shadow-sm px-3 py-4 text-center ${balance > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-sand-200'}`}>
          <p className={`text-base font-bold truncate ${balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(balance)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Solde</p>
        </div>
      </div>

      {/* Pay online */}
      {payable && providers.length > 0 && (
        <PayPanel invoiceId={inv.id} balance={balance} providers={providers} defaultAmount={defaultAmount} />
      )}

      {/* Lines */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Détail</h2>
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3 text-gray-800">{line.description}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900 whitespace-nowrap">{fmt(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-primary-50 border-t-2 border-primary-200">
                <td className="px-4 py-3 text-sm font-bold text-primary-800">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-primary-800 whitespace-nowrap">{fmt(inv.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Échéancier */}
      {plan && planInstallments.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Échéancier · {plan.name}</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {planInstallments.map((inst, idx) => (
                  <tr key={inst.sequence} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-500">{inst.sequence}</td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{fmtDate(inst.due_date)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 whitespace-nowrap">{fmt(inst.amount)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        inst.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                        : inst.overdue ? 'bg-red-100 text-red-700'
                        : inst.status === 'partial' ? 'bg-amber-100 text-amber-700'
                        : 'bg-sand-100 text-gray-500'}`}>
                        {inst.overdue && inst.status !== 'paid' ? 'En retard' : INSTALLMENT_STATUS_LABEL[inst.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Paiements</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Montant</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Reçu</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-900">{fmtDate(p.paid_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{fmt(p.amount)}</td>
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
