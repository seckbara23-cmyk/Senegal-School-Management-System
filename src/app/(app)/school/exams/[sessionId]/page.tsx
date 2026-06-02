import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { setExamSessionStatus } from '../actions'

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
  server:     'Une erreur est survenue. Veuillez réessayer.',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

type Props = { params: { sessionId: string }; searchParams: { error?: string } }

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
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{s.name}</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {s.academic_years?.name ?? ''} · {fmtDate(s.starts_on)} – {fmtDate(s.ends_on)}
            </p>
          </div>
          {s.status !== 'archived' && (
            <a href={`/school/exams/${s.id}/edit`} className="rounded-lg border border-primary-600 bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">
              Modifier
            </a>
          )}
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

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
    </div>
  )
}
