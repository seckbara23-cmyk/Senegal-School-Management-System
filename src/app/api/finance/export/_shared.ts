import type { createClient } from '@/lib/supabase/server'

type Client = ReturnType<typeof createClient>

// Resolve the caller's finance school from an active school_admin OR
// finance_officer membership. Both roles get their OWN school only. Returns an
// error descriptor for the route to translate into an HTTP status.
export async function resolveFinanceSchool(
  supabase: Client,
): Promise<{ schoolId: string; slug: string } | { error: string; status: number }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }

  const { data: m } = await supabase
    .from('school_memberships')
    .select('school_id, role, schools!school_id(slug)')
    .eq('user_id', user.id)
    .in('role', ['school_admin', 'finance_officer'])
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!m) return { error: 'Forbidden', status: 403 }

  const schoolId = (m as unknown as { school_id: string }).school_id
  const slug = (m as unknown as { schools: { slug: string } | null }).schools?.slug ?? 'ecole'
  return { schoolId, slug }
}

// Returns the value if it is a YYYY-MM-DD date, else null.
export function validDate(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// Default reporting range: first day of the current month → today.
export function defaultMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  return { from, to }
}
