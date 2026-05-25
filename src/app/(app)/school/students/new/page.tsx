import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StudentNewForm } from './_form'

export default async function NewStudentPage() {
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
        <a href="/school/students" className="hover:text-primary-600 hover:underline">
          Élèves
        </a>
        <span className="mx-2 select-none" aria-hidden="true">
          /
        </span>
        <span className="font-medium text-gray-900">Nouvel élève</span>
      </nav>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nouvel élève</h1>
        <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
      </div>

      {/* Form card */}
      <div className="max-w-2xl rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
        <StudentNewForm />
      </div>
    </div>
  )
}
