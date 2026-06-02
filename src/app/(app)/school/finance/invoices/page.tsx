import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  unpaid:    'Impayée',
  partial:   'Partielle',
  paid:      'Réglée',
  cancelled: 'Annulée',
}

const STATUS_CLASS: Record<string, string> = {
  unpaid:    'border-red-200 bg-red-50 text-red-700',
  partial:   'border-amber-200 bg-amber-50 text-amber-700',
  paid:      'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}

type Props = {
  searchParams: { status?: string; created?: string; skipped?: string }
}

export default async function InvoicesPage({ searchParams }: Props) {
  const createdCount = searchParams.created ? parseInt(searchParams.created, 10) : null
  const skippedCount = searchParams.skipped ? parseInt(searchParams.skipped, 10) : null
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

  const today = new Date().toISOString().split('T')[0]

  const VALID_FILTERS = ['unpaid', 'partial', 'paid', 'cancelled', 'overdue']
  const statusFilter = VALID_FILTERS.includes(searchParams.status ?? '') ? searchParams.status! : null

  let query = supabase
    .from('student_invoices')
    .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, students!student_id(first_name, last_name)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  if (statusFilter === 'overdue') {
    query = query.in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null)
  } else if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data: rawInvoices } = await query

  type InvoiceRow = {
    id: string
    invoice_number: string
    title: string
    total_amount: number
    amount_paid: number
    status: string
    due_date: string | null
    students: { first_name: string; last_name: string }
  }
  const invoices = (rawInvoices ?? []) as unknown as InvoiceRow[]

  function isOverdue(inv: InvoiceRow): boolean {
    return inv.due_date !== null
      && inv.due_date < today
      && (inv.status === 'unpaid' || inv.status === 'partial')
  }

  const FILTERS = [
    { value: null,         label: 'Toutes' },
    { value: 'unpaid',    label: 'Impayées' },
    { value: 'partial',   label: 'Partielles' },
    { value: 'paid',      label: 'Réglées' },
    { value: 'overdue',   label: 'En retard' },
    { value: 'cancelled', label: 'Annulées' },
  ]

  const filterLabel = statusFilter === 'overdue' ? 'En retard'
    : statusFilter ? STATUS_LABEL[statusFilter]
    : null

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1">
              <a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finances</a>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Factures</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {invoices.length} facture{invoices.length !== 1 ? 's' : ''}
              {filterLabel ? ` · ${filterLabel}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/finance/export/invoices${statusFilter ? `?status=${statusFilter}` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Exporter CSV
            </a>
            <a
              href="/school/finance/invoices/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              + Nouvelle facture
            </a>
            <a
              href="/school/finance/invoices/bulk"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-400 bg-accent-50 px-4 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-100 transition-colors shadow-sm"
            >
              Par classe
            </a>
          </div>
        </div>
      </div>

      {/* ── Bulk creation success banner ────────────────────────────────────── */}
      {createdCount !== null && createdCount > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">
            ✓ {createdCount} facture{createdCount !== 1 ? 's' : ''} créée{createdCount !== 1 ? 's' : ''} avec succès.
          </p>
          {skippedCount !== null && skippedCount > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">
              {skippedCount} élève{skippedCount !== 1 ? 's' : ''} ignoré{skippedCount !== 1 ? 's' : ''} (facture existante avec le même titre et la même échéance).
            </p>
          )}
        </div>
      )}
      {createdCount === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            Aucune facture créée.
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            Tous les élèves actifs de cette classe avaient déjà une facture avec ce titre et cette échéance.
          </p>
        </div>
      )}

      {/* ── Filter tabs ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-sand-200 bg-sand-50 p-1">
        {FILTERS.map((f) => {
          const href = f.value ? `/school/finance/invoices?status=${f.value}` : '/school/finance/invoices'
          const active = statusFilter === f.value
          return (
            <a
              key={f.label}
              href={href}
              className={`flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </a>
          )
        })}
      </div>

      {/* ── Table / empty state ──────────────────────────────────────────────── */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucune facture</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter === 'overdue'
              ? 'Aucune facture en retard.'
              : statusFilter
              ? `Aucune facture avec le statut « ${STATUS_LABEL[statusFilter] ?? statusFilter} ».`
              : 'Créez la première facture pour un élève.'}
          </p>
          {!statusFilter && (
            <a
              href="/school/finance/invoices/new"
              className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
            >
              Créer une facture
            </a>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">N°</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Élève</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Titre</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Total</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Réglé</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Solde</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Échéance</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, idx) => {
                const balance  = inv.total_amount - inv.amount_paid
                const overdue  = isOverdue(inv)
                return (
                  <tr
                    key={inv.id}
                    className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      <a href={`/school/finance/invoices/${inv.id}`} className="hover:text-primary-700 hover:underline">
                        {inv.invoice_number}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <a href={`/school/finance/invoices/${inv.id}`} className="hover:text-primary-700 hover:underline">
                        {inv.students.first_name} {inv.students.last_name}
                      </a>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600 max-w-[160px] truncate">
                      {inv.title}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {fmt(inv.total_amount)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right text-emerald-700 whitespace-nowrap">
                      {fmt(inv.amount_paid)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right font-medium whitespace-nowrap">
                      <span className={balance > 0 ? 'text-red-600' : 'text-gray-400'}>
                        {fmt(balance)}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right whitespace-nowrap">
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {fmtDate(inv.due_date)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[inv.status] ?? STATUS_CLASS.unpaid}`}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                        {overdue && (
                          <span className="inline-block rounded-full border border-red-400 bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                            Retard
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

    </div>
  )
}
