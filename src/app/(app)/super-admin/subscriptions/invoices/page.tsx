import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', issued: 'Émise', paid: 'Réglée', overdue: 'En retard', cancelled: 'Annulée',
}
const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 border-gray-200',
  issued:    'bg-sky-50 text-sky-700 border-sky-200',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:   'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

function fmt(n: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(Number(n)) + ' ' + currency
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Row = {
  id: string
  invoice_number: string
  amount: number
  amount_paid: number
  currency: string
  status: string
  due_date: string | null
  created_at: string
  schools: { name: string } | null
}

type Props = { searchParams: { status?: string; q?: string } }

export default async function SaasInvoicesPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  const fStatus = searchParams.status && STATUS_LABEL[searchParams.status] ? searchParams.status : ''
  const q = (searchParams.q ?? '').trim().toLowerCase().slice(0, 100)

  // Most recent 200 invoices (foundation cap). Status filtered in DB; name in JS.
  let query = supabase
    .from('subscription_invoices')
    .select('id, invoice_number, amount, amount_paid, currency, status, due_date, created_at, schools!inner(name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (fStatus) query = query.eq('status', fStatus)

  const { data, error } = await query

  if (error) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">Module de facturation indisponible</p>
          <p className="mt-1 text-sm text-amber-700">
            Vérifiez que la migration 040 (<span className="font-mono">040_saas_billing.sql</span>) a été exécutée dans Supabase.
          </p>
        </div>
      </div>
    )
  }

  let rows = (data ?? []) as unknown as Row[]
  if (q) rows = rows.filter((r) => (r.schools?.name ?? '').toLowerCase().includes(q))

  return (
    <div className="space-y-6">
      <Header />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
          <select id="status" name="status" defaultValue={fStatus} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Tous</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="q" className="block text-xs font-medium text-gray-600 mb-1">Recherche</label>
          <input id="q" name="q" type="search" defaultValue={searchParams.q ?? ''} placeholder="Nom de l'école…" className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Filtrer</button>
          {(fStatus || q) && <Link href="/super-admin/subscriptions/invoices" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Réinitialiser</Link>}
        </div>
      </form>

      <p className="text-sm text-gray-500">{rows.length} facture{rows.length !== 1 ? 's' : ''}</p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune facture d&apos;abonnement</p>
          <p className="mt-1 text-sm text-gray-400">Créez une facture depuis la fiche d&apos;abonnement d&apos;une école.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">N°</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">École</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Échéance</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-gray-100 hover:bg-indigo-50/40 ${idx % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      <Link href={`/super-admin/subscriptions/invoices/${r.id}`} className="hover:text-indigo-700 hover:underline">{r.invoice_number}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{r.schools?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(r.amount, r.currency)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-500 whitespace-nowrap">{fmtDate(r.due_date)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status] ?? STATUS_BADGE.draft}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/super-admin/subscriptions/invoices/${r.id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-900 hover:underline">Voir →</Link>
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

function Header() {
  return (
    <div>
      <nav className="mb-1 text-sm text-gray-500">
        <Link href="/super-admin" className="hover:text-indigo-600 hover:underline">Super Admin</Link>
        <span className="mx-2">/</span>
        <Link href="/super-admin/subscriptions" className="hover:text-indigo-600 hover:underline">Abonnements</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-gray-900">Factures</span>
      </nav>
      <h1 className="text-2xl font-bold text-gray-900">Factures d&apos;abonnement</h1>
      <p className="mt-0.5 text-sm text-gray-500">Facturation SaaS des établissements (séparée des frais de scolarité).</p>
    </div>
  )
}
