import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

type Props = { searchParams: { year?: string; class?: string; error?: string } }

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
    .maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const [yearsRes, classesRes] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_active, starts_on').eq('school_id', schoolId).order('starts_on', { ascending: false }),
    supabase.from('classes').select('id, name, section, academic_year_id').eq('school_id', schoolId).order('name'),
  ])
  type YearRow  = { id: string; name: string; is_active: boolean }
  type ClassRow = { id: string; name: string; section: string | null; academic_year_id: string }
  const years   = (yearsRes.data ?? []) as YearRow[]
  const classes = (classesRes.data ?? []) as ClassRow[]

  // Resolve selected year: param if valid, else the active year, else the first.
  const yearIds = new Set(years.map((y) => y.id))
  const selectedYear =
    (searchParams.year && yearIds.has(searchParams.year)) ? searchParams.year
    : (years.find((y) => y.is_active)?.id ?? years[0]?.id ?? '')

  const yearClasses = classes.filter((c) => c.academic_year_id === selectedYear)
  const classIds = new Set(yearClasses.map((c) => c.id))
  const selectedClass = (searchParams.class && classIds.has(searchParams.class)) ? searchParams.class : ''
  const selectedClassRow = yearClasses.find((c) => c.id === selectedClass) ?? null

  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? '') : ''

  // Fetch slots for the selected class.
  type SlotRow = {
    id: string; day_of_week: number; start_time: string; end_time: string; room: string | null
    class_subjects: { subjects: { name: string } | null } | null
    teachers: { first_name: string; last_name: string } | null
  }
  let slots: SlotRow[] = []
  if (selectedClass) {
    const { data } = await supabase
      .from('timetable_slots')
      .select('id, day_of_week, start_time, end_time, room, class_subjects!class_subject_id(subjects!subject_id(name)), teachers!teacher_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .eq('class_id', selectedClass)
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

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Emploi du temps</h1>
            <p className="text-primary-300 text-sm mt-0.5">
              {selectedClassRow ? [selectedClassRow.name, selectedClassRow.section].filter(Boolean).join(' ') : 'Sélectionnez une classe'}
            </p>
          </div>
          <a
            href="/school/timetable/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-accent-400 transition-colors shadow-sm"
          >
            + Nouveau créneau
          </a>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div>
          <label htmlFor="year" className="block text-xs font-medium text-gray-600 mb-1">Année scolaire</label>
          <select id="year" name="year" defaultValue={selectedYear} className="block rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label htmlFor="class" className="block text-xs font-medium text-gray-600 mb-1">Classe</label>
          <select id="class" name="class" defaultValue={selectedClass} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
            <option value="">— Toutes les classes —</option>
            {yearClasses.map((c) => <option key={c.id} value={c.id}>{[c.name, c.section].filter(Boolean).join(' ')}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">Afficher</button>
      </form>

      {/* Content */}
      {years.length === 0 || yearClasses.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune classe pour cette année</p>
          <p className="mt-1 text-sm text-gray-400">Créez des classes et des matières avant de programmer l&apos;emploi du temps.</p>
        </div>
      ) : !selectedClass ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Sélectionnez une classe</p>
          <p className="mt-1 text-sm text-gray-400">Choisissez une classe ci-dessus pour afficher son emploi du temps.</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun créneau</p>
          <p className="mt-1 text-sm text-gray-400">Cette classe n&apos;a pas encore d&apos;emploi du temps.</p>
          <a href="/school/timetable/new" className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
            Créer un créneau
          </a>
        </div>
      ) : (
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
                    {daySlots.map((s) => (
                      <li key={s.id}>
                        <a href={`/school/timetable/${s.id}/edit`} className="block px-4 py-3 hover:bg-accent-50 transition-colors">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-gray-500">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                            {s.room && <span className="rounded bg-sand-100 px-1.5 py-0.5 text-[11px] text-gray-500">{s.room}</span>}
                          </div>
                          <p className="mt-0.5 text-sm font-semibold text-gray-900">{s.class_subjects?.subjects?.name ?? 'Matière'}</p>
                          {s.teachers && (
                            <p className="text-xs text-gray-500">{s.teachers.first_name} {s.teachers.last_name}</p>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
