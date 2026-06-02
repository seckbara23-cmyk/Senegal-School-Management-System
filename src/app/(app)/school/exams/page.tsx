import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', active: 'Active', completed: 'Terminée', archived: 'Archivée',
}
const STATUS_CLASS: Record<string, string> = {
  draft:     'border-gray-200 bg-gray-100 text-gray-600',
  active:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  completed: 'border-sky-200 bg-sky-50 text-sky-700',
  archived:  'border-gray-200 bg-gray-100 text-gray-400',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function ExamSessionsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active').maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rawSessions } = await supabase
    .from('exam_sessions')
    .select('id, name, starts_on, ends_on, status, academic_years!academic_year_id(name)')
    .eq('school_id', schoolId)
    .order('starts_on', { ascending: false })

  type Row = {
    id: string; name: string; starts_on: string; ends_on: string; status: string
    academic_years: { name: string } | null
  }
  const sessions = (rawSessions ?? []) as unknown as Row[]

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sessions d&apos;examen</h1>
            <p className="text-primary-300 text-sm mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          <a href="/school/exams/new" className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm">
            + Nouvelle session
          </a>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune session d&apos;examen</p>
          <p className="mt-1 text-sm text-gray-400">Créez une session (Composition, Examen final…) pour organiser les évaluations.</p>
          <a href="/school/exams/new" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
            Créer une session
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Session</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Année</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Période</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, idx) => (
                <tr key={s.id} className={`border-b border-sand-100 hover:bg-accent-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <a href={`/school/exams/${s.id}`} className="hover:text-primary-700 hover:underline">{s.name}</a>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-600">{s.academic_years?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(s.starts_on)} – {fmtDate(s.ends_on)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[s.status] ?? STATUS_CLASS.draft}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
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
