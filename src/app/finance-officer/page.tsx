import { requireFinanceOfficerCtx } from './_auth'

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: 'Impayée', partial: 'Partielle', paid: 'Réglée', cancelled: 'Annulée',
}
const STATUS_CLASS: Record<string, string> = {
  unpaid: 'border-red-200 bg-red-50 text-red-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-700',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre',
}

export default async function FinanceOfficerDashboard() {
  const { supabase, schoolId, schoolName } = await requireFinanceOfficerCtx()
  const today = new Date().toISOString().split('T')[0]

  const [allInvoicesRes, overdueRes, recentInvRes, recentPayRes] = await Promise.all([
    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid, status')
      .eq('school_id', schoolId)
      .neq('status', 'cancelled'),

    supabase
      .from('student_invoices')
      .select('id, invoice_number, total_amount, amount_paid, due_date, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .in('status', ['unpaid', 'partial'])
      .lt('due_date', today)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(6),

    supabase
      .from('student_invoices')
      .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(6),

    supabase
      .from('student_payments')
      .select('id, amount, payment_method, paid_at, receipt_number, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .order('paid_at', { ascending: false })
      .limit(6),
  ])

  const invoices = (allInvoicesRes.data ?? []) as { total_amount: number; amount_paid: number; status: string }[]
  const totalInvoiced    = invoices.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected   = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const totalOutstanding = totalInvoiced - totalCollected

  type OverdueRow = { id: string; invoice_number: string; total_amount: number; amount_paid: number; due_date: string | null; students: { first_name: string; last_name: string } }
  const overdue = (overdueRes.data ?? []) as unknown as OverdueRow[]

  type RecentInv = { id: string; invoice_number: string; title: string; total_amount: number; amount_paid: number; status: string; due_date: string | null; students: { first_name: string; last_name: string } }
  const recentInvoices = (recentInvRes.data ?? []) as unknown as RecentInv[]

  type RecentPay = { id: string; amount: number; payment_method: string; paid_at: string; receipt_number: string | null; students: { first_name: string; last_name: string } }
  const recentPayments = (recentPayRes.data ?? []) as unknown as RecentPay[]

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Bureau du comptable</h1>
        <p className="text-primary-300 text-sm mt-0.5">{schoolName}</p>
      </div>

      {/* Stat strip */}
      <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm">
        <div className="bg-primary-600 px-5 py-5 text-center">
          <p className="text-xl font-bold text-white leading-tight">{fmt(totalInvoiced)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Facturé</p>
        </div>
        <div className="bg-emerald-600 px-5 py-5 text-center">
          <p className="text-xl font-bold text-white leading-tight">{fmt(totalCollected)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-1">Encaissé</p>
        </div>
        <div className="bg-amber-500 px-5 py-5 text-center">
          <p className="text-xl font-bold text-white leading-tight">{fmt(totalOutstanding)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mt-1">En attente</p>
        </div>
        <div className="bg-red-600 px-5 py-5 text-center">
          <p className="text-2xl font-bold text-white leading-tight">{overdue.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-200 mt-1">En retard</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3">
        <a href="/finance-officer/invoices" className="flex items-center justify-center gap-2 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">📋 Factures</a>
        <a href="/finance-officer/payments" className="flex items-center justify-center gap-2 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">📒 Paiements</a>
        <a href="/finance-officer/reports" className="flex items-center justify-center gap-2 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">📊 Rapports</a>
      </div>

      {/* Overdue invoices */}
      {overdue.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Factures en retard</h2>
            <a href="/finance-officer/invoices?status=overdue" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">Voir toutes →</a>
          </div>
          <div className="overflow-hidden rounded-xl border border-red-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {overdue.map((inv, idx) => (
                  <tr key={inv.id} className={`border-b border-red-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-red-50/40'}`}>
                    <td className="px-4 py-3">
                      <a href={`/finance-officer/invoices/${inv.id}`} className="font-medium text-gray-900 hover:text-primary-700 hover:underline">
                        {inv.students.first_name} {inv.students.last_name}
                      </a>
                      <p className="font-mono text-xs text-gray-400">{inv.invoice_number}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-600 whitespace-nowrap">{fmt(inv.total_amount - inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right text-xs text-red-500 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* Recent payments */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Paiements récents</h2>
          <a href="/finance-officer/payments" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">Journal →</a>
        </div>
        {recentPayments.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
            <p className="text-sm text-gray-500">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {recentPayments.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3">
                      <a href={`/finance-officer/payments/${p.id}`} className="font-medium text-gray-900 hover:text-primary-700 hover:underline">
                        {p.students.first_name} {p.students.last_name}
                      </a>
                      <p className="text-xs text-gray-400">{METHOD_LABEL[p.payment_method] ?? p.payment_method} · {fmtDate(p.paid_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {/* Recent invoices */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Factures récentes</h2>
          <a href="/finance-officer/invoices" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">Voir toutes →</a>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
            <p className="text-sm text-gray-500">Aucune facture.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {recentInvoices.map((inv, idx) => (
                  <tr key={inv.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3">
                      <a href={`/finance-officer/invoices/${inv.id}`} className="font-medium text-gray-900 hover:text-primary-700 hover:underline">
                        {inv.students.first_name} {inv.students.last_name}
                      </a>
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{inv.title}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800 whitespace-nowrap">{fmt(inv.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[inv.status] ?? STATUS_CLASS.unpaid}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
