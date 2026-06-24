'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LOCALE_COOKIE, parseLocale } from './locale'

// Persists the chosen language in the locale cookie (1 year) and returns to the
// caller. No DB write — the cookie IS the per-user language preference.
export async function setLocale(formData: FormData): Promise<void> {
  const locale = parseLocale(String(formData.get('locale') ?? ''))
  cookies().set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })
  const nextRaw = String(formData.get('next') ?? '/')
  const next = nextRaw.startsWith('/') ? nextRaw : '/'
  redirect(next)
}
