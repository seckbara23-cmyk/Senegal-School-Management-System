import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewPeriodForm } from './_form'

export default async function NewPeriodPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: rawYears } = await supabase
    .from('academic_years')
    .select('id, name, is_active')
    .eq('school_id', schoolId)
    .order('starts_on', { ascending: false })

  type YearRow = { id: string; name: string; is_active: boolean }
  const academicYears = (rawYears ?? []) as YearRow[]
  const hasNoActiveYear = !academicYears.some((y) => y.is_active)

  const header = (
    <div className="rounded-xl bg-primary-800 px-6 py-5">
      <div className="mb-1">
        <a href="/school/academics/periods" className="text-primary-300 hover:text-white text-sm">← Périodes</a>
      </div>
      <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle période</h1>
      <p className="text-primary-300 text-sm mt-0.5">Définir un trimestre ou semestre</p>
    </div>
  )

  if (academicYears.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">Aucune année scolaire active</p>
              <p className="mt-1 text-sm text-amber-700">
                Créez ou activez une année scolaire avant de créer une période.
              </p>
              <a
                href="/school/academic-years"
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 underline hover:text-amber-900"
              >
                Gérer les années scolaires →
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {header}

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <NewPeriodForm academicYears={academicYears} hasNoActiveYear={hasNoActiveYear} />
      </div>

    </div>
  )
}
