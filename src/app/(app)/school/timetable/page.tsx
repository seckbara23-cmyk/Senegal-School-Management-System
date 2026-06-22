import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PrintableTimetable } from '@/components/PrintableTimetable'

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
]

const ERROR_MESSAGES: Record<string, string> = {
  readonly: 'Cet établissement est en lecture seule. Les modifications sont désactivées.',
  delete:   'Erreur lors de la suppression du créneau. Veuillez réessayer.',
}

function hhmm(t: string): string { return t.slice(0, 5) }

function classLabel(c: { name: string; section: string | null }): string {
  return [c.name, c.section].filter(Boolean).join(' ')
}

type SlotRow = {
  id: string; day_of_week: number; start_time: string; end_time: string; room: string | null
  class_subjects: { subjects: { name: string } | null } | null
  classes: { name: string; section: string | null } | null
  teachers: { first_name: string; last_name: string } | null
}

const SLOT_SELECT =
  'id, day_of_week, start_time, end_time, room, ' +
  'class_subjects!class_subject_id(subjects!subject_id(name)), ' +
  'classes!class_id(name, section), ' +
  'teachers!teacher_id(first_name, last_name)'

type Props = { searchParams: { year?: string; class?: string; teacher?: string; view?: string; error?: string; generated?: string } }

export default async function TimetablePage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('school_memberships')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const view: 'class' | 'teacher' = searchParams.view === 'teacher' ? 'teacher' : 'class'

  const [yearsRes, classesRes, teachersRes] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active, starts_on').eq('school_id', schoolId).order('starts_on', { ascending: false }),
    supabase.from('classes').select('id, name, section, academic_year_id').eq('school_id', schoolId).order('name'),
    supabase.from('teachers').select('id, first_name, last_name').eq('school_id', schoolId).order('last_name'),
  ])
  type YearRow    = { id: string; name: string; is_active: boolean }
  type ClassRow   = { id: string; name: string; section: string | null; academic_year_id: string }
  type TeacherRow = { id: string; first_name: string; last_name: string }
  const years    = (yearsRes.data ?? []) as YearRow[]
  const classes  = (classesRes.data ?? []) as ClassRow[]
  const teachers = (teachersRes.data ?? []) as TeacherRow[]

  // Resolve selected year: param if valid, else the active year, else the first.
  const yearIds = new Set(years.map((y) => y.id))
  const selectedYear =
    (searchParams.year && yearIds.has(searchParams.year)) ? searchParams.year
    : (years.find((y) => y.is_active)?.id ?? years[0]?.id ?? '')

  const yearClasses = classes.filter((c) => c.academic_year_id === selectedYear)
  const classIds = new Set(yearClasses.map((c) => c.id))
  const selectedClass = (searchParams.class && classIds.has(searchParams.class)) ? searchParams.class : ''
  const selectedClassRow = yearClasses.find((c) => c.id === selectedClass) ?? null

  const teacherIds = new Set(teachers.map((t) => t.id))
  const selectedTeacher = (searchParams.teacher && teacherIds.has(searchParams.teacher)) ? searchParams.teacher : ''
  const selectedTeacherRow = teachers.find((t) => t.id === selectedTeacher) ?? null

  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''
  const genCount = searchParams.generated !== undefined ? Number(searchParams.generated) : null
  const generatedMsg = genCount !== null && Number.isFinite(genCount)
    ? (genCount > 0
        ? `${genCount} créneau${genCount > 1 ? 'x' : ''} généré${genCount > 1 ? 's' : ''} et enregistré${genCount > 1 ? 's' : ''}.`
        : 'Aucun créneau à générer (volumes horaires déjà couverts ou non définis).')
    : ''

  // Fetch slots for the current selection.
  let slots: SlotRow[] = []
  if (view === 'class' && selectedClass) {
    const { data } = await supabase
      .from('timetable_slots')
      .select(SLOT_SELECT)
      .eq('school_id', schoolId)
      .eq('class_id', selectedClass)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })
    slots = (data ?? []) as unknown as SlotRow[]
  } else if (view === 'teacher' && selectedTeacher && selectedYear) {
    const { data } = await supabase
      .from('timetable_slots')
      .select(SLOT_SELECT)
      .eq('school_id', schoolId)
      .eq('academic_year_id', selectedYear)
      .eq('teacher_id', selectedTeacher)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })
    slots = (data ?? []) as unknown as SlotRow[]
  }

  const slotsByDay = new Map<number, SlotRow[]>()
  for (const s of slots) {
    const list = slotsByDay.get(s.day_of_week) ?? []
    list.push(s)
    slotsByDay.set(s.day_of_week, list)
  }
  // Show Mon–Sat always; add Sunday only if it has slots.
  const visibleDays = DAYS.filter((d) => d.value <= 6 || (slotsByDay.get(d.value)?.length ?? 0) > 0)

  const subtitle =
    view === 'class'
      ? (selectedClassRow ? classLabel(selectedClassRow) : 'Sélectionnez une classe')
      : (selectedTeacherRow ? `${selectedTeacherRow.first_name} ${selectedTeacherRow.last_name}` : 'Sélectionnez un enseignant')

  // Tab links preserve the selected year (and the relevant selection).
  const classTabHref   = `/school/timetable?year=${selectedYear}${selectedClass ? `&class=${selectedClass}` : ''}`
  const teacherTabHref = `/school/timetable?view=teacher&year=${selectedYear}${selectedTeacher ? `&teacher=${selectedTeacher}` : ''}`

  const tabBase = 'rounded-lg px-4 py-2 text-sm font-semibold transition-colors'
  const tabOn   = 'bg-primary-600 text-white shadow-sm'
  const tabOff  = 'border border-sand-300 bg-white text-gray-700 hover:bg-sand-50'

  // Which empty state (if any) applies.
  const noData =
    view === 'class'
      ? (years.length === 0 || yearClasses.length === 0)
      : (teachers.length === 0)
  const noSelection = view === 'class' ? !selectedClass : !selectedTeacher

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Emploi du temps</h1>
            <p className="text-primary-300 text-sm mt-0.5">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/school/timetable/generate${searchParams.year ? `?year=${searchParams.year}` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Générer
            </a>
            <a
              href="/school/timetable/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
            >
              + Nouveau créneau
            </a>
          </div>
        </div>
      </div>

      {generatedMsg && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">{generatedMsg}</p>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* View tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Mode d'affichage">
        <a href={classTabHref}   role="tab" aria-selected={view === 'class'}   className={`${tabBase} ${view === 'class' ? tabOn : tabOff}`}>Par classe</a>
        <a href={teacherTabHref} role="tab" aria-selected={view === 'teacher'} className={`${tabBase} ${view === 'teacher' ? tabOn : tabOff}`}>Par enseignant</a>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <input type="hidden" name="view" value={view} />
        <div>
          <label htmlFor="year" className="block text-xs font-medium text-gray-600 mb-1">Année scolaire</label>
          <select id="year" name="year" defaultValue={selectedYear} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>

        {view === 'class' ? (
          <div className="min-w-[200px]">
            <label htmlFor="class" className="block text-xs font-medium text-gray-600 mb-1">Classe</label>
            <select id="class" name="class" defaultValue={selectedClass} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Choisir une classe —</option>
              {yearClasses.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </select>
          </div>
        ) : (
          <div className="min-w-[220px]">
            <label htmlFor="teacher" className="block text-xs font-medium text-gray-600 mb-1">Enseignant</label>
            <select id="teacher" name="teacher" defaultValue={selectedTeacher} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Choisir un enseignant —</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.last_name} {t.first_name}</option>)}
            </select>
          </div>
        )}

        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Afficher</button>
      </form>

      {/* Content */}
      {noData ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">
            {view === 'class' ? 'Aucune classe pour cette année' : 'Aucun enseignant'}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {view === 'class'
              ? "Créez des classes et des matières avant de programmer l'emploi du temps."
              : 'Ajoutez des enseignants pour consulter leur emploi du temps.'}
          </p>
        </div>
      ) : noSelection ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">
            {view === 'class' ? 'Sélectionnez une classe' : 'Sélectionnez un enseignant'}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {view === 'class'
              ? 'Choisissez une classe ci-dessus pour afficher son emploi du temps.'
              : 'Choisissez un enseignant ci-dessus pour afficher son emploi du temps.'}
          </p>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun créneau</p>
          <p className="mt-1 text-sm text-gray-400">
            {view === 'class'
              ? "Cette classe n'a pas encore d'emploi du temps."
              : "Cet enseignant n'a aucun cours sur cette année."}
          </p>
          {view === 'class' && (
            <a href="/school/timetable/new" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
              Créer un créneau
            </a>
          )}
        </div>
      ) : (
        <PrintableTimetable
          heading="Emploi du temps"
          subtitle={subtitle}
          exportHref={view === 'class' ? `/api/timetable/export/class?class=${selectedClass}` : undefined}
        >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleDays.map((day) => {
            const daySlots = slotsByDay.get(day.value) ?? []
            return (
              <div key={day.value} className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
                <div className="border-b border-sand-100 bg-primary-50 px-4 py-2.5">
                  <h2 className="text-sm font-bold text-primary-800">{day.label}</h2>
                </div>
                {daySlots.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-gray-400">—</p>
                ) : (
                  <ul className="divide-y divide-sand-100">
                    {daySlots.map((s) => {
                      // Class view → show the teacher; teacher view → show the class.
                      const secondary =
                        view === 'class'
                          ? (s.teachers ? `${s.teachers.first_name} ${s.teachers.last_name}` : 'Sans enseignant')
                          : (s.classes ? classLabel(s.classes) : 'Classe')
                      return (
                        <li key={s.id}>
                          <a href={`/school/timetable/${s.id}/edit`} className="block px-4 py-3 hover:bg-accent-50 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs text-gray-500">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                              {s.room && <span className="rounded bg-sand-100 px-1.5 py-0.5 text-[11px] text-gray-500">{s.room}</span>}
                            </div>
                            <p className="mt-0.5 text-sm font-semibold text-gray-900">{s.class_subjects?.subjects?.name ?? 'Matière'}</p>
                            <p className="text-xs text-gray-500">{secondary}</p>
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        </PrintableTimetable>
      )}
    </div>
  )
}
