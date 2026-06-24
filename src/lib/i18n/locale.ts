// ─── Locale primitives (Phase 10F — deterministic multilingual layer) ────────
//
// French is the canonical source language; English and Wolof (pilot) are added.
// Pure module (no server/IO) so the narrative engines can import it freely. No
// external translation API, no LLM — wording lives in deterministic catalogs.

export type Locale = 'fr' | 'en' | 'wo'

export const LOCALES: Locale[] = ['fr', 'en', 'wo']
export const DEFAULT_LOCALE: Locale = 'fr'

export const LOCALE_LABEL: Record<Locale, string> = { fr: 'Français', en: 'English', wo: 'Wolof' }
export const LOCALE_SHORT: Record<Locale, string> = { fr: 'FR', en: 'EN', wo: 'WO' }

export const LOCALE_COOKIE = 'st_locale'

export function parseLocale(value: string | null | undefined): Locale {
  return value === 'en' || value === 'wo' || value === 'fr' ? value : DEFAULT_LOCALE
}

// {var} interpolation — values are pre-formatted by the caller.
export function interpolate(tpl: string, vars?: Record<string, string | number>): string {
  if (!vars) return tpl
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}
