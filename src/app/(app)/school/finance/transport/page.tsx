import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TransportBillingForm } from './_form'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

type Props = { searchParams: { created?: string; skipped?: string } }

export default async function TransportBillingPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: assigns } = await supabase
    .from('student_transport_assignments').select('monthly_fee')
    .eq('school_id', schoolId).eq('status', 'active')
  const fees = ((assigns ?? []) as { monthly_fee: number }[]).map((a) => a.monthly_fee).filter((f) => f > 0)
  const activeCount = fees.length
  const expected = fees.reduce((s, f) => s + f, 0)

  const now = new Date()
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const defaultTitle = `Transport — ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`
  const today = now.toISOString().slice(0, 10)

  const created = searchParams.created ? parseInt(searchParams.created, 10) : null
  const skipped = searchParams.skipped ? parseInt(searchParams.skipped, 10) : 0

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finance</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Facturation du transport</h1>
        <p className="text-primary-300 text-sm mt-0.5">Générez les factures mensuelles d’abonnement transport en un clic.</p>
      </div>

      {created !== null && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {created} facture{created !== 1 ? 's' : ''} générée{created !== 1 ? 's' : ''}{skipped > 0 ? ` · ${skipped} ignorée${skipped !== 1 ? 's' : ''} (déjà facturé)` : ''}.
          <a href="/school/finance/invoices" className="ml-2 font-medium underline">Voir les factures</a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Abonnés actifs</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Revenu mensuel attendu</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{fmt(expected)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-5 shadow-sm">
        {activeCount === 0 ? (
          <p className="text-sm text-gray-500">Aucun élève n’a d’abonnement transport actif. Affectez des élèves à un itinéraire depuis le module <a href="/school/transport" className="text-primary-600 hover:underline">Transport</a>.</p>
        ) : (
          <TransportBillingForm defaultTitle={defaultTitle} today={today} disabled={false} />
        )}
      </div>
    </div>
  )
}
