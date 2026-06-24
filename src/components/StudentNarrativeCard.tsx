// ─── Student 360 narrative card (presentational, server-safe) ────────────────
//
// Renders a StudentNarrative from the shared engine. No hooks, no data access —
// pure props. Used by the school student profile and the parent portal so the
// "Student 360" synthesis looks identical everywhere.

import type { StudentNarrative, NarrativeTone } from '@/lib/copilot/student-narrative'

const TONE_DOT: Record<NarrativeTone, string> = {
  positive: 'bg-emerald-500', neutral: 'bg-gray-300', warning: 'bg-amber-500', critical: 'bg-red-500',
}
const LEVEL_BADGE: Record<string, { label: string; cls: string }> = {
  high: { label: 'Risque élevé', cls: 'border-red-200 bg-red-50 text-red-700' },
  medium: { label: 'Risque moyen', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  low: { label: 'Risque faible', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
}
const CONFIDENCE: Record<string, { label: string; cls: string }> = {
  high: { label: 'Confiance élevée', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  medium: { label: 'Confiance moyenne', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  low: { label: 'Confiance faible', cls: 'border-gray-200 bg-gray-100 text-gray-500' },
}

export function StudentNarrativeCard({ narrative, title = 'Synthèse 360' }: { narrative: StudentNarrative; title?: string }) {
  const level = LEVEL_BADGE[narrative.level] ?? LEVEL_BADGE.low
  const conf = CONFIDENCE[narrative.meta.confidence] ?? CONFIDENCE.medium
  const time = new Date(narrative.meta.generatedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 bg-sand-50 px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${level.cls}`}>{level.label}</span>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm text-gray-700">{narrative.headline}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {narrative.sections.map((s) => (
            <div key={s.key}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[s.tone]}`} />{s.heading}
              </p>
              <ul className="mt-1 space-y-0.5">
                {s.lines.map((l, i) => <li key={i} className="text-xs text-gray-700">{l}</li>)}
              </ul>
            </div>
          ))}
        </div>

        {narrative.recommendations.length > 0 && (
          <div className="mt-4 rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">Actions recommandées</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {narrative.recommendations.map((r, i) => <li key={i} className="text-xs text-primary-800">{r}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3 text-[11px] text-gray-400">
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${conf.cls}`}>{conf.label}</span>
          <span>Sources : {narrative.meta.sources.map((s) => s.label).join(', ')}</span>
          <span className="ml-auto">Généré le {time} · 100 % dérivé</span>
        </div>
      </div>
    </div>
  )
}
