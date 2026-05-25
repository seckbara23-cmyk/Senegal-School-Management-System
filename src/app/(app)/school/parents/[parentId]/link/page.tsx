import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { LinkStudentsForm, type AvailableStudent } from './_form'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(parentId: string, q: string, page: number): string {
  const params = new URLSearchParams()
  if (q)        params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/school/parents/${parentId}/link${qs ? '?' + qs : ''}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params:       { parentId: string }
  searchParams: { q?: string | string[]; page?: string | string[] }
}

export default async function LinkStudentsPage({ params, searchParams }: Props) {
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

  // Verify the parent belongs to this school
  const { data: parent } = await supabase
    .from('parents')
    .select('id, first_name, last_name')
    .eq('id', params.parentId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!parent) notFound()

  const parentName = `${parent.last_name} ${parent.first_name}`

  // Fetch already-linked student IDs to exclude them
  const { data: existingLinks } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', params.parentId)
    .eq('school_id', school.id)

  const linkedIds = (existingLinks ?? []).map((l) => (l as { student_id: string }).student_id)

  // Parse search params
  const rawQ    = Array.isArray(searchParams.q)    ? searchParams.q[0]    : searchParams.q
  const rawPage = Array.isArray(searchParams.page)  ? searchParams.page[0] : searchParams.page

  const q    = rawQ?.trim().slice(0, 100).replace(/[,()]/g, '').trim() ?? ''
  const page = Math.max(1, Number(rawPage) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  // Query available students (not yet linked)
  let studentsQuery = supabase
    .from('students')
    .select('id, first_name, last_name, admission_number', { count: 'exact' })
    .eq('school_id', school.id)
    .order('last_name')
    .order('first_name')
    .range(from, to)

  if (linkedIds.length > 0) {
    studentsQuery = studentsQuery.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  if (q) {
    studentsQuery = studentsQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
    )
  }

  const { data: rawStudents, count: totalCount } = await studentsQuery

  const students   = (rawStudents ?? []) as unknown as AvailableStudent[]
  const total      = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const cancelHref = `/school/parents/${params.parentId}`

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center flex-wrap text-sm text-primary-300 mb-3 gap-x-1" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-1 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/parents" className="hover:text-white transition-colors">Parents &amp; Tuteurs</a>
          <span className="mx-1 text-primary-600" aria-hidden="true">/</span>
          <a href={cancelHref} className="hover:text-white transition-colors">{parentName}</a>
          <span className="mx-1 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Lier un élève</span>
        </nav>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Lier des élèves à {parentName}
        </h1>
        <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <form method="GET" action={`/school/parents/${params.parentId}/link`} className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher un élève par nom ou numéro…"
          className="flex-1 rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <button
          type="submit"
          className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-sand-50 transition-colors"
        >
          Chercher
        </button>
        {q && (
          <a
            href={`/school/parents/${params.parentId}/link`}
            className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-sand-50 transition-colors"
          >
            ✕ Effacer
          </a>
        )}
      </form>

      {/* ── All students already linked ───────────────────────────────────── */}
      {total === 0 && !q && linkedIds.length > 0 && (
        <div className="rounded-xl border border-sand-200 bg-white py-12 px-6 text-center shadow-sm">
          <p className="text-base font-medium text-gray-900">
            Tous les élèves sont déjà liés à ce dossier.
          </p>
          <a href={cancelHref} className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            ← Retour au dossier
          </a>
        </div>
      )}

      {/* ── No students in school ─────────────────────────────────────────── */}
      {total === 0 && !q && linkedIds.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-medium text-gray-900">
            Aucun élève enregistré dans l&apos;établissement.
          </p>
          <a href="/school/students/new" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Ajouter un élève →
          </a>
        </div>
      )}

      {/* ── No search results ─────────────────────────────────────────────── */}
      {total === 0 && q && (
        <div className="rounded-xl border border-sand-200 bg-white py-12 px-6 text-center shadow-sm">
          <p className="text-base font-medium text-gray-900">
            Aucun résultat pour &ldquo;{q}&rdquo;
          </p>
          <a href={`/school/parents/${params.parentId}/link`} className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Voir tous les élèves disponibles
          </a>
        </div>
      )}

      {/* ── Results context ───────────────────────────────────────────────── */}
      {total > 0 && q && (
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{total}</span>{' '}
          élève{total !== 1 ? 's' : ''} pour &ldquo;{q}&rdquo;
        </p>
      )}

      {/* ── Link form ────────────────────────────────────────────────────── */}
      {students.length > 0 && (
        <LinkStudentsForm
          students={students}
          parentId={params.parentId}
          cancelHref={cancelHref}
        />
      )}

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Élèves {from + 1}–{Math.min(to + 1, total)} sur {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a href={buildUrl(params.parentId, q, page - 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                ← Précédent
              </a>
            ) : (
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed">
                ← Précédent
              </span>
            )}
            <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
            {page < totalPages ? (
              <a href={buildUrl(params.parentId, q, page + 1)} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
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
