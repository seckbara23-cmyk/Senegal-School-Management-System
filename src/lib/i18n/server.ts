// ─── Server-side locale resolution (Phase 10F) ───────────────────────────────
//
// Reads the language preference from the standard locale cookie. Used by the
// Copilot actions/pages. No new preference table — the cookie is the parent (and
// any user's) language preference, set via the LanguageSelector.

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, parseLocale, type Locale } from './locale'

export function resolveLocale(): Locale {
  return parseLocale(cookies().get(LOCALE_COOKIE)?.value)
}
