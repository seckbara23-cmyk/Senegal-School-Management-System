// ─── Language selector (Phase 10F) ───────────────────────────────────────────
//
// Server component — three small forms posting to the setLocale action (cookie).
// Honours the parent (and any user's) language preference without a new
// preference system. `active` is the current resolved locale; `next` returns the
// user to the same page after switching.

import { setLocale } from '@/lib/i18n/actions'
import { LOCALES, LOCALE_SHORT, type Locale } from '@/lib/i18n/locale'

export function LanguageSelector({ active, next }: { active: Locale; next: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white p-0.5 shadow-sm" role="group" aria-label="Langue">
      {LOCALES.map((l) => (
        <form key={l} action={setLocale}>
          <input type="hidden" name="locale" value={l} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            aria-pressed={active === l}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${active === l ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-sand-50'}`}
          >
            {LOCALE_SHORT[l]}
          </button>
        </form>
      ))}
    </div>
  )
}
