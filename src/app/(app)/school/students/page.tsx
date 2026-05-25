import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type Student = {
  id: string
  admission_number: string
  first_name: string
  last_name: string
  gender: string | null
  date_of_birth: string | null
  status: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const STATUS_LABEL: Record<string, string> = {
  active:    'Actif',
  inactive:  'Inactif',
  graduated: 'Diplômé',
}

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-primary-50 text-primary-700',
  inactive:  'bg-stone-100 text-stone-500',
  graduated: 'bg-sky-50 text-sky-700',
}

const GENDER_LABEL: Record<string, string> = {
  male:   'M',
  female: 'F',
  other:  'Autre',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Builds a /school/students URL preserving the search term and setting a
// specific page. Omits params with default values to keep URLs clean.
function buildUrl(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/school/students?${qs}` : '/school/students'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { q?: string | string[]; page?: string | string[] }
}

export default async function StudentsPage({ searchParams }: Props) {
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

  // ── Parse and sanitise search params ──────────────────────────────────────
  // Take only the first value if the param appears multiple times.
  const rawQ = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q) ?? ''
  // Trim, cap length, and remove characters that would break PostgREST's
  // or() filter syntax (comma = condition separator, parens = grouping).
  const q = rawQ.trim().slice(0, 100).replace(/[,()]/g, '').trim()

  const rawPage = (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) ?? '1'
  const page    = Math.max(1, Number(rawPage) || 1)
  const from    = (page - 1) * PAGE_SIZE
  const to      = from + PAGE_SIZE - 1

  // ── Supabase query (search + pagination) ─────────────────────────────────
  // school_id is ALWAYS taken from the DB membership — never from the URL.
  const base = supabase
    .from('students')
    .select(
      'id, admission_number, first_name, last_name, gender, date_of_birth, status, created_at',
      { count: 'exact' }
    )
    .eq('school_id', school.id)

  const filtered = q
    ? base.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
      )
    : base

  const { data: students, count: totalCount, error } = await filtered
    .order('last_name',  { ascending: true })
    .order('first_name', { ascending: true })
    .range(from, to)

  // ── Pagination arithmetic ─────────────────────────────────────────────────
  const total      = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : from + 1
  const rangeEnd   = Math.min(to + 1, total)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="flex items-center text-sm text-gray-500 mb-1" aria-label="Fil d'Ariane">
            <a href="/school" className="hover:text-primary-600 hover:underline">
              Administration
            </a>
            <span className="mx-2 select-none" aria-hidden="true">/</span>
            <span className="font-medium text-gray-900">Élèves</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Élèves</h1>
          <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
        </div>

        <div className="flex items-center gap-3">
          {total > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
              {total}{' '}
              {q
                ? `résultat${total !== 1 ? 's' : ''}`
                : `élève${total !== 1 ? 's' : ''}`}
            </span>
          )}
          <a
            href="/school/students/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un élève
          </a>
        </div>
      </div>

      {/* ── Search form ───────────────────────────────────────────────────── */}
      <form
        method="GET"
        action="/school/students"
        role="search"
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[14rem] max-w-sm">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechercher un élève, un matricule…"
            autoComplete="off"
            className="block w-full rounded-lg border border-sand-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
        >
          Rechercher
        </button>
        {q && (
          <a
            href="/school/students"
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            Effacer
          </a>
        )}
      </form>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement des élèves. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* ── Empty: no students enrolled at all ────────────────────────────── */}
      {!error && !q && total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-sand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Aucun élève inscrit</h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par enregistrer le premier élève de votre établissement.
          </p>
          <a
            href="/school/students/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un élève
          </a>
        </div>
      )}

      {/* ── Empty: search returned no results ─────────────────────────────── */}
      {!error && q && total === 0 && (
        <div className="rounded-xl border border-sand-200 bg-white py-14 text-center">
          <svg className="mx-auto h-10 w-10 text-sand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h3 className="mt-3 text-base font-semibold text-gray-900">Aucun résultat</h3>
          <p className="mt-1 text-sm text-gray-500">
            Aucun élève ne correspond à{' '}
            <span className="font-medium text-gray-700">{`« ${q} »`}</span>.
          </p>
          <a
            href="/school/students"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
          >
            Voir tous les élèves
          </a>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {!error && students && students.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-sand-200">
                <thead>
                  <tr className="bg-sand-50">
                    <th scope="col" className="sticky left-0 z-10 bg-sand-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Nom
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      N° d&apos;admission
                    </th>
                    <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                      Sexe
                    </th>
                    <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                      Naissance
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Statut
                    </th>
                    <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                      Inscription
                    </th>
                    <th scope="col" className="sticky right-0 z-10 bg-sand-50 px-4 py-3">
                      <span className="sr-only">Voir le dossier</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {(students as Student[]).map((student) => (
                    <tr key={student.id} className="group transition-colors hover:bg-sand-50">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3.5 group-hover:bg-sand-50 transition-colors">
                        <a
                          href={`/school/students/${student.id}`}
                          className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline"
                        >
                          {student.last_name} {student.first_name}
                        </a>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono text-sm text-gray-600">
                          {student.admission_number}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3.5 whitespace-nowrap sm:table-cell">
                        <span className="text-sm text-gray-500">
                          {student.gender ? (GENDER_LABEL[student.gender] ?? student.gender) : '—'}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3.5 whitespace-nowrap md:table-cell">
                        <span className="text-sm text-gray-500">{formatDate(student.date_of_birth)}</span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[student.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[student.status] ?? student.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3.5 whitespace-nowrap text-sm text-gray-400 md:table-cell">
                        {formatDate(student.created_at)}
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-4 py-3.5 group-hover:bg-sand-50 transition-colors text-right">
                        <a
                          href={`/school/students/${student.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                          aria-label={`Voir le dossier de ${student.last_name} ${student.first_name}`}
                        >
                          Voir →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Range info */}
            <p className="text-sm text-gray-500">
              {rangeStart === rangeEnd
                ? `Élève ${rangeStart} sur ${total}`
                : `Élèves ${rangeStart}–${rangeEnd} sur ${total}`}
              {q && (
                <span>
                  {' '}correspondant à{' '}
                  <span className="font-medium text-gray-700">{`« ${q} »`}</span>
                </span>
              )}
            </p>

            {/* Prev / Next */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <a
                    href={buildUrl(q, page - 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Précédent
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed select-none">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Précédent
                  </span>
                )}

                <span className="px-2 text-sm text-gray-400">
                  {page} / {totalPages}
                </span>

                {page < totalPages ? (
                  <a
                    href={buildUrl(q, page + 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
                  >
                    Suivant
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed select-none">
                    Suivant
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
