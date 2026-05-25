import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function FeesPage() {
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

  const { data: rawItems } = await supabase
    .from('fee_items')
    .select('id, name, description, amount, due_date, is_active, academic_years!academic_year_id(name)')
    .eq('school_id', schoolId)
    .order('is_active', { ascending: false })
    .order('name')

  type FeeRow = {
    id: string
    name: string
    description: string | null
    amount: number
    due_date: string | null
    is_active: boolean
    academic_years: { name: string } | null
  }
  const items = (rawItems ?? []) as unknown as FeeRow[]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/school/finance" className="text-primary-300 hover:text-white text-sm">← Finances</a>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Tarifs &amp; Frais</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {items.length > 0 ? `${items.length} frais au catalogue` : 'Catalogue des frais de scolarité'}
            </p>
          </div>
          <a
            href="/school/finance/fees/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            + Nouveau frais
          </a>
        </div>
      </div>

      {/* ── Table / empty state ──────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-200">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Aucun frais au catalogue</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs mx-auto">
            Créez des frais réutilisables (frais de scolarité, fournitures…) pour les ajouter facilement aux factures.
          </p>
          <a
            href="/school/finance/fees/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            Créer un frais
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Désignation</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Montant</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Échéance</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Année</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  <td className="px-4 py-3">
                    <p className={`font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[240px]">{item.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                    {fmt(item.amount)}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">
                    {fmtDate(item.due_date)}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs">
                    {item.academic_years?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.is_active ? (
                      <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Actif
                      </span>
                    ) : (
                      <span className="inline-block rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-400">
                        Inactif
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
