import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Student = {
  id: string
  admission_number: string
  first_name: string
  last_name: string
  gender: string | null
  date_of_birth: string | null
  status: string
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Actif',
  inactive:  'Inactif',
  graduated: 'Diplômé',
}

const STATUS_CLASS: Record<string, string> = {
  active:    'bg-green-100 text-green-800',
  inactive:  'bg-gray-100 text-gray-600',
  graduated: 'bg-blue-100 text-blue-800',
}

const GENDER_LABEL: Record<string, string> = {
  male:   'M',
  female: 'F',
  other:  'Autre',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function StudentsPage() {
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

  const { data: students, error } = await supabase
    .from('students')
    .select('id, admission_number, first_name, last_name, gender, date_of_birth, status, created_at')
    .eq('school_id', school.id)
    .order('last_name',  { ascending: true })
    .order('first_name', { ascending: true })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="flex items-center text-sm text-gray-500 mb-1" aria-label="Fil d'Ariane">
            <a href="/school" className="hover:text-indigo-600 hover:underline">
              Administration
            </a>
            <span className="mx-2 select-none" aria-hidden="true">/</span>
            <span className="text-gray-900">Élèves</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Élèves</h1>
          <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
        </div>
        <div className="mt-1 flex items-center gap-3">
          {students && students.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
              {students.length} élève{students.length !== 1 ? 's' : ''}
            </span>
          )}
          <a
            href="/school/students/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un élève
          </a>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">
            Une erreur est survenue lors du chargement des élèves. Veuillez réessayer.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!error && (!students || students.length === 0) && (
        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
          <svg
            className="mx-auto h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">Aucun élève</h3>
          <p className="mt-1 text-sm text-gray-500">
            Aucun élève n&apos;a encore été enregistré pour cet établissement.
          </p>
        </div>
      )}

      {/* Student table */}
      {!error && students && students.length > 0 && (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nom complet
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    N° d&apos;admission
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sexe
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date de naissance
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Inscrit le
                  </th>
                  <th scope="col" className="px-6 py-3">
                    <span className="sr-only">Voir le détail</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(students as Student[]).map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={`/school/students/${student.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600 hover:underline"
                      >
                        {student.last_name} {student.first_name}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 font-mono tracking-wide">
                        {student.admission_number}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {student.gender
                          ? (GENDER_LABEL[student.gender] ?? student.gender)
                          : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {formatDate(student.date_of_birth)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_CLASS[student.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {STATUS_LABEL[student.status] ?? student.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {formatDate(student.created_at)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <a
                        href={`/school/students/${student.id}`}
                        className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                        aria-label={`Voir le dossier de ${student.last_name} ${student.first_name}`}
                      >
                        Voir →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
