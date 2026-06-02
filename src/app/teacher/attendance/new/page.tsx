import { requireTeacherCtx } from '../../_auth'
import { redirect } from 'next/navigation'
import { TeacherAttendanceForm, type EnrolledStudent } from '../_form'

type AssignedClass = {
  id:       string
  name:     string
  section:  string | null
  academic_years: { name: string }
}

function classLabel(c: AssignedClass): string {
  return [c.name, c.section].filter(Boolean).join(' — ') + ` (${c.academic_years.name})`
}

function formatSessionDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })
}

type Props = {
  searchParams: { classId?: string | string[]; date?: string | string[] }
}

export default async function TeacherNewAttendancePage({ searchParams }: Props) {
  const { supabase, schoolId, assignedClassSubjectIds, teacher } = await requireTeacherCtx()

  // ── Resolve assigned classes ────────────────────────────────────────────────
  let assignedClasses: AssignedClass[] = []
  if (assignedClassSubjectIds.length > 0) {
    const { data: csData } = await supabase
      .from('class_subjects')
      .select('class_id, classes!class_id(id, name, section, academic_years!academic_year_id(name))')
      .in('id', assignedClassSubjectIds)
      .eq('school_id', schoolId)

    // Deduplicate by class_id
    const seen = new Set<string>()
    for (const row of (csData ?? []) as unknown as { class_id: string; classes: AssignedClass }[]) {
      if (!seen.has(row.class_id)) {
        seen.add(row.class_id)
        assignedClasses.push({ ...row.classes, id: row.class_id })
      }
    }
    assignedClasses.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }

  const rawClassId = Array.isArray(searchParams.classId)
    ? searchParams.classId[0]
    : searchParams.classId
  const rawDate = Array.isArray(searchParams.date)
    ? searchParams.date[0]
    : searchParams.date

  const selectedClassId = rawClassId?.trim() ?? ''
  const selectedDate    = rawDate?.trim() ?? ''
  const isDateValid     = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)

  const selectedClass = assignedClasses.find((c) => c.id === selectedClassId)

  let enrolledStudents: EnrolledStudent[] | null = null
  let selectionError: string | null = null

  if (selectedClassId && isDateValid) {
    // Verify class is in teacher's assigned set
    const isAssigned = assignedClasses.some((c) => c.id === selectedClassId)
    if (!isAssigned) {
      selectionError = 'Vous n\'êtes pas assigné à cette classe.'
    } else {
      // Redirect if session already exists for this class+date
      const { data: existing } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('class_id', selectedClassId)
        .eq('session_date', selectedDate)
        .eq('school_id', schoolId)
        .maybeSingle()

      if (existing) redirect(`/teacher/attendance/${existing.id}`)

      const { data: enrollments } = await supabase
        .from('student_class_enrollments')
        .select('students!student_id(id, first_name, last_name, admission_number)')
        .eq('class_id', selectedClassId)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('students(last_name)', { ascending: true })

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
    <div className="space-y-5 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher/attendance" className="text-primary-300 hover:text-white text-sm">
            ← Présences
          </a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Nouvelle séance</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          Sélectionnez une classe et une date
        </p>
      </div>

      {/* ── Step 1: class + date ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sand-200 bg-sand-50 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-1">
          Étape 1
        </p>
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Classe et date
        </h2>

        {assignedClasses.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Aucune classe assignée. L&apos;administrateur doit vous assigner des matières avant de pouvoir saisir les présences.
            </p>
          </div>
        ) : (
          <form method="GET" action="/teacher/attendance/new" className="flex flex-wrap items-end gap-4">
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
                {assignedClasses.map((c) => (
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
            Aucun élève actif dans cette classe. L&apos;administrateur doit inscrire des élèves avant de saisir les présences.
          </p>
        </div>
      )}

      {/* ── Step 2: register sheet ───────────────────────────────────────────── */}
      {enrolledStudents !== null && enrolledStudents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">

          {/* Register header */}
          <div className="bg-primary-700 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-300 mb-1">
              Étape 2 — Liste de présence
            </p>
            <p className="text-lg font-bold text-white capitalize">
              {registerDate}
            </p>
            <p className="text-sm text-primary-200 mt-1">
              {registerClassLabel}
              {' · '}
              <span className="font-medium text-white">
                {enrolledStudents.length} élève{enrolledStudents.length !== 1 ? 's' : ''}
              </span>
            </p>
          </div>

          {/* Form body */}
          <div className="bg-white px-6 py-5">
            <TeacherAttendanceForm
              students={enrolledStudents}
              classId={selectedClassId}
              sessionDate={selectedDate}
              cancelHref="/teacher/attendance"
              teacherId={teacher.id}
            />
          </div>
        </div>
      )}

    </div>
  )
}
