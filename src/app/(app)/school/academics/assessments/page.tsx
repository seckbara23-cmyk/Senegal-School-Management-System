import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_LABEL: Record<string, string> = {
  devoir:        'Devoir',
  composition:   'Composition',
  examen:        'Examen',
  participation: 'Participation',
  autre:         'Autre',
}

const ERROR_MSG: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. La saisie des notes est désactivée.',
  invalid:  'Évaluation introuvable ou invalide.',
}

type Props = {
  searchParams: { period_id?: string; class_id?: string; error?: string }
}

export default async function AssessmentsPage({ searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const [periodsRes, classesRes] = await Promise.all([
    supabase
      .from('academic_periods')
      .select('id, name, academic_years!academic_year_id(name)')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),

    supabase
      .from('classes')
      .select('id, name, level')
      .eq('school_id', schoolId)
      .order('name', { ascending: true }),
  ])

  type PeriodRow = { id: string; name: string; academic_years: { name: string } }
  type ClassRow  = { id: string; name: string; level: string | null }

  const periods = (periodsRes.data ?? []) as unknown as PeriodRow[]
  const classes = (classesRes.data ?? []) as ClassRow[]

  const selectedPeriodId = periods.some((p) => p.id === searchParams.period_id)
    ? searchParams.period_id!
    : null
  const selectedClassId = classes.some((c) => c.id === searchParams.class_id)
    ? searchParams.class_id!
    : null

  // Build assessment query
  let query = supabase
    .from('assessments')
    .select(`
      id, title, assessment_type, coefficient, max_score, assessment_date,
      class_subjects!class_subject_id(
        classes!class_id(id, name, level),
        subjects!subject_id(name, code)
      ),
      academic_periods!academic_period_id(id, name)
    `)
    .eq('school_id', schoolId)
    .order('assessment_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (selectedPeriodId) query = query.eq('academic_period_id', selectedPeriodId)
  if (selectedClassId) {
    // Need to filter by class through class_subjects — do this via a subquery approach
    const { data: csIds } = await supabase
      .from('class_subjects')
      .select('id')
      .eq('school_id', schoolId)
      .eq('class_id', selectedClassId)
    const ids = ((csIds ?? []) as { id: string }[]).map((c) => c.id)
    if (ids.length === 0) {
      // No assignments for this class — empty result
      return renderPage({ assessments: [], periods, classes, selectedPeriodId, selectedClassId })
    }
    query = query.in('class_subject_id', ids)
  }

  const { data: rawAssessments } = await query

  type AssessmentRow = {
    id: string
    title: string
    assessment_type: string
    coefficient: number
    max_score: number
    assessment_date: string | null
    class_subjects: {
      classes: { id: string; name: string; level: string | null }
      subjects: { name: string; code: string | null }
    }
    academic_periods: { id: string; name: string }
  }
  const assessments = (rawAssessments ?? []) as unknown as AssessmentRow[]

  return renderPage({ assessments, periods, classes, selectedPeriodId, selectedClassId })

  function renderPage(props: {
    assessments: AssessmentRow[]
    periods: PeriodRow[]
    classes: ClassRow[]
    selectedPeriodId: string | null
    selectedClassId: string | null
  }) {
    const { assessments, periods, classes, selectedPeriodId, selectedClassId } = props
    const hasFilter = !!(selectedPeriodId || selectedClassId)
    const errorMsg = searchParams.error ? (ERROR_MSG[searchParams.error] ?? '') : ''

    return (
      <div className="space-y-6">

        {/* ── Error banner (from saveGrades) ─────────────────────────────────── */}
        {errorMsg && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1">
                <a href="/school/academics" className="text-primary-300 hover:text-white text-sm">← Académique</a>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Évaluations</h1>
              <p className="text-primary-300 text-sm mt-0.5">
                {assessments.length} évaluation{assessments.length !== 1 ? 's' : ''}
              </p>
            </div>
            <a
              href="/school/academics/assessments/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              + Nouvelle évaluation
            </a>
          </div>
        </div>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        {(periods.length > 0 || classes.length > 0) && (
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
            {periods.length > 0 && (
              <div>
                <label htmlFor="period_id" className="block text-xs font-medium text-gray-600 mb-1">Période</label>
                <select
                  id="period_id"
                  name="period_id"
                  defaultValue={selectedPeriodId ?? ''}
                  className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                >
                  <option value="">Toutes les périodes</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.academic_years.name}</option>
                  ))}
                </select>
              </div>
            )}
            {classes.length > 0 && (
              <div>
                <label htmlFor="class_id" className="block text-xs font-medium text-gray-600 mb-1">Classe</label>
                <select
                  id="class_id"
                  name="class_id"
                  defaultValue={selectedClassId ?? ''}
                  className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                >
                  <option value="">Toutes les classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
              >
                Filtrer
              </button>
              {hasFilter && (
                <a
                  href="/school/academics/assessments"
                  className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-sand-100 transition-colors"
                >
                  Tout afficher
                </a>
              )}
            </div>
          </form>
        )}

        {/* ── Table / empty state ─────────────────────────────────────────── */}
        {assessments.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
            <h3 className="text-base font-semibold text-gray-900">Aucune évaluation</h3>
            <p className="mt-1 text-sm text-gray-500">
              {hasFilter ? 'Aucun résultat pour ces filtres.' : 'Créez la première évaluation.'}
            </p>
            {!hasFilter && (
              <a
                href="/school/academics/assessments/new"
                className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                Nouvelle évaluation
              </a>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-primary-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Évaluation</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Classe · Matière</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Période</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Barème</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-right">Coeff.</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a, idx) => (
                  <tr
                    key={a.id}
                    className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-400">{TYPE_LABEL[a.assessment_type] ?? a.assessment_type}</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <p className="text-gray-800 font-medium text-xs">{a.class_subjects.classes.name}</p>
                      <p className="text-gray-400 text-xs">{a.class_subjects.subjects.name}</p>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs">
                      {a.academic_periods.name}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right font-semibold text-gray-700 text-xs">
                      /{a.max_score}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right text-gray-500 text-xs">
                      {a.coefficient}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {fmtDate(a.assessment_date)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/school/academics/assessments/${a.id}`}
                        className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
                      >
                        Notes →
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
}
