import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type ParentRow = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  occupation: string | null
  status: string
  profile_id: string | null
  parent_student_links: { id: string }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q)      params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/school/parents${qs ? '?' + qs : ''}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { q?: string | string[]; page?: string | string[]; created?: string; skipped?: string; linked?: string }
}

export default async function ParentsPage({ searchParams }: Props) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: adminMembership } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!adminMembership) redirect('/school')

  const schoolId = (adminMembership as { school_id: string }).school_id
  const school = (adminMembership as unknown as { schools: { name: string } }).schools

  const rawQ    = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page

  const q    = rawQ?.trim().slice(0, 100).replace(/[,()]/g, '').trim() ?? ''
  const page = Math.max(1, Number(rawPage) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  let query = supabase
    .from('parents')
    .select(
      'id, first_name, last_name, phone, email, occupation, status, profile_id, parent_student_links!parent_id(id)',
      { count: 'exact' }
    )
    .eq('school_id', schoolId)
    .order('last_name')
    .order('first_name')
    .range(from, to)

  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
    )
  }

  const { data: rawParents, count: totalCount, error } = await query

  const parents    = (rawParents ?? []) as unknown as ParentRow[]
  const total      = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Import success banner.
  const created = searchParams.created !== undefined ? Number(searchParams.created) : null
  const skipped = searchParams.skipped !== undefined ? Number(searchParams.skipped) : 0
  const linked  = searchParams.linked  !== undefined ? Number(searchParams.linked)  : 0
  const importMessage = created !== null && Number.isFinite(created)
    ? `${created} parent${created !== 1 ? 's' : ''} créé${created !== 1 ? 's' : ''}` +
      (skipped > 0 ? `, ${skipped} ignoré${skipped !== 1 ? 's' : ''}` : '') + '.' +
      (linked > 0 ? ` ${linked} lien${linked !== 1 ? 's' : ''} parent-élève créé${linked !== 1 ? 's' : ''}.` : '')
    : ''

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">Administration</a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Parents &amp; Tuteurs</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Dossiers Parents &amp; Tuteurs
            </h1>
            <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/school/parents/import"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Importer
            </a>
            <a
              href="/school/parents/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nouveau dossier
            </a>
          </div>
        </div>
        {total > 0 && !q && (
          <div className="mt-4 pt-4 border-t border-primary-700">
            <p className="text-sm text-primary-300">
              <span className="font-semibold text-white">{total}</span>{' '}
              dossier{total !== 1 ? 's' : ''} enregistré{total !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Import success banner ───────────────────────────────────────────── */}
      {importMessage && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{importMessage}</div>
      )}

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <form method="GET" action="/school/parents" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher par nom ou téléphone…"
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
            href="/school/parents"
            className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-sand-50 transition-colors"
          >
            ✕ Effacer
          </a>
        )}
      </form>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement des dossiers. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* ── Empty: no parents at all ─────────────────────────────────────────── */}
      {!error && total === 0 && !q && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sand-200">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Aucun dossier enregistré</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xs mx-auto">
            Créez le premier dossier de parent ou tuteur pour lier des élèves à leurs responsables.
          </p>
          <a
            href="/school/parents/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Créer un dossier
          </a>
        </div>
      )}

      {/* ── Empty: no search results ─────────────────────────────────────────── */}
      {!error && total === 0 && q && (
        <div className="rounded-xl border border-sand-200 bg-white py-12 px-6 text-center shadow-sm">
          <p className="text-base font-medium text-gray-900">
            Aucun résultat pour &ldquo;{q}&rdquo;
          </p>
          <p className="mt-1 text-sm text-gray-500">Vérifiez l&apos;orthographe ou le numéro.</p>
          <a href="/school/parents" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Voir tous les dossiers
          </a>
        </div>
      )}

      {/* ── Results header (search context) ─────────────────────────────────── */}
      {!error && total > 0 && q && (
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{total}</span>{' '}
          résultat{total !== 1 ? 's' : ''} pour &ldquo;{q}&rdquo;
        </p>
      )}

      {/* ── Register table ──────────────────────────────────────────────────── */}
      {!error && parents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Nom du responsable
                  </th>
                  <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Téléphone
                  </th>
                  <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Profession
                  </th>
                  <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Compte
                  </th>
                  <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Statut
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Élèves liés
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Voir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {parents.map((p) => {
                  const childCount = p.parent_student_links.length
                  return (
                    <tr key={p.id} className="odd:bg-white even:bg-sand-50 hover:bg-accent-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-gray-900">
                          {p.last_name} {p.first_name}
                        </span>
                      </td>
                      <td className="hidden px-5 py-3.5 whitespace-nowrap sm:table-cell">
                        {p.phone ? (
                          <a
                            href={`tel:${p.phone}`}
                            className="font-mono text-sm text-primary-700 hover:text-primary-900 hover:underline"
                          >
                            {p.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="hidden px-5 py-3.5 whitespace-nowrap md:table-cell">
                        <span className="text-sm text-gray-500">{p.occupation ?? '—'}</span>
                      </td>
                      <td className="hidden px-5 py-3.5 whitespace-nowrap lg:table-cell">
                        {p.profile_id ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Compte lié
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="hidden px-5 py-3.5 whitespace-nowrap lg:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${p.status === 'active' ? 'bg-primary-50 text-primary-700' : 'bg-stone-100 text-stone-500'}`}>
                          {p.status === 'active' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {childCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                            {childCount} élève{childCount !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">Aucun lien</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <a
                          href={`/school/parents/${p.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          Dossier →
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
            Dossiers {from + 1}–{Math.min(to + 1, total)} sur {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a
                href={buildUrl(q, page - 1)}
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
                href={buildUrl(q, page + 1)}
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
