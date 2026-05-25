import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { withdrawEnrollment } from '../actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type AcademicYear = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  is_active: boolean
}

type ClassRow = {
  id: string
  name: string
  level: string | null
  section: string | null
  created_at: string
  academic_year_id: string
  academic_years: AcademicYear
}

type EnrolledStudent = {
  id: string
  enrolled_at: string
  students: {
    id: string
    first_name: string
    last_name: string
    admission_number: string
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <div className="px-5 py-3.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 sm:col-span-2 sm:mt-0 text-sm ${hasValue ? 'text-gray-900' : 'italic text-gray-400'}`}>
        {hasValue ? value : 'Non renseigné'}
      </dd>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: { classId: string } }

export default async function ClassDetailPage({ params }: Props) {
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

  // Fetch class — filter by id AND school_id to prevent cross-school access.
  const { data: rawClass } = await supabase
    .from('classes')
    .select(
      'id, name, level, section, created_at, academic_year_id, academic_years!academic_year_id(id, name, starts_on, ends_on, is_active)'
    )
    .eq('id', params.classId)
    .eq('school_id', school.id)
    .maybeSingle()

  if (!rawClass) notFound()

  const cls = rawClass as unknown as ClassRow

  // Fetch enrolled students (active enrollments only).
  const { data: rawEnrollments } = await supabase
    .from('student_class_enrollments')
    .select('id, enrolled_at, students!student_id(id, first_name, last_name, admission_number)')
    .eq('class_id', cls.id)
    .eq('school_id', school.id)
    .eq('status', 'active')
    .order('enrolled_at', { ascending: false })

  const enrollments = (rawEnrollments ?? []) as unknown as EnrolledStudent[]

  const displayName = [cls.name, cls.section].filter(Boolean).join(' — ')
  const yr = cls.academic_years

  return (
    <div className="space-y-6">

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-y-1 text-sm text-gray-500" aria-label="Fil d'Ariane">
        <a href="/school" className="hover:text-primary-600 hover:underline">Administration</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <a href="/school/classes" className="hover:text-primary-600 hover:underline">Classes</a>
        <span className="mx-2 select-none" aria-hidden="true">/</span>
        <span className="truncate max-w-[16rem] font-medium text-gray-900">{displayName}</span>
      </nav>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{school.name}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {yr.is_active && (
            <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
              Année en cours
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-sand-100 px-3 py-1 text-sm font-medium text-gray-600">
            {yr.name}
          </span>
          <a
            href={`/school/classes/${cls.id}/enroll`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter des élèves
          </a>
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Class info */}
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Informations
            </h2>
          </div>
          <dl className="divide-y divide-sand-100">
            <DetailRow label="Nom"           value={cls.name} />
            <DetailRow label="Niveau"        value={cls.level} />
            <DetailRow label="Section"       value={cls.section} />
            <DetailRow label="Année"         value={yr.name} />
            <DetailRow label="Début"         value={formatDate(yr.starts_on)} />
            <DetailRow label="Fin"           value={formatDate(yr.ends_on)} />
            <DetailRow label="Créée le"      value={formatDate(cls.created_at)} />
          </dl>
        </div>

        {/* Enrollment summary */}
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Effectif
            </h2>
          </div>
          <div className="flex items-center justify-center py-10">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary-700">{enrollments.length}</p>
              <p className="mt-1 text-sm text-gray-500">
                élève{enrollments.length !== 1 ? 's' : ''} inscrit{enrollments.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Enrolled students table */}
      {enrollments.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
          <div className="border-b border-sand-100 bg-sand-50 px-5 py-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Élèves inscrits
            </h2>
            <span className="text-xs text-gray-400">{enrollments.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-sand-100">
              <thead>
                <tr className="bg-sand-50">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Nom
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {`N° d'admission`}
                  </th>
                  <th scope="col" className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Inscrit le
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {enrollments.map((e) => (
                  <tr key={e.id} className="group hover:bg-sand-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <a
                        href={`/school/students/${e.students.id}`}
                        className="text-sm font-semibold text-gray-900 hover:text-primary-600 hover:underline"
                      >
                        {e.students.last_name} {e.students.first_name}
                      </a>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-600">
                        {e.students.admission_number}
                      </span>
                    </td>
                    <td className="hidden px-5 py-3.5 whitespace-nowrap text-sm text-gray-400 sm:table-cell">
                      {formatDate(e.enrolled_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <a
                        href={`/school/students/${e.students.id}`}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                        aria-label={`Voir le dossier de ${e.students.last_name} ${e.students.first_name}`}
                      >
                        Voir →
                      </a>
                      <form action={withdrawEnrollment} className="inline ml-4">
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <input type="hidden" name="classId" value={cls.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
                          aria-label={`Retirer ${e.students.last_name} ${e.students.first_name} de la classe`}
                        >
                          Retirer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty enrollment state */}
      {enrollments.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-white py-14 text-center">
          <p className="text-sm font-medium text-gray-900">Aucun élève inscrit</p>
          <p className="mt-1 text-sm text-gray-500">
            Cette classe n&apos;a pas encore d&apos;élèves inscrits.
          </p>
          <a
            href={`/school/classes/${cls.id}/enroll`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter des élèves
          </a>
        </div>
      )}

      {/* Back link */}
      <a
        href="/school/classes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux classes
      </a>
    </div>
  )
}
