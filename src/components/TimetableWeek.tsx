// Read-only weekly timetable display, shared by the teacher / student / parent
// portals. Server component (no interactivity). Each slot carries a `title`
// (subject) and an optional `subtitle` (teacher for students/parents, class for
// teachers). Today's column/section is highlighted.

export type TimetableDisplaySlot = {
  id:          string
  day_of_week: number
  start_time:  string
  end_time:    string
  room:        string | null
  title:       string
  subtitle:    string | null
}

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
]

function hhmm(t: string): string { return t.slice(0, 5) }
function dayLabel(v: number): string { return DAYS.find((d) => d.value === v)?.label ?? '' }

function SlotRow({ s }: { s: TimetableDisplaySlot }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-gray-500">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
        {s.room && <span className="rounded bg-sand-100 px-1.5 py-0.5 text-[11px] text-gray-500">{s.room}</span>}
      </div>
      <p className="mt-0.5 text-sm font-semibold text-gray-900">{s.title}</p>
      {s.subtitle && <p className="text-xs text-gray-500">{s.subtitle}</p>}
    </div>
  )
}

export function TimetableWeek({ slots, todayDow }: { slots: TimetableDisplaySlot[]; todayDow: number }) {
  const byDay = new Map<number, TimetableDisplaySlot[]>()
  for (const s of slots) {
    const list = byDay.get(s.day_of_week) ?? []
    list.push(s)
    byDay.set(s.day_of_week, list)
  }

  const todaySlots = byDay.get(todayDow) ?? []
  const visibleDays = DAYS.filter((d) => d.value <= 6 || (byDay.get(d.value)?.length ?? 0) > 0)

  return (
    <div className="space-y-6">

      {/* Today */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Aujourd&apos;hui · {dayLabel(todayDow)}
        </h2>
        {todaySlots.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-8 px-6 text-center">
            <p className="text-sm text-gray-500">Aucun cours aujourd&apos;hui.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-accent-300 bg-white shadow-sm divide-y divide-sand-100">
            {todaySlots.map((s) => <SlotRow key={s.id} s={s} />)}
          </div>
        )}
      </section>

      {/* Week grid */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Semaine</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleDays.map((day) => {
            const daySlots = byDay.get(day.value) ?? []
            const isToday = day.value === todayDow
            return (
              <div key={day.value} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${isToday ? 'border-accent-400 ring-1 ring-accent-300' : 'border-sand-200'}`}>
                <div className={`border-b px-4 py-2.5 ${isToday ? 'border-accent-200 bg-accent-50' : 'border-sand-100 bg-primary-50'}`}>
                  <h3 className={`text-sm font-bold ${isToday ? 'text-accent-800' : 'text-primary-800'}`}>
                    {day.label}{isToday && <span className="ml-1.5 text-[11px] font-medium text-accent-600">aujourd&apos;hui</span>}
                  </h3>
                </div>
                {daySlots.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-gray-400">—</p>
                ) : (
                  <div className="divide-y divide-sand-100">
                    {daySlots.map((s) => <SlotRow key={s.id} s={s} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

    </div>
  )
}
