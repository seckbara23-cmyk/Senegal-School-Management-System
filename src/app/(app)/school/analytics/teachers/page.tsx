import { requireAnalyticsCtx } from '../_auth'
import { loadTeacherAnalytics } from '@/lib/analytics/teachers'
import { KpiCard } from '@/components/charts'

export const dynamic = 'force-dynamic'

function completenessClass(v: number | null): string {
  if (v === null) return 'text-gray-300'
  if (v >= 90) return 'text-emerald-600'
  if (v >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export default async function TeacherAnalyticsPage() {
  const { supabase, schoolId } = await requireAnalyticsCtx()
  const a = await loadTeacherAnalytics(supabase, schoolId)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/analytics" className="text-primary-300 hover:text-white text-sm">← Analyses</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Analyse des enseignants</h1>
        <p className="text-primary-300 text-sm mt-0.5">Activité dérivée des présences, évaluations, notes, devoirs et messages</p>
      </div>

      {a.totals.teachers === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun enseignant actif</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Enseignants" value={a.totals.teachers} tone="primary" />
            <KpiCard label="Séances de présence" value={a.totals.sessions} tone="emerald" />
            <KpiCard label="Évaluations créées" value={a.totals.assessments} tone="sky" />
            <KpiCard label="Saisie des notes" value={a.totals.avgCompleteness !== null ? `${a.totals.avgCompleteness}%` : '—'} sub="complétude moyenne" tone={a.totals.avgCompleteness !== null && a.totals.avgCompleteness < 60 ? 'amber' : 'emerald'} />
          </div>

          <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-100 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Enseignant</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Classes</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Présences</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Évals</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Notes</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Devoirs</th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {a.teachers.map((t, idx) => (
                    <tr key={t.teacherId} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-4 py-3">
                        <a href={`/school/teachers/${t.teacherId}/assignments`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">{t.name}</a>
                        <p className="text-xs text-gray-400">{t.subjects} matière{t.subjects !== 1 ? 's' : ''}</p>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{t.classes}</td>
                      <td className="px-3 py-3 text-center text-gray-700">{t.sessionsRecorded}</td>
                      <td className="px-3 py-3 text-center text-gray-700">{t.assessmentsCreated}</td>
                      <td className={`px-3 py-3 text-center font-semibold ${completenessClass(t.gradeCompleteness)}`}>{t.gradeCompleteness !== null ? `${t.gradeCompleteness}%` : '—'}</td>
                      <td className="px-3 py-3 text-center text-gray-700">{t.homeworkPosted}</td>
                      <td className="px-3 py-3 text-center">
                        {t.unreadMessages > 0
                          ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{t.unreadMessages} non lu{t.unreadMessages !== 1 ? 's' : ''}</span>
                          : <span className="text-gray-400">{t.threads}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400">« Notes » = part des notes attendues effectivement saisies (évaluations × élèves inscrits). « Messages » affiche les messages de parents non lus, sinon le nombre de conversations.</p>
        </>
      )}
    </div>
  )
}
