import type { ReactNode } from 'react'

// Static, role-scoped in-app help (Phase 51). Server component — no client JS,
// no database, no search. The table of contents uses native anchor links to
// each section id. Section bodies are authored as plain JSX; child elements
// (h3, ul, ol, li, code, strong, a, table) are styled via arbitrary variants
// so each guide page stays readable and easy to maintain.

export type HelpSection = {
  id: string
  title: string
  body: ReactNode
}

// Reusable, lightly-styled screenshot placeholder (kept as text per spec).
export function Shot({ label }: { label: string }) {
  return (
    <p className="rounded-md border border-dashed border-sand-300 bg-sand-50 px-3 py-2 text-xs text-gray-400">
      [Capture d&apos;écran : {label}]
    </p>
  )
}

export function HelpGuide({
  badge,
  title,
  intro,
  sections,
}: {
  badge: string
  title: string
  intro: string
  sections: HelpSection[]
}) {
  return (
    <div className="space-y-6 pb-16">
      {/* Header band */}
      <header className="rounded-xl bg-primary-800 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-300">{badge}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-1 text-sm text-primary-200">{intro}</p>
      </header>

      {/* Table of contents */}
      <nav aria-label="Sommaire" className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Sommaire</h2>
        <ol className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm font-medium text-primary-700 hover:text-primary-900 hover:underline"
              >
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Sections */}
      {sections.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          className="scroll-mt-20 rounded-xl border border-sand-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-bold text-gray-900">
            {i + 1}. {s.title}
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700 [&_a]:text-primary-700 [&_a]:underline [&_code]:rounded [&_code]:bg-sand-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-sand-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-sand-200 [&_th]:bg-sand-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5">
            {s.body}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-gray-400">ScolaTech — Guide intégré · v1</p>
    </div>
  )
}
