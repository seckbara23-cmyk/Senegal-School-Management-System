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
  return [c.name, c.section].filter(Boolean).join(' — ') + ` (${c.academic_years.name})`
}

function formatSessionDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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

  const { data: rawClasses } = await supabase
    .from('classes')
    .select('id, name, section, academic_years!academic_year_id(name)')
    .eq('school_id', school.id)
    .order('name')

  const classes = (rawClasses ?? []) as unknown as ClassOption[]

  const rawClassId = Array.isArray(searchParams.classId)
    ? searchParams.classId[0]
    : searchParams.classId
  const rawDate = Array.isArray(searchParams.date)
    ? searchParams.date[0]
    : searchParams.date

  const selectedClassId = rawClassId?.trim() ?? ''
  const selectedDate    = rawDate?.trim() ?? ''
  const isDateValid     = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)

  const selectedClass = classes.find((c) => c.id === selectedClassId)

  let enrolledStudents: EnrolledStudent[] | null = null
  let selectionError: string | null = null

  if (selectedClassId && isDateValid) {
    const { data: cls } = await supabase
      .from('classes')
      .select('id')
      .eq('id', selectedClassId)
      .eq('school_id', school.id)
      .maybeSingle()

    if (!cls) {
      selectionError = 'Classe introuvable pour cet établissement.'
    } else {
      const { data: existing } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('class_id', selectedClassId)
        .eq('session_date', selectedDate)
        .eq('school_id', school.id)
        .maybeSingle()

      if (existing) redirect(`/school/attendance/${existing.id}`)

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

  const registerClassLabel = selectedClass
    ? [selectedClass.name, selectedClass.section].filter(Boolean).join(' — ')
    : ''
  const registerDate = isDateValid ? formatSessionDate(selectedDate) : ''

  return (
    <div className="space-y-5">

      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <nav className="flex items-center text-sm text-primary-300 mb-3" aria-label="Fil d'Ariane">
          <a href="/school" className="hover:text-white transition-colors">
            Administration
          </a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <a href="/school/attendance" className="hover:text-white transition-colors">
            Présences
          </a>
          <span className="mx-2 text-primary-600" aria-hidden="true">/</span>
          <span className="text-white font-medium">Nouvelle séance</span>
        </nav>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Nouvelle séance de présences
        </h1>
        <p className="text-primary-300 text-sm mt-0.5">{school.name}</p>
      </div>

      {/* ── Step 1: class + date ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-sand-50 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-1">
          Étape 1
        </p>
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Sélectionner la classe et la date
        </h2>

        {classes.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Aucune classe n&apos;a été créée.{' '}
              <a href="/school/classes/new" className="font-medium underline hover:text-amber-900">
                Créer une classe
              </a>{' '}
              et y inscrire des élèves avant de saisir les présences.
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
                required
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
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
                required
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 transition-colors"
            >
              Charger la liste
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

      {/* ── No students enrolled ─────────────────────────────────────────────── */}
      {enrolledStudents !== null && enrolledStudents.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Aucun élève actif dans cette classe.{' '}
            <a
              href={`/school/classes/${selectedClassId}/enroll`}
              className="font-medium underline hover:text-amber-900"
            >
              Inscrire des élèves
            </a>{' '}
            avant de saisir les présences.
          </p>
        </div>
      )}

      {/* ── Step 2: register sheet ───────────────────────────────────────────── */}
      {enrolledStudents !== null && enrolledStudents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">

          {/* Register sheet header */}
          <div className="bg-primary-700 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-300 mb-1">
              Étape 2 — Liste de présence
            </p>
            <p className="text-lg font-bold text-white capitalize">
              {registerDate}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
              <p className="text-sm text-primary-200">
                {registerClassLabel}
                {' · '}
                <span className="font-medium text-white">
                  {enrolledStudents.length} élève{enrolledStudents.length !== 1 ? 's' : ''}
                </span>
              </p>
            </div>
          </div>

          {/* Form body */}
          <div className="bg-white px-6 py-5">
            <AttendanceForm
              students={enrolledStudents}
              classId={selectedClassId}
              sessionDate={selectedDate}
              cancelHref="/school/attendance"
            />
          </div>
        </div>
      )}
    </div>
  )
}
