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

  if (academicYears.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/school/academics/periods" className="text-primary-300 hover:text-white text-sm">← Périodes</a>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle période</h1>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-6 py-8 shadow-sm text-center">
          <p className="text-sm text-gray-600">Aucune année scolaire configurée.</p>
          <a href="/school/classes" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Gérer les années scolaires →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/school/academics/periods" className="text-primary-300 hover:text-white text-sm">← Périodes</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle période</h1>
        <p className="text-primary-300 text-sm mt-0.5">Définir un trimestre ou semestre</p>
      </div>

      {/* ── Form card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <NewPeriodForm academicYears={academicYears} />
      </div>

    </div>
  )
}
