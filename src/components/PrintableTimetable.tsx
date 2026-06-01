import { PrintButton } from './PrintButton'

// Wraps a timetable schedule with a screen-only toolbar (CSV export + print)
// and a print-only header (title / subtitle / generated date). On print,
// everything except the #tt-print block is hidden, so the portal sidebar and
// buttons don't appear. Server component.
//
// The print CSS is scoped via the #tt-print id and the .print-hide utility.

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #tt-print, #tt-print * { visibility: visible !important; }
  #tt-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  .print-hide { display: none !important; }
}
`

export function PrintableTimetable({
  heading,
  subtitle,
  exportHref,
  children,
}: {
  heading:    string
  subtitle?:  string
  exportHref?: string
  children:   React.ReactNode
}) {
  const generated = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Screen-only toolbar */}
      <div className="print-hide flex flex-wrap items-center gap-2">
        {exportHref && (
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-sand-50 transition-colors"
          >
            Exporter CSV
          </a>
        )}
        <PrintButton />
      </div>

      <div id="tt-print" className="mt-4 space-y-4">
        {/* Print-only header */}
        <div className="hidden print:block">
          <h2 className="text-lg font-bold text-gray-900">{heading}</h2>
          {subtitle && <p className="text-sm text-gray-700">{subtitle}</p>}
          <p className="text-xs text-gray-500">Généré le {generated}</p>
        </div>

        {children}
      </div>
    </>
  )
}
