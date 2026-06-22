import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadFamilies } from '@/lib/finance/family'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

export default async function FamiliesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const families = await loadFamilies(supabase, schoolId)
  const totalOutstanding = families.reduce((s, f) => s + f.outstanding, 0)
  const withDebt = families.filter((f) => f.outstanding > 0).length

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finance</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Familles</h1>
        <p className="text-primary-300 text-sm mt-0.5">Solde regroupé par famille (parent et enfants rattachés).</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Familles avec solde</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{withDebt}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Solde total</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{fmt(totalOutstanding)}</p>
        </div>
      </div>

      {families.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucune famille</p>
          <p className="mt-1 text-sm text-gray-500">Rattachez des parents à des élèves pour les voir ici.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Famille</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Enfants</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Solde</th>
              </tr>
            </thead>
            <tbody>
              {families.map((f, idx) => (
                <tr key={f.parentId} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3">
                    <a href={`/school/finance/families/${f.parentId}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{f.parentName}</a>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{f.childCount}</td>
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${f.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(f.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
