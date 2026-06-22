import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { sendPaymentReminder, sendAllOverdueReminders } from '../actions'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

function one<T>(v: T | T[] | null | undefined): T | null { return v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v) }

type Props = { searchParams: { sent?: string; error?: string } }

export default async function RemindersPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const today = new Date().toISOString().split('T')[0]
  const [overdueRes, logRes] = await Promise.all([
    supabase.from('student_invoices')
      .select('id, invoice_number, title, total_amount, amount_paid, due_date, students!student_id(first_name, last_name)')
      .eq('school_id', schoolId).in('status', ['unpaid', 'partial']).lt('due_date', today).not('due_date', 'is', null)
      .order('due_date', { ascending: true }),
    supabase.from('payment_reminders')
      .select('id, channel, recipient_count, sent_at, status, student_invoices!invoice_id(invoice_number)')
      .eq('school_id', schoolId).order('sent_at', { ascending: false }).limit(15),
  ])

  type OverdueRow = { id: string; invoice_number: string; title: string; total_amount: number; amount_paid: number; due_date: string | null; students: unknown }
  const overdue = ((overdueRes.data ?? []) as OverdueRow[]).map((r) => {
    const s = one<{ first_name: string; last_name: string }>(r.students as never)
    return { ...r, name: s ? `${s.last_name} ${s.first_name}` : '—', balance: r.total_amount - r.amount_paid }
  })

  type LogRow = { id: string; channel: string; recipient_count: number; sent_at: string; status: string; student_invoices: unknown }
  const log = ((logRes.data ?? []) as LogRow[]).map((r) => ({ ...r, number: one<{ invoice_number: string }>(r.student_invoices as never)?.invoice_number ?? '—' }))

  const sent = searchParams.sent ? parseInt(searchParams.sent, 10) : null

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finance</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rappels de paiement</h1>
        <p className="text-primary-300 text-sm mt-0.5">Envoyez des rappels in-app aux familles pour les factures en retard.</p>
      </div>

      {sent !== null && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {sent} rappel{sent !== 1 ? 's' : ''} envoyé{sent !== 1 ? 's' : ''}.
        </div>
      )}
      {searchParams.error === 'locked' && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">École en lecture seule.</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600"><span className="font-semibold text-red-600">{overdue.length}</span> facture{overdue.length !== 1 ? 's' : ''} en retard</p>
        {overdue.length > 0 && (
          <form action={sendAllOverdueReminders}>
            <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">Envoyer tous les rappels</button>
          </form>
        )}
      </div>

      {overdue.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune facture en retard</p>
          <p className="mt-1 text-sm text-gray-500">Toutes les factures à échéance sont à jour. 🎉</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Élève / Facture</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Échéance</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Solde</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((inv, idx) => (
                <tr key={inv.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3">
                    <a href={`/school/finance/invoices/${inv.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{inv.name}</a>
                    <p className="text-xs text-gray-400">#{inv.invoice_number} · {inv.title}</p>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-red-600 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">{fmt(inv.balance)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={sendPaymentReminder}>
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <button type="submit" className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50">Rappeler</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Rappels récents</h2>
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {log.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-2.5 text-gray-700">#{r.number}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.channel === 'in_app' ? 'In-app' : r.channel}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.recipient_count} destinataire{r.recipient_count !== 1 ? 's' : ''}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 text-xs whitespace-nowrap">{fmtDateTime(r.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
