import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SchoolAdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('id, school_id, schools(id, name, slug)')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    redirect('/dashboard')
  }

  const school = memberships[0].schools as unknown as { id: string; name: string; slug: string }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{school.name} — Admin Dashboard</h1>
        <p className="text-gray-600">Manage your school</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900">Students</h3>
          <p className="text-gray-600 mt-1">Manage student records</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900">Teachers</h3>
          <p className="text-gray-600 mt-1">Manage teaching staff</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900">Parents</h3>
          <p className="text-gray-600 mt-1">Manage parent accounts</p>
        </div>
      </div>
    </div>
  )
}
