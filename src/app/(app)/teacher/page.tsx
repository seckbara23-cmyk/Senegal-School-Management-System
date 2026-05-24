import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TeacherPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('id, school_id, schools(id, name, slug)')
    .eq('user_id', user.id)
    .eq('role', 'teacher')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    redirect('/dashboard')
  }

  const school = memberships[0].schools as unknown as { id: string; name: string; slug: string }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard — {school.name}</h1>
        <p className="text-gray-600">Manage your classes and students</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900">My Classes</h3>
          <p className="text-gray-600 mt-1">View and manage your classes</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900">Students</h3>
          <p className="text-gray-600 mt-1">View student information</p>
        </div>
      </div>
    </div>
  )
}
