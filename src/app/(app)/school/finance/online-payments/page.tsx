import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { reverifyPayment } from './actions'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

const PROVIDER_LABEL: Record<string, string> = { wave: 'Wave', orange_money: 'Orange Money' }
const STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'En attente', cls: 'border-sand-200 bg-sand-50 text-gray-500' },
  processing: { label: 'En cours', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  paid:       { label: 'Payé', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed:     { label: 'Échoué', cls: 'border-red-200 bg-red-50 text-red-700' },
  expired:    { label: 'Expiré', cls: 'border-gray-200 bg-gray-100 text-gray-500' },
  cancelled:  { label: 'Annulé', cls: 'border-gray-200 bg-gray-100 text-gray-500' },
}

function one<T>(v: T | T[] | null | undefined): T | null { return v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v) }

function reviewReason(errorMessage: string | null, status: string, updatedAt: string, cutoff: number): string | null {
  if (errorMessage === 'overpayment_no_balance') return 'Trop-perçu — facture déjà soldée. Remboursement à étudier.'
  if (errorMessage === 'amount_mismatch') return 'Montant incohérent signalé par l’opérateur.'
  if (status === 'processing' && new Date(updatedAt).getTime() < cutoff) return 'En attente de confirmation depuis plus de 30 min.'
  return null
}

type Props = { searchParams: { reverified?: string } }

export default async function OnlinePaymentsPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const cutoff = Date.now() - 30 * 60 * 1000
  const cutoffIso = new Date(cutoff).toISOString()

  const [{ data }, { data: reviewData }] = await Promise.all([
    supabase.from('payment_requests')
      .select('id, status, amount, provider, created_at, updated_at, error_message, invoice_id, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(50),
    supabase.from('payment_requests')
      .select('id, status, amount, provider, created_at, updated_at, error_message, invoice_id, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .or(`error_message.eq.overpayment_no_balance,error_message.eq.amount_mismatch,and(status.eq.processing,updated_at.lt.${cutoffIso})`)
      .order('created_at', { ascending: false }).limit(50),
  ])
  type Row = { id: string; status: string; amount: number; provider: string; created_at: string; updated_at: string; error_message: string | null; invoice_id: string; students: unknown }
  const mapRow = (r: Row) => { const s = one<{ first_name: string; last_name: string }>(r.students as never); return { ...r, name: s ? `${s.last_name} ${s.first_name}` : '—' } }
  const rows = ((data ?? []) as Row[]).map(mapRow)
  const review = ((reviewData ?? []) as Row[]).map((r) => ({ ...mapRow(r), reason: reviewReason(r.error_message, r.status, r.updated_at, cutoff) })).filter((r) => r.reason)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finance</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Paiements en ligne</h1>
        <p className="text-primary-300 text-sm mt-0.5">Suivi des transactions Wave et Orange Money.</p>
      </div>

      {searchParams.reverified && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Statut actualisé auprès de l’opérateur.</div>}

      {review.length > 0 && (
        <div className="overflow-hidden rounded-xl border-2 border-amber-300 bg-amber-50 shadow-sm">
          <div className="border-b border-amber-200 px-5 py-3"><h2 className="text-xs font-bold uppercase tracking-widest text-amber-700">À examiner ({review.length})</h2></div>
          <ul className="divide-y divide-amber-100">
            {review.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <a href={`/school/finance/invoices/${r.invoice_id}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline">{r.name}</a>
                  <p className="text-xs text-amber-700">{r.reason} · {PROVIDER_LABEL[r.provider] ?? r.provider} · {fmt(r.amount)}</p>
                </div>
                <form action={reverifyPayment}><input type="hidden" name="request_id" value={r.id} /><button type="submit" className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Vérifier à nouveau</button></form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun paiement en ligne</p>
          <p className="mt-1 text-sm text-gray-500">Activez Wave / Orange Money dans <a href="/school/finance/payment-settings" className="text-primary-600 hover:underline">Paiements en ligne</a>.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Élève</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Moyen</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3">
                      <a href={`/school/finance/invoices/${r.invoice_id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{r.name}</a>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{PROVIDER_LABEL[r.provider] ?? r.provider}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(r.amount)}</td>
                    <td className="px-4 py-3 text-center"><span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${(STATUS[r.status] ?? STATUS.pending).cls}`}>{(STATUS[r.status] ?? STATUS.pending).label}</span></td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {(r.status === 'processing' || r.status === 'pending') && (
                        <form action={reverifyPayment}><input type="hidden" name="request_id" value={r.id} /><button type="submit" className="text-xs font-medium text-primary-600 hover:underline">Vérifier</button></form>
                      )}
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
