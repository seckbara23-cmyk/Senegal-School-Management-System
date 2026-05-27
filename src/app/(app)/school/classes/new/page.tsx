import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClassNewForm } from './_form'

type AcademicYear = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  is_active: boolean
}

export default async function NewClassPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  const school = memberships[0].schools as unknown as { id: string; name: string }

  const { data: years } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, is_active')
    .eq('school_id', school.id)
    .order('starts_on', { ascending: false })

  const academicYears  = (years ?? []) as AcademicYear[]
  const activeYear     = academicYears.find((y) => y.is_active)
  const hasNoActiveYear = !activeYear

  const breadcrumb = (
    <nav
      className="flex flex-wrap items-center gap-y-1 text-sm text-gray-500"
      aria-label="Fil d'Ariane"
    >
      <a href="/school" className="hover:text-primary-600 hover:underline">Administration</a>
      <span className="mx-2 select-none" aria-hidden="true">/</span>
      <a href="/school/classes" className="hover:text-primary-600 hover:underline">Classes</a>
      <span className="mx-2 select-none" aria-hidden="true">/</span>
      <span className="font-medium text-gray-900">Nouvelle classe</span>
    </nav>
  )

  if (academicYears.length === 0) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvelle classe</h1>
          <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
        </div>
        <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Aucune année scolaire active
              </p>
              <p className="mt-1 text-sm text-amber-700">
                Créez ou activez une année scolaire avant de créer une classe.
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
      {breadcrumb}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle classe</h1>
        <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
      </div>

      {/* Form card */}
      <div className="max-w-2xl rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
        <ClassNewForm academicYears={academicYears} hasNoActiveYear={hasNoActiveYear} />
      </div>
    </div>
  )
}
