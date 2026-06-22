import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q)     params.set('q',    q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/school/teachers?${qs}` : '/school/teachers'
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Teacher = {
  id:              string
  employee_number: string
  first_name:      string
  last_name:       string
  phone:           string | null
  email:           string | null
  status:          string
  profile_id:      string | null
  created_at:      string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { q?: string | string[]; page?: string | string[]; created?: string; skipped?: string }
}

export default async function TeachersPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const schoolId   = (adminMembership as { school_id: string }).school_id
  const schoolName = ((adminMembership as unknown as { schools: { name: string } }).schools?.name) ?? ''

  // ── Parse search params ───────────────────────────────────────────────────
  const rawQ = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q) ?? ''
  const q = rawQ.trim().slice(0, 100).replace(/[,()]/g, '').trim()

  const rawPage = (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) ?? '1'
  const page    = Math.max(1, Number(rawPage) || 1)
  const from    = (page - 1) * PAGE_SIZE
  const to      = from + PAGE_SIZE - 1

  // ── Query ─────────────────────────────────────────────────────────────────
  const base = supabase
    .from('teachers')
    .select(
      'id, employee_number, first_name, last_name, phone, email, status, profile_id, created_at',
      { count: 'exact' }
    )
    .eq('school_id', schoolId)

  const filtered = q
    ? base.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,employee_number.ilike.%${q}%`)
    : base

  const { data: teachers, count: totalCount, error } = await filtered
    .order('last_name',  { ascending: true })
    .order('first_name', { ascending: true })
    .range(from, to)

  const total      = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : from + 1
  const rangeEnd   = Math.min(to + 1, total)

  // Import success banner.
  const created = searchParams.created !== undefined ? Number(searchParams.created) : null
  const skipped = searchParams.skipped !== undefined ? Number(searchParams.skipped) : 0
  const importMessage = created !== null && Number.isFinite(created)
    ? `${created} enseignant${created !== 1 ? 's' : ''} créé${created !== 1 ? 's' : ''}` +
      (skipped > 0 ? `, ${skipped} ignoré${skipped !== 1 ? 's' : ''}` : '') + '.'
    : ''

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Enseignants</h1>
            <p className="mt-0.5 text-sm text-primary-300">{schoolName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <a
            href="/school/teachers/import"
            className="shrink-0 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            Importer
          </a>
          <a
            href="/school/teachers/new"
            className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
          >
            + Nouvel enseignant
          </a>
          </div>
        </div>
      </div>

      {/* ── Import success banner ───────────────────────────────────────────── */}
      {importMessage && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{importMessage}</div>
      )}

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <form method="GET" action="/school/teachers" role="search" className="flex flex-wrap items-center gap-2">
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
            placeholder="Nom, prénom ou matricule…"
            autoComplete="off"
            className="block w-full rounded-lg border border-sand-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors"
        >
          Rechercher
        </button>
        {q && (
          <a href="/school/teachers" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
            Effacer
          </a>
        )}
        {total > 0 && (
          <span className="ml-auto inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
            {total} {q ? `résultat${total !== 1 ? 's' : ''}` : `enseignant${total !== 1 ? 's' : ''}`}
          </span>
        )}
      </form>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Une erreur est survenue lors du chargement. Veuillez réessayer.</p>
        </div>
      )}

      {/* ── Empty (no teachers) ─────────────────────────────────────────────── */}
      {!error && !q && total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-sand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
          <h3 className="mt-4 text-base font-semibold text-gray-900">Aucun enseignant enregistré</h3>
          <p className="mt-1 text-sm text-gray-500">Commencez par créer le premier dossier enseignant.</p>
          <a
            href="/school/teachers/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            + Nouvel enseignant
          </a>
        </div>
      )}

      {/* ── Empty (search) ──────────────────────────────────────────────────── */}
      {!error && q && total === 0 && (
        <div className="rounded-xl border border-sand-200 bg-white py-14 text-center">
          <svg className="mx-auto h-10 w-10 text-sand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h3 className="mt-3 text-base font-semibold text-gray-900">Aucun résultat</h3>
          <p className="mt-1 text-sm text-gray-500">
            Aucun enseignant ne correspond à{' '}
            <span className="font-medium text-gray-700">{`« ${q} »`}</span>.
          </p>
          <a href="/school/teachers" className="mt-4 inline-flex text-sm font-medium text-primary-600 hover:underline">
            Voir tous les enseignants
          </a>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {!error && teachers && teachers.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-sand-200">
                <thead>
                  <tr className="bg-sand-50">
                    <th scope="col" className="sticky left-0 z-10 bg-sand-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Enseignant
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Matricule
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Contact
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Compte
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Statut
                    </th>
                    <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                      Créé le
                    </th>
                    <th scope="col" className="sticky right-0 z-10 bg-sand-50 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {(teachers as Teacher[]).map((t) => (
                    <tr key={t.id} className="group transition-colors hover:bg-sand-50">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3.5 group-hover:bg-sand-50 transition-colors">
                        <a
                          href={`/school/teachers/${t.id}`}
                          className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline"
                        >
                          {t.last_name} {t.first_name}
                        </a>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono text-sm text-gray-600">{t.employee_number}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          {t.phone && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <span aria-hidden="true">📞</span> {t.phone}
                            </span>
                          )}
                          {t.email && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[180px]">
                              <span aria-hidden="true">✉</span> {t.email}
                            </span>
                          )}
                          {!t.phone && !t.email && (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {t.profile_id ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            ✓ Lié
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${t.status === 'active' ? 'bg-primary-50 text-primary-700' : 'bg-stone-100 text-stone-500'}`}>
                          {t.status === 'active' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3.5 whitespace-nowrap text-sm text-gray-400 md:table-cell">
                        {fmtDate(t.created_at)}
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-4 py-3.5 group-hover:bg-sand-50 transition-colors text-right">
                        <a
                          href={`/school/teachers/${t.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                          aria-label={`Voir le dossier de ${t.last_name} ${t.first_name}`}
                        >
                          Voir →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-sand-100 sm:hidden">
              {(teachers as Teacher[]).map((t) => (
                <a
                  key={t.id}
                  href={`/school/teachers/${t.id}`}
                  className="flex items-start gap-3 px-4 py-4 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                    {t.first_name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{t.last_name} {t.first_name}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{t.employee_number}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === 'active' ? 'bg-primary-50 text-primary-700' : 'bg-stone-100 text-stone-500'}`}>
                        {t.status === 'active' ? 'Actif' : 'Inactif'}
                      </span>
                      {t.profile_id && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Compte lié
                        </span>
                      )}
                    </div>
                    {(t.phone || t.email) && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {t.phone ?? t.email}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-300 shrink-0 mt-1">→</span>
                </a>
              ))}
            </div>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              {rangeStart === rangeEnd
                ? `Enseignant ${rangeStart} sur ${total}`
                : `Enseignants ${rangeStart}–${rangeEnd} sur ${total}`}
              {q && (
                <span> correspondant à <span className="font-medium text-gray-700">{`« ${q} »`}</span></span>
              )}
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <a href={buildUrl(q, page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Précédent
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed select-none">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Précédent
                  </span>
                )}
                <span className="px-2 text-sm text-gray-400">{page} / {totalPages}</span>
                {page < totalPages ? (
                  <a href={buildUrl(q, page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50 transition-colors">
                    Suivant
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-300 cursor-not-allowed select-none">
                    Suivant
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
