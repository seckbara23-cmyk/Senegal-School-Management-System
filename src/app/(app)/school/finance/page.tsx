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
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id

  const today = new Date().toISOString().split('T')[0]

  // Fetch all non-cancelled invoices for stats + overdue query in parallel
  const [allInvoicesRes, overdueRes, recentRes, paymentsRes, transportRes, plansRes] = await Promise.all([
    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid, status')
      .eq('school_id', schoolId)
      .neq('status', 'cancelled'),

    supabase
      .from('student_invoices')
      .select('total_amount, amount_paid, due_date')
      .eq('school_id', schoolId)
      .in('status', ['unpaid', 'partial'])
      .lt('due_date', today)
      .not('due_date', 'is', null),

    supabase
      .from('student_invoices')
      .select('id, invoice_number, title, total_amount, amount_paid, status, due_date, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(8),

    supabase.from('student_payments').select('payment_method, amount').eq('school_id', schoolId),
    supabase.from('invoice_lines').select('amount').eq('school_id', schoolId).eq('source', 'transport'),
    supabase.from('payment_plans').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
  ])

  const invoices = (allInvoicesRes.data ?? []) as { total_amount: number; amount_paid: number; status: string }[]
  const totalInvoiced    = invoices.reduce((s, i) => s + i.total_amount, 0)
  const totalCollected   = invoices.reduce((s, i) => s + i.amount_paid, 0)
  const totalOutstanding = totalInvoiced - totalCollected
  const countUnpaid      = invoices.filter((i) => i.status === 'unpaid').length
  const countPartial     = invoices.filter((i) => i.status === 'partial').length
  const countPaid        = invoices.filter((i) => i.status === 'paid').length

  type OverdueRow = { total_amount: number; amount_paid: number; due_date: string | null }
  const overdueInvoices    = (overdueRes.data ?? []) as OverdueRow[]
  const countOverdue       = overdueInvoices.length
  const totalOverdueBalance = overdueInvoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0)

  // Phase 4.4 analytics
  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0

  // Overdue aging buckets (days past due → outstanding balance)
  const todayMs = new Date(today).getTime()
  const aging = { b1: 0, b2: 0, b3: 0 } // 0–30 / 31–60 / 61+
  for (const inv of overdueInvoices) {
    if (!inv.due_date) continue
    const days = Math.floor((todayMs - new Date(inv.due_date).getTime()) / 86_400_000)
    const bal = inv.total_amount - inv.amount_paid
    if (days <= 30) aging.b1 += bal; else if (days <= 60) aging.b2 += bal; else aging.b3 += bal
  }

  // Payment-method breakdown
  const methodLabels: Record<string, string> = { cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque', wave_manual: 'Wave', orange_money_manual: 'Orange Money', other: 'Autre' }
  const byMethod = new Map<string, number>()
  for (const p of (paymentsRes.data ?? []) as { payment_method: string; amount: number }[]) byMethod.set(p.payment_method, (byMethod.get(p.payment_method) ?? 0) + p.amount)
  const methodRows = Array.from(byMethod.entries()).map(([m, amt]) => ({ label: methodLabels[m] ?? m, amount: amt })).sort((a, b) => b.amount - a.amount)
  const methodTotal = methodRows.reduce((s, r) => s + r.amount, 0)

  const transportRevenue = ((transportRes.data ?? []) as { amount: number }[]).reduce((s, l) => s + l.amount, 0)
  const activePlans = plansRes.count ?? 0

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
  const recentInvoices = (recentRes.data ?? []) as unknown as RecentRow[]

  function isOverdue(inv: RecentRow): boolean {
    return inv.due_date !== null
      && inv.due_date < today
      && (inv.status === 'unpaid' || inv.status === 'partial')
  }

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
              href="/school/finance/invoices/bulk"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-400 bg-accent-50 px-4 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-100 transition-colors shadow-sm"
            >
              Facturation par classe
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

      {/* ── Overdue alert ────────────────────────────────────────────────────── */}
      {countOverdue > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-red-800">
                {countOverdue} facture{countOverdue !== 1 ? 's' : ''} en retard
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Solde impayé : {fmt(totalOverdueBalance)}
              </p>
            </div>
            <a
              href="/school/finance/invoices?status=overdue"
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Voir →
            </a>
          </div>
        </div>
      )}

      {/* ── Analytics (Phase 4.4) ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Collection rate + transport + plans */}
        <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Taux de recouvrement</p>
          <p className="mt-1 text-3xl font-bold text-primary-700">{collectionRate}%</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sand-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectionRate}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-sand-50 px-3 py-2">
              <p className="text-sm font-bold text-gray-900">{fmt(transportRevenue)}</p>
              <p className="text-[11px] text-gray-400">Transport facturé</p>
            </div>
            <div className="rounded-lg bg-sand-50 px-3 py-2">
              <p className="text-sm font-bold text-gray-900">{activePlans}</p>
              <p className="text-[11px] text-gray-400">Échéanciers actifs</p>
            </div>
          </div>
        </div>

        {/* Overdue aging */}
        <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Ancienneté des impayés</p>
          <div className="mt-3 space-y-2">
            {[
              { label: '0–30 jours', val: aging.b1, cls: 'text-amber-600' },
              { label: '31–60 jours', val: aging.b2, cls: 'text-orange-600' },
              { label: '61 jours et +', val: aging.b3, cls: 'text-red-600' },
            ].map((b) => (
              <div key={b.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{b.label}</span>
                <span className={`font-semibold ${b.cls}`}>{fmt(b.val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment-method breakdown */}
        <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Encaissements par mode</p>
          {methodRows.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">Aucun paiement enregistré.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {methodRows.map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{r.label}</span>
                    <span className="font-semibold text-gray-900">{fmt(r.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sand-100">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${methodTotal > 0 ? Math.round((r.amount / methodTotal) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <a href="/school/finance/invoices" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">📋</span>
          Toutes les factures
        </a>
        <a href="/school/finance/invoices/bulk" className="flex items-center gap-3 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-medium text-accent-700 hover:border-accent-400 hover:text-accent-800 transition-colors shadow-sm">
          <span className="text-lg">🏫</span>
          Par classe
        </a>
        <a href="/school/finance/payments/new" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">💳</span>
          Enregistrer paiement
        </a>
        <a href="/school/finance/payments" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">📒</span>
          Journal des paiements
        </a>
        <a href="/school/finance/reports" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">📊</span>
          Rapport financier
        </a>
        <a href="/school/finance/families" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">👨‍👩‍👧</span>
          Familles
        </a>
        <a href="/school/finance/transport" className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-colors shadow-sm">
          <span className="text-lg">🚌</span>
          Facturation transport
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
            <div className="overflow-x-auto">
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
                {recentInvoices.map((inv, idx) => {
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

    </div>
  )
}
