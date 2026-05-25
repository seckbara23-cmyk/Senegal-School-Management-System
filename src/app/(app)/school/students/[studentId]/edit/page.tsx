import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { StudentEditForm } from './_form'

type Props = { params: { studentId: string } }

export default async function EditStudentPage({ params }: Props) {
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

  // Fetch by id AND school_id — prevents cross-school access.
  const { data: student } = await supabase
    .from('students')
    .select(
      'id, first_name, last_name, admission_number, gender, date_of_birth, status'
    )
    .eq('id', params.studentId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!student) notFound()

  const fullName = `${student.last_name} ${student.first_name}`

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
        <a
          href={`/school/students/${student.id}`}
          className="truncate max-w-[14rem] hover:text-primary-600 hover:underline"
        >
          {fullName}
        </a>
        <span className="mx-2 select-none" aria-hidden="true">
          /
        </span>
        <span className="font-medium text-gray-900">Modifier</span>
      </nav>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modifier le dossier</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {fullName} — {school.name}
        </p>
      </div>

      {/* Form card */}
      <div className="max-w-2xl rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
        <StudentEditForm student={student} />
      </div>
    </div>
  )
}
