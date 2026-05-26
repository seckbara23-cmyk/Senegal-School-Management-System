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
  unpaid:  'Impayée',
  partial: 'Partielle',
}

const STATUS_CLASS: Record<string, string> = {
  unpaid:  'border-red-200 bg-red-50 text-red-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-700',
}

export default async function NewPaymentPage() {
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

  // Outstanding invoices (unpaid or partial)
  const { data: rawInvoices } = await supabase
    .from('student_invoices')
    .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, students!student_id(first_name, last_name)')
    .eq('school_id', schoolId)
    .in('status', ['unpaid', 'partial'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

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
    return inv.due_date !== null && inv.due_date < today
  }

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finances</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Enregistrer un paiement</h1>
        <p className="text-primary-300 text-sm mt-0.5">
          Sélectionnez une facture en attente pour enregistrer un paiement
        </p>
      </div>

      {/* ── List of outstanding invoices ──────────────────────────────────────── */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucune facture en attente</h3>
          <p className="mt-1 text-sm text-gray-500">
            Toutes les factures sont réglées ou il n&apos;y en a aucune.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <a
              href="/school/finance/invoices/new"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
            >
              Créer une facture
            </a>
            <a
              href="/school/finance/invoices"
              className="rounded-lg border border-sand-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-100 transition-colors"
            >
              Voir toutes les factures
            </a>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 mb-3">
            {invoices.length} facture{invoices.length !== 1 ? 's' : ''} en attente — cliquez pour enregistrer un paiement
          </p>
          <div className="space-y-2">
            {invoices.map((inv) => {
              const balance  = inv.total_amount - inv.amount_paid
              const overdue  = isOverdue(inv)
              return (
                <a
                  key={inv.id}
                  href={`/school/finance/invoices/${inv.id}`}
                  className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 hover:border-primary-300 hover:bg-primary-50 transition-colors shadow-sm ${
                    overdue ? 'border-red-200 bg-red-50' : 'border-sand-200 bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{inv.invoice_number}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[inv.status] ?? STATUS_CLASS.unpaid}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                      {overdue && (
                        <span className="rounded-full border border-red-400 bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                          En retard
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{inv.title}</p>
                    <p className={`text-xs mt-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {inv.students.first_name} {inv.students.last_name} · Échéance : {fmtDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-red-600">{fmt(balance)}</p>
                    <p className="text-xs text-gray-400">à encaisser</p>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
