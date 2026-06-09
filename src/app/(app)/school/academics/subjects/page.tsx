import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { preloadDefaultSubjects } from '../actions'

const SUBJECT_ERRORS: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  preload:  'Erreur lors du chargement des matières par défaut. Veuillez réessayer.',
}

type Props = { searchParams: { created?: string; skipped?: string; loaded?: string; error?: string } }

export default async function SubjectsPage({ searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rawSubjects } = await supabase
    .from('subjects')
    .select('id, name, code, coefficient, created_at')
    .eq('school_id', schoolId)
    .order('name', { ascending: true })

  type SubjectRow = {
    id: string
    name: string
    code: string | null
    coefficient: number | null
    created_at: string
  }
  const subjects = (rawSubjects ?? []) as SubjectRow[]

  // Success / error banners from preload, template and import flows.
  const created = searchParams.created !== undefined ? Number(searchParams.created) : null
  const skipped = searchParams.skipped !== undefined ? Number(searchParams.skipped) : 0
  let successMessage = ''
  if (searchParams.loaded === '1') {
    successMessage = created && created > 0
      ? `${created} matière${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''}, ${skipped} déjà existante${skipped > 1 ? 's' : ''}.`
      : 'Toutes les matières par défaut sont déjà chargées.'
  } else if (created !== null && Number.isFinite(created)) {
    successMessage = `${created} matière${created !== 1 ? 's' : ''} créée${created !== 1 ? 's' : ''} avec succès` +
      (skipped > 0 ? `, ${skipped} ignorée${skipped > 1 ? 's' : ''}` : '') + '.'
  }
  const errorMessage = searchParams.error ? (SUBJECT_ERRORS[searchParams.error] ?? '') : ''

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1">
              <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Catalogue des matières</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {subjects.length} matière{subjects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={preloadDefaultSubjects}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
              >
                Charger les matières par défaut
              </button>
            </form>
            <a
              href="/school/academics/subjects/templates"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Création rapide
            </a>
            <a
              href="/school/academics/subjects/import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-600 bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Import CSV
            </a>
            <a
              href="/school/academics/subjects/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              + Nouvelle matière
            </a>
          </div>
        </div>
      </div>

      {/* ── Banners ─────────────────────────────────────────────────────────── */}
      {successMessage && (
        <div role="status" className="rounded-lg border border-primary-200 bg-primary-50 p-4">
          <p className="text-sm font-medium text-primary-800">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* ── Table / empty state ──────────────────────────────────────────────── */}
      {subjects.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-gray-900">Aucune matière</h3>
          <p className="mt-1 text-sm text-gray-500">Créez la première matière de votre catalogue.</p>
          <a
            href="/school/academics/subjects/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            Créer une matière
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Nom</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Code</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Coefficient</th>
                <th className="px-4 py-3"><span className="sr-only">Modifier</span></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <a href={`/school/academics/subjects/${s.id}/edit`} className="hover:text-primary-600 hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-400">
                    {s.code ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {s.coefficient != null ? s.coefficient : '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <a
                      href={`/school/academics/subjects/${s.id}/edit`}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                      aria-label={`Modifier ${s.name}`}
                    >
                      Modifier →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

    </div>
  )
}
