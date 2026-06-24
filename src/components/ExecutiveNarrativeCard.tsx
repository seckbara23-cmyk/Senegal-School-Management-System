// ─── Executive narrative card (presentational, server-safe) ──────────────────
//
// Renders an ExecutiveNarrative from the shared engine. Pure props, no hooks, no
// data access. Used by the school dashboard "Synthèse exécutive".

import type { ExecutiveNarrative } from '@/lib/copilot/executive-narrative'

const CONFIDENCE: Record<string, { label: string; cls: string }> = {
  high: { label: 'Confiance élevée', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  medium: { label: 'Confiance moyenne', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  low: { label: 'Confiance faible', cls: 'border-gray-200 bg-gray-100 text-gray-500' },
}

function Column({ heading, dot, items, itemClass = 'text-gray-700', empty }: { heading: string; dot: string; items: string[]; itemClass?: string; empty?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{heading}
      </p>
      {items.length > 0
        ? <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{items.map((l, i) => <li key={i} className={`text-xs ${itemClass}`}>{l}</li>)}</ul>
        : empty ? <p className="mt-1.5 text-xs text-gray-400">{empty}</p> : null}
    </div>
  )
}

export function ExecutiveNarrativeCard({ narrative, href }: { narrative: ExecutiveNarrative; href?: string }) {
  const conf = CONFIDENCE[narrative.meta.confidence] ?? CONFIDENCE.medium
  const time = new Date(narrative.meta.generatedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <section aria-label="Synthèse exécutive" className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 bg-sand-50 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Synthèse exécutive</h2>
        {href && <a href={href} className="text-xs font-medium text-primary-600 hover:underline">Demander au Copilot →</a>}
      </div>

      <div className="px-5 py-4">
        <p className="text-sm font-medium text-gray-800">{narrative.headline}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Column heading="Points d’attention" dot="bg-amber-500" items={narrative.attention} itemClass="text-gray-700" empty="Aucun point d’attention majeur." />
          <Column heading="Points positifs" dot="bg-emerald-500" items={narrative.positives} itemClass="text-gray-700" empty="—" />
        </div>

        <div className="mt-4 rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">Priorités de la semaine</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{narrative.priorities.map((p, i) => <li key={i} className="text-xs text-primary-800">{p}</li>)}</ul>
        </div>

        {narrative.recommendations.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recommandations</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{narrative.recommendations.map((r, i) => <li key={i} className="text-xs text-gray-700">{r}</li>)}</ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3 text-[11px] text-gray-400">
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${conf.cls}`}>{conf.label}</span>
          <span>Sources : {narrative.meta.sources.map((src) => src.label).join(', ')}</span>
          <span className="ml-auto">Généré le {time} · 100 % dérivé</span>
        </div>
      </div>
    </section>
  )
}
