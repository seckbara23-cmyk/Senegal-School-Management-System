import { requireAnalyticsCtx } from './_auth'
import { loadExecutiveSummary } from '@/lib/analytics/executive'
import { KpiCard } from '@/components/charts'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA' }

const AREAS = [
  { href: '/school/analytics/academic',   icon: '🎓', title: 'Analyse académique', desc: 'Moyennes, réussite, classes & matières' },
  { href: '/school/analytics/teachers',   icon: '👩‍🏫', title: 'Analyse enseignants', desc: 'Activité, saisie des notes, présences' },
  { href: '/school/analytics/finance',    icon: '💰', title: 'Analyse financière', desc: 'Recouvrement, tendance, débiteurs' },
  { href: '/school/analytics/engagement', icon: '🤝', title: 'Engagement des parents', desc: 'Lecture, messagerie, ponctualité' },
  { href: '/school/analytics/insights',   icon: '🔮', title: 'Signaux & alertes', desc: 'Liste de vigilance dérivée' },
]

export default async function AnalyticsHubPage() {
  const { supabase, schoolId, schoolName } = await requireAnalyticsCtx()
  const s = await loadExecutiveSummary(supabase, schoolId)

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Analyses & intelligence</h1>
        <p className="text-primary-300 text-sm mt-0.5">{schoolName} · indicateurs calculés en temps réel à partir des données existantes</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Élèves" value={s.students} sub="inscrits" href="/school/students" tone="primary" />
        <KpiCard label="Assiduité" value={s.attendanceRate !== null ? `${s.attendanceRate}%` : '—'} sub="cette année" href="/school/attendance/summary" tone={s.attendanceRate !== null && s.attendanceRate < 90 ? 'amber' : 'emerald'} />
        <KpiCard label="Moyenne générale" value={s.academicAverage !== null ? `${s.academicAverage}/20` : '—'} sub={`${s.gradedStudents} élèves notés`} href="/school/analytics/academic" tone="sky" />
        <KpiCard label="Taux de réussite" value={s.passRate !== null ? `${s.passRate}%` : '—'} sub="moyenne ≥ 10" href="/school/analytics/academic" tone={s.passRate !== null && s.passRate < 50 ? 'amber' : 'emerald'} />
        <KpiCard label="Recouvrement" value={`${s.collectionRate}%`} sub={s.outstanding > 0 ? `${fmt(s.outstanding)} dû` : 'à jour'} href="/school/analytics/finance" tone={s.collectionRate < 70 ? 'amber' : 'emerald'} />
        <KpiCard label="⚠ Élèves à risque" value={s.atRisk.total} sub={`${s.atRisk.high} élevé · ${s.atRisk.medium} moyen`} href="/school/analytics/insights" tone={s.atRisk.high > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Enseignants" value={s.teachers} sub="actifs" href="/school/analytics/teachers" tone="gray" />
        <KpiCard label="Parents" value={s.parents} sub="engagement" href="/school/analytics/engagement" tone="accent" />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Explorer en détail</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => (
            <a key={a.href} href={a.href} className="flex items-start gap-3 rounded-xl border border-sand-200 bg-white p-4 shadow-sm hover:border-primary-300 hover:bg-sand-50 transition-colors">
              <span className="text-2xl">{a.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">{a.title}</span>
                <span className="block text-xs text-gray-500">{a.desc}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
