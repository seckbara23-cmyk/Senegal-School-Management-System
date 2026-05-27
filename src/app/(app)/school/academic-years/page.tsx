import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type YearRow = {
  id:               string
  name:             string
  starts_on:        string
  ends_on:          string
  is_active:        boolean
  classes:          { id: string }[]
  academic_periods: { id: string }[]
  fee_items:        { id: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AcademicYearsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')

  const schoolId = (membership as { school_id: string }).school_id
  const school   = (membership as unknown as { schools: { name: string } }).schools

  const { data: rawYears, error } = await supabase
    .from('academic_years')
    .select(
      'id, name, starts_on, ends_on, is_active, ' +
      'classes!academic_year_id(id), ' +
      'academic_periods!academic_year_id(id), ' +
      'fee_items!academic_year_id(id)'
    )
    .eq('school_id', schoolId)
    .order('starts_on', { ascending: false })

  const years  = (rawYears ?? []) as unknown as YearRow[]
  const sorted = [...years].sort((a, b) =>
    a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1
  )

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Années scolaires</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Années scolaires</h1>
            <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
          </div>
          <a
            href="/school/academic-years/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle année
          </a>
        </div>
        {years.length > 0 && (
          <div className="mt-4 pt-4 border-t border-primary-700">
            <p className="text-sm text-primary-300">
              <span className="font-semibold text-white">{years.length}</span>{' '}
              année{years.length !== 1 ? 's' : ''} scolaire{years.length !== 1 ? 's' : ''}{' '}
              enregistrée{years.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!error && years.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-200">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 16.5v2.25" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Aucune année scolaire</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs mx-auto">
            Créez la première année scolaire pour organiser vos classes, périodes et frais.
          </p>
          <a
            href="/school/academic-years/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Créer une année scolaire
          </a>
        </div>
      )}

      {/* ── Year cards ──────────────────────────────────────────────────────── */}
      {!error && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((year) => {
            const classCount  = year.classes.length
            const periodCount = year.academic_periods.length
            const feeCount    = year.fee_items.length
            return (
              <a
                key={year.id}
                href={`/school/academic-years/${year.id}`}
                className={`group block rounded-xl border shadow-sm transition-all hover:shadow-md ${
                  year.is_active
                    ? 'border-accent-300 bg-gradient-to-r from-primary-50 to-accent-50 hover:border-accent-400'
                    : 'border-sand-200 bg-white hover:border-primary-300'
                }`}
              >
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900 group-hover:text-primary-700">
                          {year.name}
                        </h2>
                        {year.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-accent-300 bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-accent-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
                            Année en cours
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {fmtDate(year.starts_on)}&ensp;→&ensp;{fmtDate(year.ends_on)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                        <span>
                          <span className="font-semibold text-gray-800">{classCount}</span>{' '}
                          classe{classCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-300" aria-hidden="true">·</span>
                        <span>
                          <span className="font-semibold text-gray-800">{periodCount}</span>{' '}
                          période{periodCount !== 1 ? 's' : ''}
                        </span>
                        {feeCount > 0 && (
                          <>
                            <span className="text-gray-300" aria-hidden="true">·</span>
                            <span>
                              <span className="font-semibold text-gray-800">{feeCount}</span>{' '}
                              frais
                            </span>
                          </>
                        )}
                      </div>
                      <svg className="h-4 w-4 text-gray-300 transition-colors group-hover:text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>

                  {/* Mobile counts */}
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 sm:hidden">
                    <span><span className="font-semibold text-gray-800">{classCount}</span> classe{classCount !== 1 ? 's' : ''}</span>
                    <span className="text-gray-300" aria-hidden="true">·</span>
                    <span><span className="font-semibold text-gray-800">{periodCount}</span> période{periodCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
