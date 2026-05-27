import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function PeriodsPage() {
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

  const { data: rawPeriods } = await supabase
    .from('academic_periods')
    .select('id, name, starts_on, ends_on, is_active, academic_years!academic_year_id(name)')
    .eq('school_id', schoolId)
    .order('academic_year_id', { ascending: false })
    .order('name',             { ascending: true  })

  type PeriodRow = {
    id: string
    name: string
    starts_on: string | null
    ends_on: string | null
    is_active: boolean
    academic_years: { name: string }
  }
  const periods = (rawPeriods ?? []) as unknown as PeriodRow[]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1">
              <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Périodes académiques</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {periods.length} période{periods.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a
            href="/school/academics/periods/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            + Nouvelle période
          </a>
        </div>
      </div>

      {/* ── Table / empty state ──────────────────────────────────────────────── */}
      {periods.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucune période</h3>
          <p className="mt-1 text-sm text-gray-500">Créez vos trimestres ou semestres.</p>
          <a
            href="/school/academics/periods/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            Créer une période
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Période</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Année scolaire</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Du</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Au</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, idx) => (
                <tr
                  key={p.id}
                  className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-500 text-xs">
                    {p.academic_years.name}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {fmtDate(p.starts_on)}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {fmtDate(p.ends_on)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.is_active ? (
                      <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-block rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        Inactive
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
