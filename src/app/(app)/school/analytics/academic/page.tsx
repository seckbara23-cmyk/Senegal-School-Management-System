import { requireAnalyticsCtx } from '../_auth'
import { loadAcademicAnalytics } from '@/lib/analytics/academic'
import { KpiCard, HBar, Panel } from '@/components/charts'

export const dynamic = 'force-dynamic'

export default async function AcademicAnalyticsPage() {
  const { supabase, schoolId } = await requireAnalyticsCtx()
  const a = await loadAcademicAnalytics(supabase, schoolId)

  const graded = a.students.filter((s) => s.average !== null) as { studentId: string; name: string; className: string; average: number }[]
  const sorted = [...graded].sort((x, y) => y.average - x.average)
  const top = sorted.slice(0, 5)
  const bottom = sorted.slice(-5).reverse()
  const maxBand = Math.max(1, ...a.distribution.map((d) => d.count))

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school/analytics" className="text-primary-300 hover:text-white text-sm">← Analyses</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Analyse académique</h1>
        <p className="text-primary-300 text-sm mt-0.5">Période active · {a.gradedStudents}/{a.totalStudents} élèves notés</p>
      </div>

      {a.gradedStudents === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Pas encore de données</p>
          <p className="mt-1 text-sm text-gray-500">Les analyses apparaîtront une fois des notes saisies pour la période active.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Moyenne générale" value={a.schoolAverage !== null ? `${a.schoolAverage}/20` : '—'} tone="sky" />
            <KpiCard label="Taux de réussite" value={a.passRate !== null ? `${a.passRate}%` : '—'} sub="moyenne ≥ 10" tone={a.passRate !== null && a.passRate < 50 ? 'amber' : 'emerald'} />
            <KpiCard label="Élèves notés" value={a.gradedStudents} sub={`sur ${a.totalStudents}`} tone="primary" />
            <KpiCard label="Classes" value={a.byClass.length} tone="gray" />
          </div>

          <Panel title="Répartition des mentions">
            <div className="space-y-3">
              {a.distribution.map((d) => (
                <HBar key={d.key} label={d.label} value={d.count} max={maxBand} display={`${d.count}`} barClass={d.barClass} />
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Moyenne par classe">
              <div className="space-y-3">
                {a.byClass.map((c) => (
                  <HBar key={c.classId} label={`${c.className} · ${c.passRate ?? 0}% réussite`} value={c.average ?? 0} max={20} display={c.average !== null ? `${c.average}/20` : '—'}
                    barClass={(c.average ?? 0) >= 10 ? 'bg-emerald-500' : 'bg-red-500'} />
                ))}
              </div>
            </Panel>

            <Panel title="Moyenne par matière">
              <div className="space-y-3">
                {a.bySubject.length === 0 ? <p className="text-sm text-gray-400">Aucune matière notée.</p> : a.bySubject.map((s) => (
                  <HBar key={s.subjectId} label={s.name} value={s.average} max={20} display={`${s.average}/20`}
                    barClass={s.average >= 10 ? 'bg-primary-500' : 'bg-amber-500'} />
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="🏅 Meilleurs élèves">
              <ul className="divide-y divide-sand-100">
                {top.map((s, i) => (
                  <li key={s.studentId} className="flex items-center justify-between gap-3 py-2">
                    <a href={`/school/academics/bulletins/${s.studentId}`} className="min-w-0 text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline">
                      <span className="mr-2 text-gray-400">{i + 1}.</span>{s.name} <span className="text-xs text-gray-400">· {s.className}</span>
                    </a>
                    <span className="shrink-0 text-sm font-bold text-emerald-600">{s.average}/20</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="⚠ Élèves à soutenir">
              <ul className="divide-y divide-sand-100">
                {bottom.map((s) => (
                  <li key={s.studentId} className="flex items-center justify-between gap-3 py-2">
                    <a href={`/school/academics/bulletins/${s.studentId}`} className="min-w-0 text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline">
                      {s.name} <span className="text-xs text-gray-400">· {s.className}</span>
                    </a>
                    <span className={`shrink-0 text-sm font-bold ${s.average < 10 ? 'text-red-600' : 'text-amber-600'}`}>{s.average}/20</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
