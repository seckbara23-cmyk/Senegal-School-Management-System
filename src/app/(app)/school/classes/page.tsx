import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type AcademicYear = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  is_active: boolean
}

type ClassRow = {
  id: string
  name: string
  level: string | null
  section: string | null
  created_at: string
  academic_year_id: string
  academic_years: AcademicYear
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { searchParams: { created?: string; skipped?: string; deleted?: string } }

export default async function ClassesPage({ searchParams }: Props) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string }

  // Fetch classes with their academic year in one query.
  const { data: rawClasses, error } = await supabase
    .from('classes')
    .select(
      'id, name, level, section, created_at, academic_year_id, academic_years!academic_year_id(id, name, starts_on, ends_on, is_active)'
    )
    .eq('school_id', school.id)
    .order('created_at', { ascending: true })

  const classes = (rawClasses ?? []) as unknown as ClassRow[]

  // Fetch active enrollment counts per class in a second query.
  // Two small queries are clearer than a complex embedded count for phase 1.
  const classIds = classes.map((c) => c.id)
  const countByClass: Record<string, number> = {}

  if (classIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('student_class_enrollments')
      .select('class_id')
      .eq('school_id', school.id)
      .eq('status', 'active')
      .in('class_id', classIds)

    for (const e of enrollments ?? []) {
      const cid = (e as { class_id: string }).class_id
      countByClass[cid] = (countByClass[cid] ?? 0) + 1
    }
  }

  // Group classes by academic year, active years first.
  const yearMap = new Map<string, { year: AcademicYear; classes: ClassRow[] }>()
  for (const cls of classes) {
    const yr = cls.academic_years
    if (!yearMap.has(yr.id)) yearMap.set(yr.id, { year: yr, classes: [] })
    yearMap.get(yr.id)!.classes.push(cls)
  }
  const groups = Array.from(yearMap.values()).sort((a, b) =>
    a.year.is_active === b.year.is_active ? 0 : a.year.is_active ? -1 : 1
  )

  const totalClasses = classes.length

  // Success banners from bulk create / import / delete.
  const created = Number(searchParams.created ?? '')
  const skipped = Number(searchParams.skipped ?? '')
  const showCreated = Number.isFinite(created) && (searchParams.created !== undefined)
  const successMessage = showCreated
    ? `${created} classe${created !== 1 ? 's' : ''} créée${created !== 1 ? 's' : ''} avec succès.` +
      (Number.isFinite(skipped) && skipped > 0 ? ` ${skipped} déjà existante${skipped !== 1 ? 's' : ''} ignorée${skipped !== 1 ? 's' : ''}.` : '')
    : searchParams.deleted === '1'
      ? 'Classe supprimée avec succès.'
      : ''

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="flex items-center text-sm text-gray-500 mb-1" aria-label="Fil d'Ariane">
            <a href="/school" className="hover:text-primary-600 hover:underline">
              Administration
            </a>
            <span className="mx-2 select-none" aria-hidden="true">/</span>
            <span className="font-medium text-gray-900">Classes</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
        </div>

        <div className="flex items-center gap-3">
          {totalClasses > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
              {totalClasses} classe{totalClasses !== 1 ? 's' : ''}
            </span>
          )}
          <a
            href="/school/classes/templates"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Création rapide
          </a>
          <a
            href="/school/classes/import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Importer
          </a>
          <a
            href="/school/classes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle classe
          </a>
        </div>
      </div>

      {/* ── Success banner ──────────────────────────────────────────────────── */}
      {successMessage && (
        <div role="status" className="rounded-lg border border-primary-200 bg-primary-50 p-4">
          <p className="text-sm font-medium text-primary-800">{successMessage}</p>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement des classes. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!error && totalClasses === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <svg
            className="mx-auto h-12 w-12 text-sand-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Aucune classe créée</h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par créer la première classe de votre établissement.
          </p>
          <a
            href="/school/classes/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter une classe
          </a>
        </div>
      )}

      {/* ── Class groups by academic year ────────────────────────────────────── */}
      {!error && groups.map(({ year, classes: yearClasses }) => (
        <div key={year.id} className="space-y-3">
          {/* Year header */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">{year.name}</h2>
            {year.is_active && (
              <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                En cours
              </span>
            )}
            <span className="text-xs text-gray-400">
              {yearClasses.length} classe{yearClasses.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Class cards grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {yearClasses.map((cls: ClassRow) => {
              const count = countByClass[cls.id] ?? 0
              const displayName = [cls.name, cls.section].filter(Boolean).join(' — ')
              return (
                <a
                  key={cls.id}
                  href={`/school/classes/${cls.id}`}
                  className="group flex flex-col gap-2 rounded-xl border border-sand-200 bg-white p-4 shadow-sm hover:border-primary-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-primary-700">
                        {displayName}
                      </p>
                      {cls.level && (
                        <p className="mt-0.5 text-xs text-gray-500">{cls.level}</p>
                      )}
                    </div>
                    <svg
                      className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-primary-500 transition-colors mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-400">
                    {count} élève{count !== 1 ? 's' : ''} inscrit{count !== 1 ? 's' : ''}
                  </p>
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
