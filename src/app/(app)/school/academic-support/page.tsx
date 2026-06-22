import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadSchoolRisk } from '@/lib/academic/risk-data'

const LEVEL_META: Record<string, { label: string; badge: string; dot: string }> = {
  high:   { label: 'Risque élevé', badge: 'border-red-200 bg-red-50 text-red-700',     dot: 'bg-red-500' },
  medium: { label: 'Risque moyen', badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
}

type Props = { searchParams: { class?: string; level?: string } }

export default async function AcademicSupportPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id, schools(name)')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id
  const schoolName = ((membership as unknown as { schools: { name: string } | null }).schools?.name) ?? ''

  const { results, summary } = await loadSchoolRisk(supabase, schoolId)
  const atRisk = results.filter((r) => r.level !== 'low')

  // Filters
  const classOptions = Array.from(new Map(atRisk.map((r) => [r.classId, r.className])).entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  const levelFilter = searchParams.level === 'high' || searchParams.level === 'medium' ? searchParams.level : ''
  const classFilter = searchParams.class && classOptions.some((c) => c.id === searchParams.class) ? searchParams.class : ''
  const filtered = atRisk.filter((r) => (!levelFilter || r.level === levelFilter) && (!classFilter || r.classId === classFilter))

  const buildUrl = (patch: { class?: string; level?: string }) => {
    const p = new URLSearchParams()
    const cls = patch.class !== undefined ? patch.class : classFilter
    const lvl = patch.level !== undefined ? patch.level : levelFilter
    if (cls) p.set('class', cls); if (lvl) p.set('level', lvl)
    const qs = p.toString()
    return qs ? `/school/academic-support?${qs}` : '/school/academic-support'
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1"><a href="/school" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a></div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Cellule de soutien scolaire</h1>
        <p className="text-primary-300 text-sm mt-0.5">{schoolName} · élèves nécessitant une attention particulière</p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Indicateurs calculés en temps réel à partir des données existantes (notes, présences, finances). Aucun score n&apos;est enregistré ; aucune action n&apos;est déclenchée automatiquement.
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">À risque</p><p className="mt-1 text-2xl font-bold text-gray-900">{summary.total}</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Élevé</p><p className="mt-1 text-2xl font-bold text-red-600">{summary.high}</p></div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Moyen</p><p className="mt-1 text-2xl font-bold text-amber-600">{summary.medium}</p></div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={buildUrl({ level: '' })} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${!levelFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Tous niveaux</a>
        <a href={buildUrl({ level: 'high' })} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${levelFilter === 'high' ? 'border-red-300 bg-red-50 text-red-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Élevé</a>
        <a href={buildUrl({ level: 'medium' })} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${levelFilter === 'medium' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-sand-300 bg-white text-gray-700 hover:bg-sand-50'}`}>Moyen</a>
        {classOptions.length > 0 && (
          <form method="GET" action="/school/academic-support" className="ml-auto flex items-center gap-2">
            {levelFilter && <input type="hidden" name="level" value={levelFilter} />}
            <select name="class" defaultValue={classFilter} className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">Toutes les classes</option>
              {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-sand-50">Filtrer</button>
          </form>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun élève à risque {classFilter || levelFilter ? 'pour ce filtre' : ''}</p>
          <p className="mt-1 text-sm text-gray-500">{summary.total === 0 ? 'Les indicateurs sont au vert, ou les données d’évaluation sont insuffisantes.' : 'Ajustez les filtres pour voir d’autres élèves.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const meta = LEVEL_META[r.level]
            return (
              <div key={r.studentId} className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a href={`/school/students/${r.studentId}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline">{r.lastName} {r.firstName}</a>
                    <p className="text-xs text-gray-400">{r.className}{r.average !== null ? ` · moyenne ${r.average}/20` : ''}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Motifs</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.reasons.map((x, i) => <li key={i} className="text-xs text-gray-700">{x}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions recommandées</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.actions.map((x, i) => <li key={i} className="text-xs text-primary-700">{x}</li>)}</ul>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
