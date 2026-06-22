import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadFamily } from '@/lib/finance/family'
import { FamilyInvoiceForm } from './_form'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

type Props = { params: { parentId: string }; searchParams: { created?: string; skipped?: string } }

export default async function FamilyDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const family = await loadFamily(supabase, schoolId, params.parentId)
  if (!family) notFound()

  const { data: feeItemsRaw } = await supabase
    .from('fee_items').select('id, name, amount').eq('school_id', schoolId).eq('is_active', true).order('name')
  const feeItems = (feeItemsRaw ?? []) as { id: string; name: string; amount: number }[]

  const today = new Date().toISOString().slice(0, 10)
  const created = searchParams.created ? parseInt(searchParams.created, 10) : null
  const skipped = searchParams.skipped ? parseInt(searchParams.skipped, 10) : 0

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/finance/families" className="text-primary-300 hover:text-white text-sm">← Familles</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Famille {family.parentName}</h1>
        <p className="text-primary-300 text-sm mt-0.5">{family.children.length} enfant{family.children.length !== 1 ? 's' : ''} rattaché{family.children.length !== 1 ? 's' : ''}</p>
      </div>

      {created !== null && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {created} facture{created !== 1 ? 's' : ''} créée{created !== 1 ? 's' : ''}{skipped > 0 ? ` · ${skipped} ignorée${skipped !== 1 ? 's' : ''}` : ''}.
        </div>
      )}

      <div className="overflow-hidden rounded-xl grid grid-cols-3 shadow-sm">
        <div className="bg-primary-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{fmt(family.totalBilled)}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-200 mt-1">Total facturé</p>
        </div>
        <div className="bg-emerald-600 px-4 py-4 text-center">
          <p className="text-lg font-bold text-white">{fmt(family.totalPaid)}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200 mt-1">Encaissé</p>
        </div>
        <div className={`px-4 py-4 text-center ${family.totalOutstanding > 0 ? 'bg-red-600' : 'bg-gray-500'}`}>
          <p className="text-lg font-bold text-white">{fmt(family.totalOutstanding)}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mt-1">Solde famille</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Enfants</h2>
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Élève</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Factures</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Solde</th>
              </tr>
            </thead>
            <tbody>
              {family.children.map((c, idx) => (
                <tr key={c.studentId} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3">
                    <a href={`/school/students/${c.studentId}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{c.name}</a>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{c.invoiceCount}</td>
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${c.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(c.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Facturer toute la famille</h2>
        <div className="rounded-xl border border-sand-200 bg-white px-6 py-5 shadow-sm">
          <FamilyInvoiceForm parentId={family.parentId} feeItems={feeItems} today={today} childCount={family.children.length} />
        </div>
      </section>
    </div>
  )
}
