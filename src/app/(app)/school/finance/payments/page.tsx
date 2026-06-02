import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const METHOD_LABEL: Record<string, string> = {
  cash:                'Espèces',
  bank_transfer:       'Virement',
  cheque:              'Chèque',
  wave_manual:         'Wave',
  orange_money_manual: 'Orange Money',
  other:               'Autre',
}

const METHODS = [
  { value: '',                    label: 'Tous modes' },
  { value: 'cash',                label: 'Espèces' },
  { value: 'bank_transfer',       label: 'Virement' },
  { value: 'cheque',              label: 'Chèque' },
  { value: 'wave_manual',         label: 'Wave' },
  { value: 'orange_money_manual', label: 'Orange Money' },
  { value: 'other',               label: 'Autre' },
]

const VALID_METHODS = ['cash', 'bank_transfer', 'cheque', 'wave_manual', 'orange_money_manual', 'other']

type Props = {
  searchParams: {
    date_from?: string
    date_to?: string
    method?: string
    q?: string
  }
}

export default async function PaymentsLedgerPage({ searchParams }: Props) {
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

  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date_from ?? '') ? searchParams.date_from! : null
  const dateTo   = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date_to   ?? '') ? searchParams.date_to!   : null
  const method   = VALID_METHODS.includes(searchParams.method ?? '') ? searchParams.method! : null
  const q        = searchParams.q?.trim() ?? ''

  // Resolve student IDs for name search
  let studentIds: string[] = []
  if (q) {
    const { data: matched } = await supabase
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    studentIds = ((matched ?? []) as { id: string }[]).map((s) => s.id)
  }

  let query = supabase
    .from('student_payments')
    .select(`
      id, receipt_number, amount, payment_method, reference, paid_at,
      students!student_id(first_name, last_name),
      student_invoices!invoice_id(id, invoice_number, title)
    `)
    .eq('school_id', schoolId)
    .order('paid_at', { ascending: false })

  if (dateFrom) query = query.gte('paid_at', `${dateFrom}T00:00:00.000Z`)
  if (dateTo)   query = query.lte('paid_at', `${dateTo}T23:59:59.999Z`)
  if (method)   query = query.eq('payment_method', method)

  if (q) {
    const orParts = [`receipt_number.ilike.%${q}%`]
    if (studentIds.length > 0) orParts.push(`student_id.in.(${studentIds.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const { data: rawPayments } = await query

  type PaymentRow = {
    id: string
    receipt_number: string | null
    amount: number
    payment_method: string
    reference: string | null
    paid_at: string
    students: { first_name: string; last_name: string }
    student_invoices: { id: string; invoice_number: string; title: string } | null
  }
  const payments    = (rawPayments ?? []) as unknown as PaymentRow[]
  const totalAmount = payments.reduce((s, p) => s + p.amount, 0)
  const hasFilter   = !!(dateFrom || dateTo || method || q)

  // CSV export carries the current filters.
  const exportParams = new URLSearchParams()
  if (dateFrom) exportParams.set('date_from', dateFrom)
  if (dateTo)   exportParams.set('date_to', dateTo)
  if (method)   exportParams.set('method', method)
  if (q)        exportParams.set('q', q)
  const exportHref = `/api/finance/export/payments${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1">
              <a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finances</a>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Journal des paiements</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {payments.length} paiement{payments.length !== 1 ? 's' : ''}
              {totalAmount > 0 ? ` · ${fmt(totalAmount)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Exporter CSV
            </a>
            <a
              href="/school/finance/payments/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              + Enregistrer paiement
            </a>
          </div>
        </div>
      </div>

      {/* ── Filter form ──────────────────────────────────────────────────────── */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div>
          <label htmlFor="date_from" className="block text-xs font-medium text-gray-600 mb-1">Du</label>
          <input
            id="date_from"
            name="date_from"
            type="date"
            defaultValue={dateFrom ?? ''}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="date_to" className="block text-xs font-medium text-gray-600 mb-1">Au</label>
          <input
            id="date_to"
            name="date_to"
            type="date"
            defaultValue={dateTo ?? ''}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="method" className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
          <select
            id="method"
            name="method"
            defaultValue={method ?? ''}
            className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="q" className="block text-xs font-medium text-gray-600 mb-1">Recherche</label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Élève ou N° reçu…"
            defaultValue={q}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            Filtrer
          </button>
          {hasFilter && (
            <a
              href="/school/finance/payments"
              className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-sand-100 transition-colors"
            >
              Tout afficher
            </a>
          )}
        </div>
      </form>

      {/* ── Total strip ─────────────────────────────────────────────────────── */}
      {payments.length > 0 && (
        <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-3 shadow-sm">
          <div className="bg-emerald-600 px-5 py-4 text-center">
            <p className="text-xl font-bold text-white">{fmt(totalAmount)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">Encaissé</p>
          </div>
          <div className="bg-primary-700 px-5 py-4 text-center">
            <p className="text-xl font-bold text-white">{payments.length}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Paiements</p>
          </div>
          <div className="hidden sm:block bg-primary-600 px-5 py-4 text-center">
            <p className="text-xl font-bold text-white">
              {fmt(Math.round(totalAmount / payments.length))}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Moyenne</p>
          </div>
        </div>
      )}

      {/* ── Table / empty state ──────────────────────────────────────────────── */}
      {payments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucun paiement</h3>
          <p className="mt-1 text-sm text-gray-500">
            {hasFilter ? 'Aucun résultat pour ces filtres.' : 'Aucun paiement enregistré.'}
          </p>
          {!hasFilter && (
            <a
              href="/school/finance/payments/new"
              className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
            >
              Enregistrer un paiement
            </a>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">N° Reçu</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Élève</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Facture</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Montant</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Mode</th>
                <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, idx) => (
                <tr
                  key={p.id}
                  className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                    {p.receipt_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {p.students.first_name} {p.students.last_name}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-600 max-w-[180px]">
                    {p.student_invoices ? (
                      <div>
                        <span className="font-mono text-xs text-gray-400">{p.student_invoices.invoice_number}</span>
                        <p className="text-xs text-gray-500 truncate">{p.student_invoices.title}</p>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                    {fmt(p.amount)}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-600">
                    {METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {fmtDateTime(p.paid_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <a
                      href={`/school/finance/payments/${p.id}`}
                      className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
                    >
                      Reçu
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

    </div>
  )
}
