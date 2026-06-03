import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// School-admin READ-ONLY view of the school's own EduSen SaaS subscription
// invoices and payments. RLS (migration 040) restricts rows to this school.
// This is the SaaS subscription billing — distinct from student fees (/school/finance).

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', issued: 'Émise', paid: 'Réglée', overdue: 'En retard', cancelled: 'Annulée',
}
const STATUS_BADGE: Record<string, string> = {
  draft:     'border-gray-200 bg-gray-100 text-gray-600',
  issued:    'border-sky-200 bg-sky-50 text-sky-700',
  paid:      'border-emerald-200 bg-emerald-50 text-emerald-700',
  overdue:   'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-500',
}
const METHOD_LABEL: Record<string, string> = {
  manual: 'Manuel', bank_transfer: 'Virement', wave: 'Wave', orange_money: 'Orange Money', card: 'Carte',
}

function fmt(n: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR').format(Number(n)) + ' ' + currency
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function SchoolBillingPage() {
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
  if (!membership) redirect('/dashboard')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: invData, error: invErr } = await supabase
    .from('subscription_invoices')
    .select('id, invoice_number, amount, amount_paid, currency, status, billing_period_start, billing_period_end, due_date')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: payData } = await supabase
    .from('subscription_payments')
    .select('id, amount, method, reference, paid_at')
    .eq('school_id', schoolId)
    .order('paid_at', { ascending: false })
    .limit(50)

  type Inv = { id: string; invoice_number: string; amount: number; amount_paid: number; currency: string; status: string; billing_period_start: string | null; billing_period_end: string | null; due_date: string | null }
  type Pay = { id: string; amount: number; method: string; reference: string | null; paid_at: string }
  const invoices = (invData ?? []) as Inv[]
  const payments = (payData ?? []) as Pay[]
  const currency = invoices[0]?.currency ?? 'XOF'

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Abonnement EduSen</h1>
        <p className="text-primary-300 text-sm mt-0.5">Factures et paiements de l&apos;abonnement de votre établissement (lecture seule).</p>
      </div>

      {invErr ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">Facturation indisponible</p>
          <p className="mt-1 text-sm text-amber-700">Le module de facturation des abonnements n&apos;est pas encore activé.</p>
        </div>
      ) : (
        <>
          {/* Invoices */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-gray-800">Factures</h2>
            {invoices.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-10 px-6 text-center">
                <p className="text-sm text-gray-500">Aucune facture d&apos;abonnement pour le moment.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sand-200 bg-sand-100 text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">N°</th>
                        <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Période</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                        <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Échéance</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((iv, idx) => (
                        <tr key={iv.id} className={`border-b border-sand-100 ${idx % 2 ? 'bg-sand-50' : 'bg-white'}`}>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{iv.invoice_number}</td>
                          <td className="hidden sm:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(iv.billing_period_start)} – {fmtDate(iv.billing_period_end)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(iv.amount, iv.currency)}</td>
                          <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-500 whitespace-nowrap">{fmtDate(iv.due_date)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[iv.status] ?? STATUS_BADGE.draft}`}>
                              {STATUS_LABEL[iv.status] ?? iv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Payments */}
          {payments.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-gray-800">Paiements</h2>
              <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sand-200 bg-sand-100 text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Montant</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mode</th>
                        <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Référence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, idx) => (
                        <tr key={p.id} className={`border-b border-sand-100 ${idx % 2 ? 'bg-sand-50' : 'bg-white'}`}>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(p.amount, currency)}</td>
                          <td className="px-4 py-3 text-gray-600">{METHOD_LABEL[p.method] ?? p.method}</td>
                          <td className="hidden sm:table-cell px-4 py-3 text-gray-400">{p.reference ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <p className="text-xs text-gray-400">
            Pour toute question sur votre abonnement, contactez l&apos;équipe EduSen. Les paiements sont
            enregistrés manuellement par l&apos;administrateur de la plateforme.
          </p>
        </>
      )}
    </div>
  )
}
