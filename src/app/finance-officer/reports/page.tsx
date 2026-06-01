import { requireFinanceOfficerCtx } from '../_auth'

function fmt(n: number): string { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre',
}

export default async function FinanceOfficerReportsPage() {
  const { supabase, schoolId, schoolName } = await requireFinanceOfficerCtx()
  const today = new Date().toISOString().split('T')[0]

  const [invRes, overdueRes, payRes] = await Promise.all([
    supabase.from('student_invoices').select('total_amount, amount_paid, status').eq('school_id', schoolId).neq('status', 'cancelled'),
    supabase.from('student_invoices').select('total_amount, amount_paid').eq('school_id', schoolId).in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null),
    supabase.from('student_payments').select('amount, payment_method').eq('school_id', schoolId).limit(5000),
  ])

  const invoices = (invRes.data ?? []) as { total_amount: number; amount_paid: number; status: string }[]
  const totalInvoiced  = invoices.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const outstanding    = totalInvoiced - totalCollected
  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : null
  const countUnpaid  = invoices.filter((i) => i.status === 'unpaid').length
  const countPartial = invoices.filter((i) => i.status === 'partial').length
  const countPaid    = invoices.filter((i) => i.status === 'paid').length

  const overdue = (overdueRes.data ?? []) as { total_amount: number; amount_paid: number }[]
  const overdueBalance = overdue.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)

  const payments = (payRes.data ?? []) as { amount: number; payment_method: string }[]
  const byMethod = new Map<string, { count: number; total: number }>()
  for (const p of payments) {
    const e = byMethod.get(p.payment_method) ?? { count: 0, total: 0 }
    e.count += 1; e.total += p.amount
    byMethod.set(p.payment_method, e)
  }
  const methodRows = Array.from(byMethod.entries()).sort((a, b) => b[1].total - a[1].total)

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <a href="/finance-officer" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          <a href="/api/finance/export/report" className="rounded-lg border border-primary-600 bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 transition-colors">
            Exporter CSV (mois en cours)
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rapport financier</h1>
        <p className="text-primary-300 text-sm mt-0.5">{schoolName} · Lecture seule</p>
      </div>

      {/* KPI strip */}
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
          <p className="text-xl font-bold text-white leading-tight">{fmt(outstanding)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mt-1">En attente</p>
        </div>
        <div className="bg-sky-600 px-5 py-5 text-center">
          <p className="text-2xl font-bold text-white leading-tight">{collectionRate ?? '—'}%</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200 mt-1">Taux de recouvrement</p>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-bold text-red-800">{overdue.length} facture{overdue.length !== 1 ? 's' : ''} en retard</p>
          <p className="text-xs text-red-600 mt-0.5">Solde impayé : {fmt(overdueBalance)}</p>
        </div>
      )}

      {/* Status breakdown */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Répartition des factures</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-red-700">{countUnpaid}</p>
            <p className="text-xs font-medium text-red-600 mt-0.5">Impayées</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{countPartial}</p>
            <p className="text-xs font-medium text-amber-600 mt-0.5">Partielles</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{countPaid}</p>
            <p className="text-xs font-medium text-emerald-600 mt-0.5">Réglées</p>
          </div>
        </div>
      </section>

      {/* Payments by method */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Encaissements par mode</h2>
        {methodRows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
            <p className="text-sm text-gray-500">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Nombre</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {methodRows.map(([method, agg], idx) => (
                  <tr key={method} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-800">{METHOD_LABEL[method] ?? method}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{agg.count}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">{fmt(agg.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-primary-50 border-t-2 border-primary-200">
                  <td className="px-4 py-3 text-sm font-bold text-primary-800">Total</td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-primary-800">{payments.length}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-primary-800 whitespace-nowrap">{fmt(payments.reduce((s, p) => s + p.amount, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}
