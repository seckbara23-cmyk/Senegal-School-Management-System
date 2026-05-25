import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AttendanceForm, type EnrolledStudent } from './_form'

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassOption = {
  id: string
  name: string
  section: string | null
  academic_years: { name: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classLabel(c: ClassOption): string {
  const parts = [c.name, c.section].filter(Boolean).join(' — ')
  return `${parts} (${c.academic_years.name})`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  searchParams: { classId?: string | string[]; date?: string | string[] }
}

export default async function NewAttendancePage({ searchParams }: Props) {
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

  // ── Fetch all classes for this school ────────────────────────────────────
  const { data: rawClasses } = await supabase
    .from('classes')
    .select('id, name, section, academic_years!academic_year_id(name)')
    .eq('school_id', school.id)
    .order('name')

  const classes = (rawClasses ?? []) as unknown as ClassOption[]

  // ── Parse step-1 params ──────────────────────────────────────────────────
  const rawClassId = Array.isArray(searchParams.classId)
    ? searchParams.classId[0]
    : searchParams.classId
  const rawDate = Array.isArray(searchParams.date)
    ? searchParams.date[0]
    : searchParams.date

  const selectedClassId = rawClassId?.trim() ?? ''
  const selectedDate    = rawDate?.trim() ?? ''

  const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)

  // ── Step 2: both params present — resolve students ───────────────────────
  let enrolledStudents: EnrolledStudent[] | null = null
  let selectionError: string | null = null

  if (selectedClassId && isDateValid) {
    // Verify class belongs to this school
    const { data: cls } = await supabase
      .from('classes')
      .select('id')
      .eq('id', selectedClassId)
      .eq('school_id', school.id)
      .maybeSingle()

    if (!cls) {
      selectionError = 'Classe introuvable pour cet établissement.'
    } else {
      // Check if a session already exists for this class+date
      const { data: existing } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('class_id', selectedClassId)
        .eq('session_date', selectedDate)
        .eq('school_id', school.id)
        .maybeSingle()

      if (existing) {
        redirect(`/school/attendance/${existing.id}`)
      }

      // Fetch enrolled students
      const { data: enrollments } = await supabase
        .from('student_class_enrollments')
        .select('students!student_id(id, first_name, last_name, admission_number)')
        .eq('class_id', selectedClassId)
        .eq('school_id', school.id)
        .eq('status', 'active')

      enrolledStudents = (enrollments ?? []).map(
        (e) => (e as unknown as { students: EnrolledStudent }).students
      )
    }
  }

  const cancelHref = '/school/attendance'

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <nav className="flex items-center text-sm text-gray-500 mb-1" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-primary-600 hover:underline">
            Administration
          </a>
          <span className="mx-2 select-none" aria-hidden="true">/</span>
          <a href="/school/attendance" className="hover:text-primary-600 hover:underline">
            Présences
          </a>
          <span className="mx-2 select-none" aria-hidden="true">/</span>
          <span className="font-medium text-gray-900">Nouvelle séance</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle séance de présences</h1>
        <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
      </div>

      {/* ── Step 1 card: class + date ────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          1. Choisir la classe et la date
        </h2>

        {classes.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-700">
              Aucune classe n&apos;a été créée. Veuillez d&apos;abord{' '}
              <a href="/school/classes/new" className="underline hover:text-amber-900">
                créer une classe
              </a>{' '}
              et y inscrire des élèves.
            </p>
          </div>
        ) : (
          <form method="GET" action="/school/attendance/new" className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="classId" className="block text-sm font-medium text-gray-700 mb-1">
                Classe
              </label>
              <select
                id="classId"
                name="classId"
                defaultValue={selectedClassId}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                required
              >
                <option value="">— Sélectionner une classe —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[160px]">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                Date de la séance
              </label>
              <input
                id="date"
                type="date"
                name="date"
                defaultValue={selectedDate}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                required
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
            >
              Charger les élèves
            </button>
          </form>
        )}
      </div>

      {/* ── Selection error ──────────────────────────────────────────────────── */}
      {selectionError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{selectionError}</p>
        </div>
      )}

      {/* ── Step 2: no students enrolled ────────────────────────────────────── */}
      {enrolledStudents !== null && enrolledStudents.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">
            Aucun élève actif inscrit dans cette classe. Veuillez{' '}
            <a
              href={`/school/classes/${selectedClassId}/enroll`}
              className="underline hover:text-amber-900"
            >
              inscrire des élèves
            </a>{' '}
            avant de saisir les présences.
          </p>
        </div>
      )}

      {/* ── Step 2: attendance form ──────────────────────────────────────────── */}
      {enrolledStudents !== null && enrolledStudents.length > 0 && (
        <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            2. Saisir les présences{' '}
            <span className="text-sm font-normal text-gray-400">
              ({enrolledStudents.length} élève{enrolledStudents.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <AttendanceForm
            students={enrolledStudents}
            classId={selectedClassId}
            sessionDate={selectedDate}
            cancelHref={cancelHref}
          />
        </div>
      )}
    </div>
  )
}
