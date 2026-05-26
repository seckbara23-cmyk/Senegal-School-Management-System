import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

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
  params: { studentId: string }
}

export default async function StudentFinancePage({ params }: Props) {
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

  // Verify student belongs to this school + fetch all invoices in parallel
  const [studentRes, invoicesRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name')
      .eq('id', params.studentId)
      .eq('school_id', schoolId)
      .maybeSingle(),

    supabase
      .from('student_invoices')
      .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, created_at')
      .eq('student_id', params.studentId)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false }),
  ])

  if (!studentRes.data) notFound()
  const student = studentRes.data as { id: string; first_name: string; last_name: string }

  type InvoiceRow = {
    id: string
    invoice_number: string
    title: string
    total_amount: number
    amount_paid: number
    status: string
    due_date: string | null
    created_at: string
  }
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]

  const today          = new Date().toISOString().split('T')[0]
  const activeInvoices = invoices.filter((i) => i.status !== 'cancelled')
  const totalInvoiced  = activeInvoices.reduce((s, i) => s + i.total_amount, 0)
  const totalPaid      = activeInvoices.reduce((s, i) => s + i.amount_paid, 0)
  const outstanding    = totalInvoiced - totalPaid
  const overdueBalance = activeInvoices
    .filter((i) => i.due_date !== null && i.due_date < today && (i.status === 'unpaid' || i.status === 'partial'))
    .reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)

  function isOverdue(inv: InvoiceRow): boolean {
    return inv.due_date !== null && inv.due_date < today
      && (inv.status === 'unpaid' || inv.status === 'partial')
  }

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">
            ← {student.first_name} {student.last_name}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Finance — {student.first_name} {student.last_name}
        </h1>
        <p className="text-primary-300 text-sm mt-0.5">
          {invoices.length} facture{invoices.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm">
        <div className="bg-primary-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{fmt(totalInvoiced)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-0.5">Facturé</p>
        </div>
        <div className="bg-emerald-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{fmt(totalPaid)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-0.5">Encaissé</p>
        </div>
        <div className={`px-4 py-4 text-center ${outstanding > 0 ? 'bg-amber-500' : 'bg-gray-500'}`}>
          <p className="text-lg font-bold text-white">{fmt(outstanding)}</p>
          <p className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${outstanding > 0 ? 'text-amber-100' : 'text-gray-300'}`}>
            Solde
          </p>
        </div>
        <div className={`px-4 py-4 text-center ${overdueBalance > 0 ? 'bg-red-600' : 'bg-gray-400'}`}>
          <p className="text-lg font-bold text-white">{fmt(overdueBalance)}</p>
          <p className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${overdueBalance > 0 ? 'text-red-200' : 'text-gray-200'}`}>
            En retard
          </p>
        </div>
      </div>

      {/* ── Invoice list ─────────────────────────────────────────────────────── */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune facture</p>
          <p className="mt-1 text-sm text-gray-500">Aucune facture pour cet élève.</p>
          <a
            href="/school/finance/invoices/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            Créer une facture
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">N°</th>
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
                const balance = inv.total_amount - inv.amount_paid
                const overdue = isOverdue(inv)
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
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {inv.title}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {fmt(inv.total_amount)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right text-emerald-700 whitespace-nowrap">
                      {fmt(inv.amount_paid)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right font-medium whitespace-nowrap">
                      <span className={balance > 0 ? 'text-red-600' : 'text-gray-400'}>{fmt(balance)}</span>
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
      )}

    </div>
  )
}
