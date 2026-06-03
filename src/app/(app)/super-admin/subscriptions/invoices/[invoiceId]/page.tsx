import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { RecordPaymentForm } from './_record_form'

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
const METHOD_LABEL: Record<string, string> = {
  manual: 'Manuel', bank_transfer: 'Virement bancaire', wave: 'Wave', orange_money: 'Orange Money', card: 'Carte',
}
const OK_MSG: Record<string, string> = {
  created: 'Facture créée.',
  paid:    'Paiement enregistré.',
}

function fmt(n: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(Number(n)) + ' ' + currency
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type Props = { params: { invoiceId: string }; searchParams: { ok?: string } }

export default async function SaasInvoiceDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('global_role').eq('id', user.id).maybeSingle()
  if ((profile as { global_role: string } | null)?.global_role !== 'super_admin') redirect('/dashboard')

  const { data: invRaw, error } = await supabase
    .from('subscription_invoices')
    .select('id, school_id, invoice_number, amount, amount_paid, currency, billing_period_start, billing_period_end, due_date, status, issued_at, paid_at, notes, schools!inner(name)')
    .eq('id', params.invoiceId)
    .maybeSingle()

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Facture d&apos;abonnement</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-700">Module de facturation indisponible (migration 040 non exécutée ?).</p>
        </div>
      </div>
    )
  }
  if (!invRaw) notFound()

  type Inv = {
    id: string; school_id: string; invoice_number: string
    amount: number; amount_paid: number; currency: string
    billing_period_start: string | null; billing_period_end: string | null; due_date: string | null
    status: string; issued_at: string | null; paid_at: string | null; notes: string | null
    schools: { name: string } | null
  }
  const inv = invRaw as unknown as Inv

  const { data: paysData } = await supabase
    .from('subscription_payments')
    .select('id, amount, method, reference, paid_at')
    .eq('subscription_invoice_id', inv.id)
    .order('paid_at', { ascending: false })
  type Pay = { id: string; amount: number; method: string; reference: string | null; paid_at: string }
  const payments = (paysData ?? []) as Pay[]

  const remaining = Number(inv.amount) - Number(inv.amount_paid)
  const canPay = inv.status !== 'paid' && inv.status !== 'cancelled'
  const okText = searchParams.ok ? OK_MSG[searchParams.ok] : null

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-1 text-sm text-gray-500">
          <Link href="/super-admin/subscriptions" className="hover:text-indigo-600 hover:underline">Abonnements</Link>
          <span className="mx-2">/</span>
          <Link href="/super-admin/subscriptions/invoices" className="hover:text-indigo-600 hover:underline">Factures</Link>
          <span className="mx-2">/</span>
          <span className="font-mono font-medium text-gray-900">{inv.invoice_number}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{inv.invoice_number}</h1>
          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft}`}>
            {STATUS_LABEL[inv.status] ?? inv.status}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          <Link href={`/super-admin/subscriptions/${inv.school_id}`} className="hover:text-indigo-700 hover:underline">{inv.schools?.name ?? '—'}</Link>
        </p>
      </div>

      {okText && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{okText}</div>
      )}

      {/* Amounts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-center shadow-sm">
          <p className="text-lg font-bold text-gray-900">{fmt(inv.amount, inv.currency)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Montant</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-center shadow-sm">
          <p className="text-lg font-bold text-emerald-700">{fmt(inv.amount_paid, inv.currency)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Réglé</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-center shadow-sm">
          <p className={`text-lg font-bold ${remaining > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmt(remaining, inv.currency)}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Solde</p>
        </div>
      </div>

      {/* Invoice meta */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100 text-sm">
          <Row label="Période" value={`${fmtDate(inv.billing_period_start)} — ${fmtDate(inv.billing_period_end)}`} />
          <Row label="Échéance" value={fmtDate(inv.due_date)} />
          <Row label="Émise le" value={inv.issued_at ? fmtDateTime(inv.issued_at) : '—'} />
          <Row label="Réglée le" value={inv.paid_at ? fmtDateTime(inv.paid_at) : '—'} />
          {inv.notes && <Row label="Notes" value={inv.notes} />}
        </dl>
      </div>

      {/* Record payment */}
      {canPay && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Enregistrer un paiement</h2>
          <RecordPaymentForm invoiceId={inv.id} remaining={remaining} />
        </div>
      )}
      {inv.status === 'paid' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">✓ Cette facture est entièrement réglée.</div>
      )}
      {inv.status === 'cancelled' && (
        <div className="rounded-md border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-600">Cette facture est annulée.</div>
      )}

      {/* Payments history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Paiements reçus</h2>
        {payments.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 px-6 text-center">
            <p className="text-sm text-gray-500">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                    <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Référence</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={p.id} className={`border-b border-gray-100 ${idx % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDateTime(p.paid_at)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(p.amount, inv.currency)}</td>
                      <td className="px-4 py-3 text-gray-600">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="hidden sm:table-cell px-4 py-3 text-gray-400">{p.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 sm:col-span-2 sm:mt-0 text-gray-900">{value}</dd>
    </div>
  )
}
