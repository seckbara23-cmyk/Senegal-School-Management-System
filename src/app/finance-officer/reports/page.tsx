import { requireFinanceOfficerCtx } from '../_auth'

function fmt(n: number): string { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }
function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque',
  wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre',
}

type Props = { searchParams: { date_from?: string; date_to?: string } }

export default async function FinanceOfficerReportsPage({ searchParams }: Props) {
  const { supabase, schoolId, schoolName } = await requireFinanceOfficerCtx()

  // Default range: current month → today (identical to the export route default).
  const now         = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo   = now.toISOString().split('T')[0]
  const today       = defaultTo

  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date_from ?? '') ? searchParams.date_from! : defaultFrom
  const dateTo   = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date_to   ?? '') ? searchParams.date_to!   : defaultTo
  const isDefaultRange = dateFrom === defaultFrom && dateTo === defaultTo

  const fromTs = `${dateFrom}T00:00:00.000Z`
  const toTs   = `${dateTo}T23:59:59.999Z`

  const [invoicedRes, paymentsRes, activeBalRes, overdueRes] = await Promise.all([
    // Invoiced during period (created_at, non-cancelled)
    supabase.from('student_invoices').select('total_amount').eq('school_id', schoolId).neq('status', 'cancelled').gte('created_at', fromTs).lte('created_at', toTs),
    // Payments during period (with method for breakdown)
    supabase.from('student_payments').select('amount, payment_method').eq('school_id', schoolId).gte('paid_at', fromTs).lte('paid_at', toTs),
    // Snapshot: all active invoices → outstanding now
    supabase.from('student_invoices').select('total_amount, amount_paid').eq('school_id', schoolId).neq('status', 'cancelled'),
    // Snapshot: overdue now
    supabase.from('student_invoices').select('total_amount, amount_paid').eq('school_id', schoolId).in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null),
  ])

  const invoiced = (invoicedRes.data ?? []) as { total_amount: number }[]
  const payments = (paymentsRes.data ?? []) as { amount: number; payment_method: string }[]
  const active   = (activeBalRes.data ?? []) as { total_amount: number; amount_paid: number }[]
  const overdue  = (overdueRes.data ?? []) as { total_amount: number; amount_paid: number }[]

  const totalInvoiced  = invoiced.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected = payments.reduce((s, p) => s + p.amount, 0)
  const paymentCount   = payments.length
  const outstanding    = active.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const overdueBalance = overdue.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)

  const byMethod = new Map<string, { count: number; total: number }>()
  for (const p of payments) {
    const e = byMethod.get(p.payment_method) ?? { count: 0, total: 0 }
    e.count += 1; e.total += p.amount
    byMethod.set(p.payment_method, e)
  }
  const methodRows = Array.from(byMethod.entries()).sort((a, b) => b[1].total - a[1].total)

  const exportHref = `/api/finance/export/report?date_from=${dateFrom}&date_to=${dateTo}`

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/finance-officer" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Rapport financier</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {schoolName} · {isDefaultRange ? 'Mois en cours' : `${fmtLong(dateFrom)} – ${fmtLong(dateTo)}`}
            </p>
          </div>
          <a href={exportHref} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">
            Exporter CSV
          </a>
        </div>
      </div>

      {/* Date range filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div>
          <label htmlFor="date_from" className="block text-xs font-medium text-gray-600 mb-1">Du</label>
          <input id="date_from" name="date_from" type="date" defaultValue={dateFrom} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="date_to" className="block text-xs font-medium text-gray-600 mb-1">Au</label>
          <input id="date_to" name="date_to" type="date" defaultValue={dateTo} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Afficher</button>
          {!isDefaultRange && (
            <a href="/finance-officer/reports" className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-sand-100 transition-colors">Mois courant</a>
          )}
        </div>
      </form>

      {/* Period KPIs (match the CSV export) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Sur la période sélectionnée</p>
        <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-3 shadow-sm">
          <div className="bg-primary-600 px-5 py-5 text-center">
            <p className="text-xl font-bold text-white">{fmt(totalInvoiced)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Facturé</p>
          </div>
          <div className="bg-emerald-600 px-5 py-5 text-center">
            <p className="text-xl font-bold text-white">{fmt(totalCollected)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-1">Encaissé</p>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-sky-600 px-5 py-5 text-center">
            <p className="text-xl font-bold text-white">{paymentCount}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-200 mt-1">Paiements</p>
          </div>
        </div>
      </div>

      {/* Snapshot KPIs (current, all periods) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Situation actuelle (instantané, toutes périodes)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-center">
            <p className="text-lg font-bold text-amber-700">{fmt(outstanding)}</p>
            <p className="text-xs font-medium text-amber-600 mt-0.5">Solde en attente</p>
          </div>
          <div className={`rounded-lg border px-4 py-4 text-center ${overdueBalance > 0 ? 'border-red-200 bg-red-50' : 'border-sand-200 bg-sand-50'}`}>
            <p className={`text-lg font-bold ${overdueBalance > 0 ? 'text-red-700' : 'text-gray-400'}`}>{fmt(overdueBalance)}</p>
            <p className={`text-xs font-medium mt-0.5 ${overdueBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>En retard</p>
          </div>
        </div>
      </div>

      {/* Payments by method (period) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Encaissements par mode (période)</h2>
        {methodRows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
            <p className="text-sm text-gray-500">Aucun paiement sur cette période.</p>
            <p className="mt-1 text-xs text-gray-400">Essayez d&apos;élargir la plage de dates.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Nombre</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {methodRows.map(([method, agg], idx) => (
                  <tr key={method} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-800">{METHOD_LABEL[method] ?? method}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{agg.count}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">{fmt(agg.total)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{totalCollected > 0 ? `${Math.round((agg.total / totalCollected) * 100)} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-primary-50 border-t-2 border-primary-200">
                  <td className="px-4 py-3 text-sm font-bold text-primary-800">Total</td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-primary-800">{paymentCount}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-primary-800 whitespace-nowrap">{fmt(totalCollected)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-primary-800">100 %</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}
