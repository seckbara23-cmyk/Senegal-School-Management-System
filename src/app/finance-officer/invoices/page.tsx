import { requireFinanceOfficerCtx } from '../_auth'

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

const STATUS_TABS = [
  { value: '',         label: 'Toutes' },
  { value: 'unpaid',   label: 'Impayées' },
  { value: 'partial',  label: 'Partielles' },
  { value: 'paid',     label: 'Réglées' },
  { value: 'overdue',  label: 'En retard' },
]
const VALID_STATUS = ['unpaid', 'partial', 'paid', 'cancelled']
const PAGE_SIZE = 25

type Props = { searchParams: { status?: string; q?: string; page?: string } }

export default async function FinanceOfficerInvoicesPage({ searchParams }: Props) {
  const { supabase, schoolId } = await requireFinanceOfficerCtx()
  const today = new Date().toISOString().split('T')[0]

  const statusParam = searchParams.status ?? ''
  const q = searchParams.q?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  // Name search → resolve student IDs first.
  let studentIds: string[] = []
  if (q) {
    const { data: matched } = await supabase
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    studentIds = ((matched ?? []) as { id: string }[]).map((s) => s.id)
  }

  const orParts = q ? [`invoice_number.ilike.%${q}%`, ...(studentIds.length > 0 ? [`student_id.in.(${studentIds.join(',')})`] : [])].join(',') : null

  let countQuery = supabase.from('student_invoices').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
  let dataQuery = supabase
    .from('student_invoices')
    .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, students!student_id(first_name, last_name)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (statusParam === 'overdue') {
    countQuery = countQuery.in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null)
    dataQuery = dataQuery.in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null)
  } else if (VALID_STATUS.includes(statusParam)) {
    countQuery = countQuery.eq('status', statusParam)
    dataQuery = dataQuery.eq('status', statusParam)
  }
  if (orParts) {
    countQuery = countQuery.or(orParts)
    dataQuery = dataQuery.or(orParts)
  }

  const [{ count }, { data: rawInvoices }] = await Promise.all([countQuery, dataQuery])

  type Row = {
    id: string; invoice_number: string; title: string; total_amount: number; amount_paid: number
    status: string; due_date: string | null; students: { first_name: string; last_name: string }
  }
  const invoices = (rawInvoices ?? []) as unknown as Row[]
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const hasFilter = !!(statusParam || q)

  const pageUrl = (p: number) => {
    const params = new URLSearchParams()
    if (statusParam) params.set('status', statusParam)
    if (q)           params.set('q', q)
    if (p > 1)       params.set('page', String(p))
    const qs = params.toString()
    return `/finance-officer/invoices${qs ? `?${qs}` : ''}`
  }

  function isOverdue(inv: Row): boolean {
    return inv.due_date !== null && inv.due_date < today && (inv.status === 'unpaid' || inv.status === 'partial')
  }

  const exportParams = new URLSearchParams()
  if (statusParam) exportParams.set('status', statusParam)
  if (q)           exportParams.set('q', q)
  const exportHref = `/api/finance/export/invoices${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <a href="/finance-officer" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          <a href={exportHref} className="rounded-lg border border-primary-600 bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 transition-colors">
            Exporter CSV
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Factures</h1>
        <p className="text-primary-300 text-sm mt-0.5">{totalCount} facture{totalCount !== 1 ? 's' : ''}</p>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const active = statusParam === t.value
          const href = t.value ? `/finance-officer/invoices?status=${t.value}` : '/finance-officer/invoices'
          return (
            <a
              key={t.value || 'all'}
              href={href}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                active ? 'bg-primary-700 text-white shadow-sm' : 'bg-white border border-sand-200 text-gray-700 hover:bg-sand-100'
              }`}
            >
              {t.label}
            </a>
          )
        })}
      </div>

      {/* Search */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        {statusParam && <input type="hidden" name="status" value={statusParam} />}
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="q" className="block text-xs font-medium text-gray-600 mb-1">Recherche</label>
          <input
            id="q" name="q" type="search" placeholder="Élève ou N° de facture…" defaultValue={q}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Filtrer</button>
          {hasFilter && (
            <a href="/finance-officer/invoices" className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-sand-100 transition-colors">Réinitialiser</a>
          )}
        </div>
      </form>

      {invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune facture</p>
          <p className="mt-1 text-sm text-gray-400">{hasFilter ? 'Aucun résultat pour ces filtres.' : 'Aucune facture pour le moment.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">N°</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Élève</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Total</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Solde</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, idx) => {
                const overdue = isOverdue(inv)
                const balance = inv.total_amount - inv.amount_paid
                return (
                  <tr key={inv.id} className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      <a href={`/finance-officer/invoices/${inv.id}`} className="hover:text-primary-700 hover:underline">{inv.invoice_number}</a>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <a href={`/finance-officer/invoices/${inv.id}`} className="hover:text-primary-700 hover:underline">
                        {inv.students.first_name} {inv.students.last_name}
                      </a>
                      <p className="text-xs text-gray-400 truncate max-w-[180px] sm:hidden">{fmt(inv.total_amount)} · {fmtDate(inv.due_date)}</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right font-mono text-gray-800 whitespace-nowrap">{fmt(inv.total_amount)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right font-mono whitespace-nowrap">
                      <span className={balance > 0 ? 'text-red-600' : 'text-gray-400'}>{fmt(balance)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[inv.status] ?? STATUS_CLASS.unpaid}`}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                        {overdue && (
                          <span className="inline-block rounded-full border border-red-400 bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Retard</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} sur {totalCount}</p>
          <div className="flex items-center gap-2">
            {page > 1
              ? <a href={pageUrl(page - 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">← Précédent</a>
              : <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300">← Précédent</span>}
            <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
            {page < totalPages
              ? <a href={pageUrl(page + 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">Suivant →</a>
              : <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300">Suivant →</span>}
          </div>
        </div>
      )}
    </div>
  )
}
