import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const METHOD_LABEL: Record<string, string> = {
  cash:                'Espèces',
  bank_transfer:       'Virement bancaire',
  cheque:              'Chèque',
  wave_manual:         'Wave',
  orange_money_manual: 'Orange Money',
  wave: 'Wave',
  orange_money: 'Orange Money',
  other:               'Autre',
}

type Props = {
  searchParams: { date_from?: string; date_to?: string }
}

export default async function FinanceReportsPage({ searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  // Default: current month
  const now         = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo   = now.toISOString().split('T')[0]
  const today       = defaultTo

  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date_from ?? '') ? searchParams.date_from! : defaultFrom
  const dateTo   = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date_to   ?? '') ? searchParams.date_to!   : defaultTo

  const fromTs = `${dateFrom}T00:00:00.000Z`
  const toTs   = `${dateTo}T23:59:59.999Z`

  const [invoicedRes, paymentsRes, activeBalRes, overdueRes, cancelledRes] = await Promise.all([
    // Invoices created in period (non-cancelled)
    supabase
      .from('student_invoices')
      .select('total_amount')
      .eq('school_id', schoolId)
      .neq('status', 'cancelled')
      .gte('created_at', fromTs)
      .lte('created_at', toTs),

    // Payments in period (with method for breakdown)
    supabase
      .from('student_payments')
      .select('amount, payment_method')
      .eq('school_id', schoolId)
      .gte('paid_at', fromTs)
      .lte('paid_at', toTs),

    // All active (non-cancelled) invoices — outstanding balance snapshot (today)
    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid')
      .eq('school_id', schoolId)
      .neq('status', 'cancelled'),

    // Overdue today
    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid')
      .eq('school_id', schoolId)
      .in('status', ['unpaid', 'partial'])
      .lt('due_date', today)
      .not('due_date', 'is', null),

    // Invoices cancelled in period (using cancelled_at)
    supabase
      .from('student_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'cancelled')
      .not('cancelled_at', 'is', null)
      .gte('cancelled_at', fromTs)
      .lte('cancelled_at', toTs),
  ])

  type InvRow  = { total_amount: number }
  type PayRow  = { amount: number; payment_method: string }
  type BalRow  = { total_amount: number; amount_paid: number }

  const invoicedInPeriod = (invoicedRes.data ?? []) as InvRow[]
  const paymentsInPeriod = (paymentsRes.data ?? []) as PayRow[]
  const activeInvoices   = (activeBalRes.data ?? []) as BalRow[]
  const overdueInvoices  = (overdueRes.data ?? []) as BalRow[]

  const totalInvoiced      = invoicedInPeriod.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected     = paymentsInPeriod.reduce((s, p) => s + p.amount, 0)
  const paymentCount       = paymentsInPeriod.length
  const outstandingBalance = activeInvoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const overdueBalance     = overdueInvoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)
  const cancelledCount     = cancelledRes.count ?? 0

  // Payment breakdown by method
  const byMethod: Record<string, number> = {}
  for (const p of paymentsInPeriod) {
    byMethod[p.payment_method] = (byMethod[p.payment_method] ?? 0) + p.amount
  }
  const methodEntries = Object.entries(byMethod).sort((a, b) => b[1] - a[1])

  const isDefaultRange = dateFrom === defaultFrom && dateTo === defaultTo

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finances</a>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Rapport financier</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {isDefaultRange ? 'Mois en cours' : `${fmtLong(dateFrom)} – ${fmtLong(dateTo)}`}
            </p>
          </div>
          <a
            href={`/api/finance/export/report?date_from=${dateFrom}&date_to=${dateTo}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
          >
            Exporter CSV
          </a>
        </div>
      </div>

      {/* ── Date range filter ────────────────────────────────────────────────── */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div>
          <label htmlFor="date_from" className="block text-xs font-medium text-gray-600 mb-1">Du</label>
          <input
            id="date_from"
            name="date_from"
            type="date"
            defaultValue={dateFrom}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="date_to" className="block text-xs font-medium text-gray-600 mb-1">Au</label>
          <input
            id="date_to"
            name="date_to"
            type="date"
            defaultValue={dateTo}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            Afficher
          </button>
          {!isDefaultRange && (
            <a
              href="/school/finance/reports"
              className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-sand-100 transition-colors"
            >
              Mois courant
            </a>
          )}
        </div>
      </form>

      {/* ── Period KPIs ─────────────────────────────────────────────────────── */}
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

      {/* ── Snapshot KPIs (today) ────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Situation actuelle (toutes périodes)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-center">
            <p className="text-lg font-bold text-amber-700">{fmt(outstandingBalance)}</p>
            <p className="text-xs font-medium text-amber-600 mt-0.5">Solde en attente</p>
          </div>
          <div className={`rounded-lg border px-4 py-4 text-center ${overdueBalance > 0 ? 'border-red-200 bg-red-50' : 'border-sand-200 bg-sand-50'}`}>
            <p className={`text-lg font-bold ${overdueBalance > 0 ? 'text-red-700' : 'text-gray-400'}`}>
              {fmt(overdueBalance)}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${overdueBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              En retard
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-center">
            <p className="text-lg font-bold text-gray-500">{cancelledCount}</p>
            <p className="text-xs font-medium text-gray-400 mt-0.5">Annulées (période)</p>
          </div>
        </div>
      </div>

      {/* ── Payment method breakdown ─────────────────────────────────────────── */}
      {methodEntries.length > 0 ? (
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Encaissements par mode de paiement</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {methodEntries.map(([method, amount], idx) => (
                  <tr key={method} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-800">{METHOD_LABEL[method] ?? method}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {totalCollected > 0 ? `${Math.round((amount / totalCollected) * 100)} %` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary-200 bg-primary-50">
                  <td className="px-4 py-3 text-sm font-bold text-primary-800">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-primary-800 whitespace-nowrap">{fmt(totalCollected)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-primary-800">100 %</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
          <p className="text-sm font-semibold text-gray-600">Aucun paiement sur cette période.</p>
          <p className="mt-1 text-xs text-gray-400">
            Essayez d&apos;élargir la plage de dates.
          </p>
        </div>
      )}

      {/* ── Navigation links ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 border-t border-sand-200 pt-4">
        <a href="/school/finance/payments" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">
          Journal des paiements →
        </a>
        <a href="/school/finance/invoices" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">
          Toutes les factures →
        </a>
        <a href="/school/finance/invoices?status=overdue" className="text-sm text-red-600 hover:text-red-800 hover:underline">
          Factures en retard →
        </a>
      </div>

    </div>
  )
}
