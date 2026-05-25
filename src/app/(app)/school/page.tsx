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
        <h1 className="text-2xl font-bold text-gray-900">{school.name}</h1>
        <p className="text-gray-600">Tableau de bord administrateur</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <a
          href="/school/students"
          className="bg-white shadow rounded-lg p-6 hover:shadow-md hover:ring-1 hover:ring-indigo-200 transition-all group"
        >
          <h3 className="text-lg font-medium text-gray-900 group-hover:text-indigo-700">Élèves</h3>
          <p className="text-gray-600 mt-1 text-sm">Consulter les dossiers des élèves</p>
        </a>

        <div className="bg-white shadow rounded-lg p-6 opacity-60 cursor-not-allowed">
          <h3 className="text-lg font-medium text-gray-900">Enseignants</h3>
          <p className="text-gray-600 mt-1 text-sm">Bientôt disponible</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 opacity-60 cursor-not-allowed">
          <h3 className="text-lg font-medium text-gray-900">Parents</h3>
          <p className="text-gray-600 mt-1 text-sm">Bientôt disponible</p>
        </div>
      </div>
    </div>
  )
}
