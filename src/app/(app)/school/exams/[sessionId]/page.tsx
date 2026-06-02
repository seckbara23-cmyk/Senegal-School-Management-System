import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { setExamSessionStatus, publishExamResults, unpublishExamResults } from '../actions'
import { getPublicationState } from '@/lib/exam-publications'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', active: 'Active', completed: 'Terminée', archived: 'Archivée',
}
const STATUS_CLASS: Record<string, string> = {
  draft:     'border-gray-200 bg-gray-100 text-gray-600',
  active:    'border-emerald-200 bg-emerald-100 text-emerald-700',
  completed: 'border-sky-200 bg-sky-100 text-sky-700',
  archived:  'border-gray-200 bg-gray-100 text-gray-400',
}
const ERROR_MESSAGES: Record<string, string> = {
  readonly:   'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  transition: 'Cette transition de statut n’est pas autorisée.',
  overlap:    "Une session d'examen active existe déjà sur cette période.",
  archived:   'Une session archivée ne peut pas être modifiée.',
  not_completed: 'Seules les sessions terminées peuvent être publiées.',
  incomplete: 'Des notes sont manquantes. Complétez la saisie avant de publier (100 % requis).',
  no_results: 'Aucun résultat à publier.',
  bad_class:  'Classe invalide.',
  server:     'Une erreur est survenue. Veuillez réessayer.',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

type Props = { params: { sessionId: string }; searchParams: { error?: string; published?: string; unpublished?: string } }

function StatusButton({ sessionId, newStatus, label, tone }: { sessionId: string; newStatus: string; label: string; tone: 'primary' | 'sky' | 'neutral' }) {
  const cls =
    tone === 'primary' ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
    : tone === 'sky'   ? 'bg-sky-600 hover:bg-sky-700 text-white'
    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
  return (
    <form action={setExamSessionStatus}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="new_status" value={newStatus} />
      <button type="submit" className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${cls}`}>{label}</button>
    </form>
  )
}

export default async function ExamSessionDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rawSession } = await supabase
    .from('exam_sessions')
    .select('id, name, description, starts_on, ends_on, status, created_at, academic_years!academic_year_id(name)')
    .eq('id', params.sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!rawSession) notFound()

  type Session = {
    id: string; name: string; description: string | null; starts_on: string; ends_on: string
    status: string; created_at: string; academic_years: { name: string } | null
  }
  const s = rawSession as unknown as Session
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''

  // Assessments attached to this session.
  const { data: rawAssessments } = await supabase
    .from('assessments')
    .select('id, title, assessment_date, coefficient, max_score, class_subjects!class_subject_id(class_id, classes!class_id(name, section), subjects!subject_id(name))')
    .eq('school_id', schoolId)
    .eq('exam_session_id', s.id)
    .order('assessment_date', { ascending: true })

  type ARow = {
    id: string; title: string; assessment_date: string | null; coefficient: number; max_score: number
    class_subjects: { class_id: string; classes: { name: string; section: string | null } | null; subjects: { name: string } | null } | null
  }
  const assessments = (rawAssessments ?? []) as unknown as ARow[]

  // Completion: graded students / actively enrolled students per assessment.
  const classIds = Array.from(new Set(assessments.map((a) => a.class_subjects?.class_id).filter(Boolean) as string[]))
  const enrolledByClass = new Map<string, number>()
  const gradedByAssessment = new Map<string, number>()
  if (assessments.length > 0) {
    const [enrRes, gradeRes] = await Promise.all([
      classIds.length > 0
        ? supabase.from('student_class_enrollments').select('class_id').eq('school_id', schoolId).eq('status', 'active').in('class_id', classIds)
        : Promise.resolve({ data: [] as { class_id: string }[] }),
      supabase.from('grades').select('assessment_id').eq('school_id', schoolId).in('assessment_id', assessments.map((a) => a.id)),
    ])
    for (const r of (enrRes.data ?? []) as { class_id: string }[]) enrolledByClass.set(r.class_id, (enrolledByClass.get(r.class_id) ?? 0) + 1)
    for (const r of (gradeRes.data ?? []) as { assessment_id: string }[]) gradedByAssessment.set(r.assessment_id, (gradedByAssessment.get(r.assessment_id) ?? 0) + 1)
  }

  // Total missing grades across the session (for the publish completion gate).
  let totalMissing = 0
  for (const a of assessments) {
    const classId = a.class_subjects?.class_id
    const enrolled = classId ? (enrolledByClass.get(classId) ?? 0) : 0
    const graded = gradedByAssessment.get(a.id) ?? 0
    totalMissing += Math.max(0, enrolled - graded)
  }

  // Publication state (whole-session scope).
  const pubState = await getPublicationState(supabase, schoolId, s.id)
  const sessionPublished = pubState.sessionPublished
  const publishedClassCount = pubState.publishedClassIds.size
  const canPublishWhole = s.status === 'completed' && assessments.length > 0 && totalMissing === 0
  const wholePublishBlockedReason =
    s.status === 'archived'    ? 'Session archivée — lecture seule.'
    : s.status !== 'completed'  ? 'La session doit être terminée pour publier.'
    : assessments.length === 0  ? 'Aucune évaluation rattachée.'
    : totalMissing > 0          ? `${totalMissing} note(s) manquante(s) — la saisie doit être complète.`
    : null

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/exams" className="text-primary-300 hover:text-white text-sm">← Sessions d&apos;examen</a>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[s.status] ?? STATUS_CLASS.draft}`}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
              {sessionPublished ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Résultats publiés
                </span>
              ) : publishedClassCount > 0 ? (
                <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                  {publishedClassCount} classe(s) publiée(s)
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{s.name}</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {s.academic_years?.name ?? ''} · {fmtDate(s.starts_on)} – {fmtDate(s.ends_on)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/school/exams/${s.id}/results`} className="rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm">
              Résultats
            </a>
            {s.status !== 'archived' && (
              <a href={`/school/exams/${s.id}/edit`} className="rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">
                Modifier
              </a>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}
      {searchParams.published && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Résultats publiés. Les élèves et parents concernés ont été notifiés.</p>
        </div>
      )}
      {searchParams.unpublished && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">Résultats dépubliés. Ils ne sont plus visibles dans les portails.</p>
        </div>
      )}

      {/* Publication (whole-session). Per-class publishing lives on the results page. */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-gray-50 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Publication des résultats</h2>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            sessionPublished ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-gray-200 bg-gray-100 text-gray-500'
          }`}>
            {sessionPublished ? 'Session publiée' : 'Non publiée'}
          </span>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {!sessionPublished ? (
              <form action={publishExamResults}>
                <input type="hidden" name="session_id" value={s.id} />
                <input type="hidden" name="scope" value="session" />
                <input type="hidden" name="return_to" value={`/school/exams/${s.id}`} />
                <button
                  type="submit"
                  disabled={!canPublishWhole}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Publier toute la session
                </button>
              </form>
            ) : (
              <form action={unpublishExamResults}>
                <input type="hidden" name="session_id" value={s.id} />
                <input type="hidden" name="scope" value="session" />
                <input type="hidden" name="return_to" value={`/school/exams/${s.id}`} />
                <button
                  type="submit"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Dépublier la session
                </button>
              </form>
            )}
            <a href={`/school/exams/${s.id}/results`} className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline">
              Publier classe par classe →
            </a>
          </div>
          {!sessionPublished && wholePublishBlockedReason && (
            <p className="mt-3 text-xs text-amber-600">{wholePublishBlockedReason}</p>
          )}
        </div>
      </div>

      {/* Lifecycle controls */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-gray-50 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cycle de vie</h2>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {(s.status === 'draft' || s.status === 'completed') && (
              <StatusButton sessionId={s.id} newStatus="active" label="Activer" tone="primary" />
            )}
            {s.status === 'active' && (
              <StatusButton sessionId={s.id} newStatus="completed" label="Marquer terminée" tone="sky" />
            )}
            {s.status !== 'archived' && (
              <StatusButton sessionId={s.id} newStatus="archived" label="Archiver" tone="neutral" />
            )}
            {s.status === 'archived' && <p className="text-sm text-gray-400">Session archivée — lecture seule.</p>}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            {s.status === 'draft' && 'Brouillon : activez la session quand les examens commencent.'}
            {s.status === 'active' && 'Active : une seule session active par période est autorisée.'}
            {s.status === 'completed' && 'Terminée : les examens de cette session sont clos.'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-gray-50 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Informations</h2>
        </div>
        <dl className="divide-y divide-sand-100">
          <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm font-medium text-gray-500">Année scolaire</dt>
            <dd className="mt-1 sm:col-span-2 sm:mt-0 text-sm text-gray-900">{s.academic_years?.name ?? '—'}</dd>
          </div>
          <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm font-medium text-gray-500">Période</dt>
            <dd className="mt-1 sm:col-span-2 sm:mt-0 text-sm text-gray-900">{fmtDate(s.starts_on)} – {fmtDate(s.ends_on)}</dd>
          </div>
          <div className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm font-medium text-gray-500">Description</dt>
            <dd className={`mt-1 sm:col-span-2 sm:mt-0 text-sm ${s.description ? 'text-gray-900' : 'italic text-gray-400'} whitespace-pre-wrap`}>
              {s.description || 'Non renseignée'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Assessments in this session */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-gray-50 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Évaluations ({assessments.length})
          </h2>
        </div>
        {assessments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            Aucune évaluation rattachée. Sélectionnez cette session lors de la création d&apos;une évaluation.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Classe</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Matière</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Titre</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Coef.</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Barème</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Saisie</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a, idx) => {
                const classId  = a.class_subjects?.class_id
                const enrolled = classId ? (enrolledByClass.get(classId) ?? 0) : 0
                const graded   = gradedByAssessment.get(a.id) ?? 0
                const complete = enrolled > 0 && graded >= enrolled
                return (
                  <tr key={a.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                    <td className="px-4 py-3 text-gray-700">
                      {a.class_subjects?.classes ? [a.class_subjects.classes.name, a.class_subjects.classes.section].filter(Boolean).join(' ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.class_subjects?.subjects?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <a href={`/school/academics/assessments/${a.id}`} className="hover:text-primary-700 hover:underline">{a.title}</a>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-600 whitespace-nowrap">{a.assessment_date ? fmtDate(a.assessment_date) : '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-center text-gray-600">{a.coefficient}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-center text-gray-600">{a.max_score}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`text-xs font-semibold ${complete ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {graded}/{enrolled}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
