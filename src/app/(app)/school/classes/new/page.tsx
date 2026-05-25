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

  const academicYears = (years ?? []) as AcademicYear[]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        className="flex flex-wrap items-center gap-y-1 text-sm text-gray-500"
        aria-label="Fil d'Ariane"
      >
        <a href="/school" className="hover:text-primary-600 hover:underline">
          Administration
        </a>
        <span className="mx-2 select-none" aria-hidden="true">
          /
        </span>
        <a href="/school/classes" className="hover:text-primary-600 hover:underline">
          Classes
        </a>
        <span className="mx-2 select-none" aria-hidden="true">
          /
        </span>
        <span className="font-medium text-gray-900">Nouvelle classe</span>
      </nav>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle classe</h1>
        <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
      </div>

      {/* Form card */}
      <div className="max-w-2xl rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
        <ClassNewForm academicYears={academicYears} />
      </div>
    </div>
  )
}
