import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { emptyCounts, tallyStatuses, attendanceRate, rateTone, RATE_TEXT_CLASS } from '@/lib/attendance'

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

  // ── Today's overview ────────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10)
  const { data: todaySessionsData } = await supabase
    .from('attendance_sessions')
    .select('id')
    .eq('school_id', school.id)
    .eq('session_date', todayISO)
  const todaySessionIds = ((todaySessionsData ?? []) as { id: string }[]).map((s) => s.id)

  let todayCounts = emptyCounts()
  if (todaySessionIds.length > 0) {
    const { data: todayRecs } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('school_id', school.id)
      .in('session_id', todaySessionIds)
    todayCounts = tallyStatuses((todayRecs ?? []) as { status: string }[])
  }
  const todayRate = attendanceRate(todayCounts)
  const todayTone = rateTone(todayRate)

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">
            Administration
          </a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Présences</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Registre des Présences
            </h1>
            <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/school/attendance/summary"
              className="inline-flex items-center gap-2 rounded-lg border border-primary-600 bg-primary-700/40 px-4 py-2 text-sm font-semibold text-primary-100 hover:bg-primary-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Statistiques
            </a>
            <a
              href="/school/attendance/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle séance
            </a>
          </div>
        </div>

        {total > 0 && (
          <div className="mt-4 pt-4 border-t border-primary-700">
            <p className="text-sm text-primary-300">
              <span className="font-semibold text-white">{total}</span>{' '}
              séance{total !== 1 ? 's' : ''} enregistrée{total !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Today's overview ────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Aujourd&apos;hui</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Présents</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{todayCounts.present}</p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Absents</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{todayCounts.absent}</p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">En retard</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{todayCounts.late}</p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assiduité</p>
            <p className={`mt-1 text-2xl font-bold ${RATE_TEXT_CLASS[todayTone]}`}>{todayRate !== null ? `${todayRate}%` : '—'}</p>
          </div>
        </div>
        {todayCounts.total === 0 && (
          <p className="mt-2 text-xs text-gray-400">Aucune présence enregistrée aujourd&apos;hui.</p>
        )}
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
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-200">
            <svg
              className="h-8 w-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">
            Aucune séance enregistrée
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs mx-auto">
            Ouvrez la première séance de présences pour l&apos;une de vos classes.
          </p>
          <a
            href="/school/attendance/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ouvrir une séance
          </a>
        </div>
      )}

      {/* ── Register table ──────────────────────────────────────────────────── */}
      {!error && sessions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100">
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
                    <tr key={s.id} className="odd:bg-white even:bg-sand-50 hover:bg-accent-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-gray-900 capitalize">
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
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-xs font-medium text-primary-700">
                            <span className="text-primary-500" aria-hidden="true">● </span>
                            {counts.present} pré.
                          </span>
                          <span className="text-xs font-medium text-red-700">
                            <span className="text-red-500" aria-hidden="true">● </span>
                            {counts.absent} abs.
                          </span>
                          {counts.late > 0 && (
                            <span className="text-xs font-medium text-amber-700">
                              <span className="text-amber-500" aria-hidden="true">● </span>
                              {counts.late} ret.
                            </span>
                          )}
                          {counts.excused > 0 && (
                            <span className="text-xs font-medium text-sky-700">
                              <span className="text-sky-500" aria-hidden="true">● </span>
                              {counts.excused} exc.
                            </span>
                          )}
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
