import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusCount = { present: number; absent: number; late: number; excused: number }

type AttendanceSession = {
  id: string
  session_date: string
  notes: string | null
  classes: { name: string; section: string | null }
  academic_years: { name: string }
  attendance_records: { status: string }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

const STATUS_CHIP: Record<keyof StatusCount, string> = {
  present: 'bg-primary-50 text-primary-700',
  absent:  'bg-red-50    text-red-700',
  late:    'bg-amber-50  text-amber-700',
  excused: 'bg-sky-50    text-sky-700',
}

const STATUS_LABEL: Record<keyof StatusCount, string> = {
  present: 'Pres.',
  absent:  'Abs.',
  late:    'Ret.',
  excused: 'Exc.',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSessionDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function countStatuses(records: { status: string }[]): StatusCount {
  return records.reduce(
    (acc, r) => {
      const k = r.status as keyof StatusCount
      if (k in acc) acc[k]++
      return acc
    },
    { present: 0, absent: 0, late: 0, excused: 0 }
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { page?: string | string[] }
}

export default async function AttendancePage({ searchParams }: Props) {
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

  const rawPage = (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) ?? '1'
  const page    = Math.max(1, Number(rawPage) || 1)
  const from    = (page - 1) * PAGE_SIZE
  const to      = from + PAGE_SIZE - 1

  const { data: rawSessions, count: totalCount, error } = await supabase
    .from('attendance_sessions')
    .select(
      'id, session_date, notes, classes!class_id(name, section), academic_years!academic_year_id(name), attendance_records!session_id(status)',
      { count: 'exact' }
    )
    .eq('school_id', school.id)
    .order('session_date', { ascending: false })
    .range(from, to)

  const sessions   = (rawSessions ?? []) as unknown as AttendanceSession[]
  const total      = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
            <span className="font-medium text-gray-900">Présences</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Présences</h1>
          <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
        </div>

        <div className="flex items-center gap-3">
          {total > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
              {total} séance{total !== 1 ? 's' : ''}
            </span>
          )}
          <a
            href="/school/attendance/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle séance
          </a>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement des séances. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!error && total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <svg
            className="mx-auto h-12 w-12 text-sand-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Aucune séance enregistrée</h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par saisir la première séance de présences.
          </p>
          <a
            href="/school/attendance/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle séance
          </a>
        </div>
      )}

      {/* ── Session list ────────────────────────────────────────────────────── */}
      {!error && sessions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-sand-200">
              <thead>
                <tr className="bg-sand-50">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Classe
                  </th>
                  <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Année
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Bilan
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Voir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {sessions.map((s) => {
                  const counts    = countStatuses(s.attendance_records)
                  const className = [s.classes.name, s.classes.section].filter(Boolean).join(' — ')
                  return (
                    <tr key={s.id} className="group hover:bg-sand-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {formatSessionDate(s.session_date)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-sm text-gray-700">{className}</span>
                      </td>
                      <td className="hidden px-5 py-3.5 whitespace-nowrap text-sm text-gray-400 sm:table-cell">
                        {s.academic_years.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(counts) as (keyof StatusCount)[]).map((k) => (
                            <span
                              key={k}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[k]}`}
                            >
                              {counts[k]} {STATUS_LABEL[k]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <a
                          href={`/school/attendance/${s.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                          aria-label={`Voir la séance du ${formatSessionDate(s.session_date)}`}
                        >
                          Voir →
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Séances {from + 1}–{Math.min(to + 1, total)} sur {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a
                href={`/school/attendance?page=${page - 1}`}
                className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
              >
                ← Précédent
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                ← Précédent
              </span>
            )}
            <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
            {page < totalPages ? (
              <a
                href={`/school/attendance?page=${page + 1}`}
                className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
              >
                Suivant →
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                Suivant →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
