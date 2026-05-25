import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { EnrollForm, type StudentOption } from './_form'

// ─── Constants & helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 20

function buildUrl(classId: string, q: string, page: number): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs
    ? `/school/classes/${classId}/enroll?${qs}`
    : `/school/classes/${classId}/enroll`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  params: { classId: string }
  searchParams: { q?: string | string[]; page?: string | string[] }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EnrollPage({ params, searchParams }: Props) {
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

  // Fetch class — verify it belongs to this school.
  const { data: rawClass } = await supabase
    .from('classes')
    .select(
      'id, name, section, academic_year_id, academic_years!academic_year_id(name)'
    )
    .eq('id', params.classId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!rawClass) notFound()

  const cls = rawClass as unknown as {
    id: string
    name: string
    section: string | null
    academic_year_id: string
    academic_years: { name: string }
  }
  const displayName = [cls.name, cls.section].filter(Boolean).join(' — ')
  const cancelHref = `/school/classes/${cls.id}`

  // ── Search params ──────────────────────────────────────────────────────────
  const rawQ = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q) ?? ''
  const q = rawQ.trim().slice(0, 100).replace(/[,()]/g, '').trim()

  const rawPage = (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) ?? '1'
  const page    = Math.max(1, Number(rawPage) || 1)
  const from    = (page - 1) * PAGE_SIZE
  const to      = from + PAGE_SIZE - 1

  // ── Fetch enrolled student IDs (active only) ───────────────────────────────
  const { data: enrolledRows } = await supabase
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', cls.id)
    .eq('status', 'active')

  const enrolledIds = (enrolledRows ?? []).map(
    (r) => (r as { student_id: string }).student_id
  )

  // ── Query available students ───────────────────────────────────────────────
  // Start with all active students in this school.
  let baseQuery = supabase
    .from('students')
    .select('id, first_name, last_name, admission_number, status', { count: 'exact' })
    .eq('school_id', school.id)

  // Exclude students already actively enrolled in this class.
  if (enrolledIds.length > 0) {
    baseQuery = baseQuery.not('id', 'in', `(${enrolledIds.join(',')})`)
  }

  // Apply search filter.
  const filtered = q
    ? baseQuery.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
      )
    : baseQuery

  const { data: rawStudents, count: totalCount } = await filtered
    .order('last_name',  { ascending: true })
    .order('first_name', { ascending: true })
    .range(from, to)

  const students     = (rawStudents ?? []) as StudentOption[]
  const total        = totalCount ?? 0
  const totalPages   = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart   = total === 0 ? 0 : from + 1
  const rangeEnd     = Math.min(to + 1, total)

  return (
    <div className="space-y-5">

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <nav
        className="flex flex-wrap items-center gap-y-1 text-sm text-gray-500"
        aria-label="Fil d'Ariane"
      >
        <a href="/school" className="hover:text-primary-600 hover:underline">Administration</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <a href="/school/classes" className="hover:text-primary-600 hover:underline">Classes</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <a href={cancelHref} className="hover:text-primary-600 hover:underline truncate max-w-[10rem]">
          {displayName}
        </a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <span className="font-medium text-gray-900">Ajouter des élèves</span>
      </nav>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajouter des élèves</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {displayName} — {cls.academic_years.name} — {school.name}
        </p>
      </div>

      {/* ── Search form ───────────────────────────────────────────────────── */}
      <form
        method="GET"
        action={`/school/classes/${cls.id}/enroll`}
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
            href={`/school/classes/${cls.id}/enroll`}
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            Effacer
          </a>
        )}
      </form>

      {/* ── Range info ────────────────────────────────────────────────────── */}
      {total > 0 && (
        <p className="text-sm text-gray-500">
          {rangeStart === rangeEnd
            ? `1 élève disponible`
            : `Élèves ${rangeStart}–${rangeEnd} sur ${total} disponibles`}
          {q && (
            <span>
              {' '}correspondant à{' '}
              <span className="font-medium text-gray-700">{`« ${q} »`}</span>
            </span>
          )}
        </p>
      )}

      {/* ── Empty: no students available ──────────────────────────────────── */}
      {total === 0 && !q && (
        <div className="rounded-xl border border-sand-200 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Tous les élèves sont déjà inscrits</p>
          <p className="mt-1 text-sm text-gray-500">
            Tous les élèves actifs de l&apos;établissement sont déjà inscrits dans cette classe.
          </p>
          <a
            href={cancelHref}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Retour à la classe
          </a>
        </div>
      )}

      {/* ── Empty: search returned nothing ────────────────────────────────── */}
      {total === 0 && q && (
        <div className="rounded-xl border border-sand-200 bg-white py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun résultat</p>
          <p className="mt-1 text-sm text-gray-500">
            Aucun élève disponible ne correspond à{' '}
            <span className="font-medium text-gray-700">{`« ${q} »`}</span>.
          </p>
          <a
            href={`/school/classes/${cls.id}/enroll`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
          >
            Voir tous les élèves disponibles
          </a>
        </div>
      )}

      {/* ── Enrollment form ───────────────────────────────────────────────── */}
      {total > 0 && (
        <EnrollForm students={students} classId={cls.id} cancelHref={cancelHref} />
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {total > 0 && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a
                href={buildUrl(cls.id, q, page - 1)}
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

            <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>

            {page < totalPages ? (
              <a
                href={buildUrl(cls.id, q, page + 1)}
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
        </div>
      )}
    </div>
  )
}
