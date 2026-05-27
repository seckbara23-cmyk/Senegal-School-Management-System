import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { setYearActive } from '../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type AcademicYear = {
  id:         string
  name:       string
  starts_on:  string
  ends_on:    string
  is_active:  boolean
}

type ClassRow = {
  id:      string
  name:    string
  level:   string | null
  section: string | null
}

type PeriodRow = {
  id:        string
  name:      string
  starts_on: string | null
  ends_on:   string | null
  is_active: boolean
}

type FeeRow = {
  id:        string
  name:      string
  amount:    number
  is_active: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtAmount(amount: number): string {
  return amount.toLocaleString('fr-FR') + ' FCFA'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: { yearId: string } }

export default async function AcademicYearDetailPage({ params }: Props) {
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

  const { data: yearData } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, is_active')
    .eq('id', params.yearId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!yearData) notFound()
  const year = yearData as AcademicYear

  // ── Parallel sub-queries ──────────────────────────────────────────────────
  const [
    { data: rawClasses },
    { data: rawPeriods },
    { data: rawFees },
  ] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, level, section')
      .eq('school_id', schoolId)
      .eq('academic_year_id', year.id)
      .order('name'),
    supabase
      .from('academic_periods')
      .select('id, name, starts_on, ends_on, is_active')
      .eq('school_id', schoolId)
      .eq('academic_year_id', year.id)
      .order('name'),
    supabase
      .from('fee_items')
      .select('id, name, amount, is_active')
      .eq('school_id', schoolId)
      .eq('academic_year_id', year.id)
      .order('name'),
  ])

  const classes = (rawClasses ?? []) as ClassRow[]
  const periods = (rawPeriods ?? []) as PeriodRow[]
  const fees    = (rawFees    ?? []) as FeeRow[]

  const isActive  = year.is_active
  const newActive = !isActive

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/academic-years" className="hover:text-white transition-colors">Années scolaires</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">{year.name}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-white tracking-tight">{year.name}</h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-accent-300 bg-accent-400/20 px-2.5 py-0.5 text-xs font-semibold text-accent-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-300" aria-hidden="true" />
                  Année en cours
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/60">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-sm text-primary-300">{school.name}</p>
            <p className="mt-1 text-sm text-primary-200">
              {fmtDate(year.starts_on)}&ensp;→&ensp;{fmtDate(year.ends_on)}
            </p>
          </div>
          <a
            href={`/school/academic-years/${year.id}/edit`}
            className="inline-flex items-center rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
          >
            Modifier
          </a>
        </div>

        {/* Quick-link chips */}
        <div className="mt-4 pt-4 border-t border-primary-700 flex flex-wrap gap-2">
          <a
            href="/school/classes"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25z" />
            </svg>
            Gérer les classes
          </a>
          <a
            href="/school/academics/periods"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Gérer les périodes
          </a>
          <a
            href="/school/finance/fees"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75" />
            </svg>
            Gérer les frais
          </a>
        </div>
      </div>

      {/* ── Classes ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
        <div className="border-b border-sand-200 bg-sand-100 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Classes</p>
          <span className="text-xs text-gray-400">
            {classes.length} classe{classes.length !== 1 ? 's' : ''}
          </span>
        </div>

        {classes.length === 0 ? (
          <div className="bg-white px-5 py-8 text-center">
            <p className="text-sm text-gray-500">Aucune classe pour cette année.</p>
            <a
              href="/school/classes/new"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
            >
              Créer une classe →
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 bg-white p-4 sm:grid-cols-3 lg:grid-cols-4">
            {classes.map((cls) => (
              <a
                key={cls.id}
                href={`/school/classes/${cls.id}`}
                className="group flex flex-col gap-1 rounded-lg border border-sand-200 bg-sand-50 p-3 hover:border-primary-300 hover:bg-white transition-all"
              >
                <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 truncate">
                  {cls.name}{cls.section ? ` — ${cls.section}` : ''}
                </p>
                {cls.level && (
                  <p className="text-xs text-gray-400 truncate">{cls.level}</p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Périodes ────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
        <div className="border-b border-sand-200 bg-sand-100 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Périodes académiques</p>
          <span className="text-xs text-gray-400">
            {periods.length} période{periods.length !== 1 ? 's' : ''}
          </span>
        </div>

        {periods.length === 0 ? (
          <div className="bg-white px-5 py-8 text-center">
            <p className="text-sm text-gray-500">Aucune période pour cette année.</p>
            <a
              href="/school/academics/periods/new"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
            >
              Créer une période →
            </a>
          </div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Période</th>
                <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Du</th>
                <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Au</th>
                <th scope="col" className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {periods.map((p, i) => (
                <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-sand-50'}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                  <td className="hidden px-5 py-3 text-xs text-gray-500 whitespace-nowrap sm:table-cell">{fmtDate(p.starts_on)}</td>
                  <td className="hidden px-5 py-3 text-xs text-gray-500 whitespace-nowrap sm:table-cell">{fmtDate(p.ends_on)}</td>
                  <td className="px-5 py-3 text-center">
                    {p.is_active ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Frais scolaires ─────────────────────────────────────────────────── */}
      {fees.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="border-b border-sand-200 bg-sand-100 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Frais scolaires</p>
            <span className="text-xs text-gray-400">{fees.length} poste{fees.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Libellé</th>
                <th scope="col" className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Montant</th>
                <th scope="col" className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {fees.map((f, i) => (
                <tr key={f.id} className={i % 2 === 0 ? 'bg-white' : 'bg-sand-50'}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{f.name}</td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-gray-700">{fmtAmount(f.amount)}</td>
                  <td className="px-5 py-3 text-center">
                    {f.is_active ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Actif</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Gestion ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-red-100 bg-white shadow-sm">
        <div className="border-b border-red-100 bg-red-50 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-red-500">
            Gestion de l&apos;année
          </p>
        </div>
        <div className="px-5 py-4">
          <form action={setYearActive} className="space-y-3">
            <input type="hidden" name="year_id"   value={year.id} />
            <input type="hidden" name="is_active"  value={String(newActive)} />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {isActive ? "Désactiver cette année" : "Activer cette année"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isActive
                    ? "Le calendrier sera conservé mais cette année ne sera plus l'année en cours."
                    : "Cette année deviendra l'année scolaire en cours."}
                </p>
              </div>
              <button
                type="submit"
                className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {isActive ? "Désactiver" : "Activer"}
              </button>
            </div>

            {/* Deactivate-others option — only relevant when activating */}
            {!isActive && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-sand-200 bg-sand-50 px-4 py-3">
                <input
                  type="checkbox"
                  name="deactivate_others"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Désactiver les autres années actives
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Recommandé — un seul calendrier actif à la fois.
                  </p>
                </div>
              </label>
            )}
          </form>
        </div>
      </div>

    </div>
  )
}
