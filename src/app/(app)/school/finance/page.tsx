import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FinancePage() {
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

  // Fetch all non-cancelled invoices for stats
  const { data: allInvoices } = await supabase
    .from('student_invoices')
    .select('total_amount, amount_paid, status')
    .eq('school_id', schoolId)
    .neq('status', 'cancelled')

  const invoices = (allInvoices ?? []) as { total_amount: number; amount_paid: number; status: string }[]
  const totalInvoiced  = invoices.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const totalOutstanding = totalInvoiced - totalCollected
  const countUnpaid  = invoices.filter((i) => i.status === 'unpaid').length
  const countPartial = invoices.filter((i) => i.status === 'partial').length
  const countPaid    = invoices.filter((i) => i.status === 'paid').length

  // Recent invoices (last 8)
  const { data: recentRaw } = await supabase
    .from('student_invoices')
    .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, students!student_id(first_name, last_name)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(8)

  type RecentRow = {
    id: string
    invoice_number: string
    title: string
    total_amount: number
    amount_paid: number
    status: string
    due_date: string | null
    students: { first_name: string; last_name: string }
  }
  const recentInvoices = (recentRaw ?? []) as unknown as RecentRow[]

  return (
    <div className="space-y-6">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Finances</h1>
            <p className="text-primary-300 text-sm mt-0.5">Gestion des frais de scolarité et paiements</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/school/finance/invoices/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              + Nouvelle facture
            </a>
            <a
              href="/school/finance/fees"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Tarifs &amp; Frais
            </a>
          </div>
        </div>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl grid grid-cols-2 sm:grid-cols-4 shadow-sm">
        <div className="bg-primary-600 px-5 py-5 text-center">
          <p className="text-2xl font-bold text-white leading-tight">{fmt(totalInvoiced)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mt-1">Facturé</p>
        </div>
        <div className="bg-emerald-600 px-5 py-5 text-center">
          <p className="text-2xl font-bold text-white leading-tight">{fmt(totalCollected)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mt-1">Encaissé</p>
        </div>
        <div className="bg-amber-500 px-5 py-5 text-center">
          <p className="text-2xl font-bold text-white leading-tight">{fmt(totalOutstanding)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-100 mt-1">En attente</p>
        </div>
        <div className="bg-sky-600 px-5 py-5 text-center">
          <p className="text-2xl font-bold text-white leading-tight">{invoices.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200 mt-1">Factures actives</p>
        </div>
      </div>

      {/* ── Status breakdown ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <a href="/school/finance/invoices?status=unpaid" className="group rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center hover:border-red-400 hover:bg-red-100 transition-colors">
          <p className="text-2xl font-bold text-red-700">{countUnpaid}</p>
          <p className="text-xs font-medium text-red-600 mt-0.5">Impayées</p>
        </a>
        <a href="/school/finance/invoices?status=partial" className="group rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center hover:border-amber-400 hover:bg-amber-100 transition-colors">
          <p className="text-2xl font-bold text-amber-700">{countPartial}</p>
          <p className="text-xs font-medium text-amber-600 mt-0.5">Partielles</p>
        </a>
        <a href="/school/finance/invoices?status=paid" className="group rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center hover:border-emerald-400 hover:bg-emerald-100 transition-colors">
          <p className="text-2xl font-bold text-emerald-700">{countPaid}</p>
          <p className="text-xs font-medium text-emerald-600 mt-0.5">Réglées</p>
        </a>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a href="/school/finance/invoices" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">📋</span>
          Toutes les factures
        </a>
        <a href="/school/finance/payments/new" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">💳</span>
          Enregistrer un paiement
        </a>
        <a href="/school/finance/fees/new" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">➕</span>
          Nouveau frais
        </a>
      </div>

      {/* ── Recent invoices ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Factures récentes</h2>
          <a href="/school/finance/invoices" className="text-sm text-primary-600 hover:text-primary-800 hover:underline">
            Voir toutes →
          </a>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
            <p className="text-base font-semibold text-gray-700">Aucune facture</p>
            <p className="mt-1 text-sm text-gray-500">Créez votre première facture pour un élève.</p>
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
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Élève</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Titre</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Total</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Échéance</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv, idx) => (
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
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {inv.title}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {fmt(inv.total_amount)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                      {fmtDate(inv.due_date)}
                    </td>
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
        )}
      </div>

    </div>
  )
}
