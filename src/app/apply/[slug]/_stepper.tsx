const STEPS = ['Informations', 'Documents', 'Validation']

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              active ? 'bg-primary-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-sand-200 text-gray-500'}`}>{done ? '✓' : n}</span>
            <span className={`truncate ${active ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{label}</span>
            {n < 3 && <span className="hidden flex-1 border-t border-sand-200 sm:block" />}
          </li>
        )
      })}
    </ol>
  )
}
