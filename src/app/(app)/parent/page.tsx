import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ParentPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Resolve the school membership for this user
  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('school_id, schools(id, name, slug)')
    .eq('user_id', user.id)
    .eq('role', 'parent')
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    redirect('/dashboard')
  }

  const school = memberships[0].schools as unknown as { id: string; name: string; slug: string }

  // Resolve the parent record for this user in this school.
  // This is required to filter links by the correct parent — never by school_id alone.
  const { data: parentRecord, error: parentError } = await supabase
    .from('parents')
    .select('id, first_name, last_name')
    .eq('profile_id', user.id)
    .eq('school_id', school.id)
    .single()

  if (parentError || !parentRecord) {
    // User is a parent member but has no parents record yet (e.g. admin not finished setup)
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parent Portal — {school.name}</h1>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-gray-600">
            Your parent profile is being set up. Please contact your school administrator.
          </p>
        </div>
      </div>
    )
  }

  // Fetch only this parent's linked students — never the whole school's links.
  const { data: links, error: linksError } = await supabase
    .from('parent_student_links')
    .select('id, relationship, students(id, first_name, last_name, admission_number)')
    .eq('parent_id', parentRecord.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parent Portal — {school.name}</h1>
        <p className="text-gray-600">View your children&apos;s information</p>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">My Children</h3>

        {linksError && (
          <p className="text-red-600 text-sm">Failed to load children. Please try again later.</p>
        )}

        {!linksError && links && links.length > 0 ? (
          <div className="space-y-4">
            {links.map((link) => {
              const student = link.students as unknown as {
                id: string
                first_name: string
                last_name: string
                admission_number: string
              } | null
              return (
                <div key={link.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">
                      {student?.first_name} {student?.last_name}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Admission: {student?.admission_number}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">{link.relationship}</p>
                  </div>
                  <button className="text-indigo-600 hover:text-indigo-900 text-sm">
                    View Details
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          !linksError && <p className="text-gray-600">No children linked to your account.</p>
        )}
      </div>
    </div>
  )
}
