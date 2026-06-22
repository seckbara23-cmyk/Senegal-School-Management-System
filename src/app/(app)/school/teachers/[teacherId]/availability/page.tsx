import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addTeacherAvailability, removeTeacherAvailability } from './actions'

const DAYS = [
  { value: 1, label: 'Lundi' }, { value: 2, label: 'Mardi' }, { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' }, { value: 5, label: 'Vendredi' }, { value: 6, label: 'Samedi' },
]
const DAY_LABEL: Record<number, string> = Object.fromEntries(DAYS.map((d) => [d.value, d.label]))

const FEEDBACK: Record<string, { ok: boolean; msg: string }> = {
  added:    { ok: true,  msg: 'Créneau de disponibilité ajouté.' },
  removed:  { ok: true,  msg: 'Créneau retiré.' },
  invalid:  { ok: false, msg: 'Saisie invalide.' },
  order:    { ok: false, msg: "L'heure de fin doit être après l'heure de début." },
  readonly: { ok: false, msg: 'Établissement en lecture seule.' },
  server:   { ok: false, msg: 'Une erreur est survenue. Veuillez réessayer.' },
}

function fmtTime(t: string) { return t.slice(0, 5) }

type Props = { params: { teacherId: string }; searchParams: { ok?: string; error?: string } }

export default async function TeacherAvailabilityPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('school_memberships').select('school_id')
    .eq('user_id', user.id).eq('role', 'school_admin').eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/school')
  const schoolId = (membership as { school_id: string }).school_id

  const { data: teacherData } = await supabase
    .from('teachers').select('id, first_name, last_name').eq('id', params.teacherId).eq('school_id', schoolId).maybeSingle()
  if (!teacherData) notFound()
  const teacher = teacherData as { id: string; first_name: string; last_name: string }

  const { data: rowsData } = await supabase
    .from('teacher_availability').select('id, day_of_week, start_time, end_time')
    .eq('school_id', schoolId).eq('teacher_id', teacher.id)
    .order('day_of_week').order('start_time')
  const windows = (rowsData ?? []) as { id: string; day_of_week: number; start_time: string; end_time: string }[]

  const fb = searchParams.ok ? FEEDBACK[searchParams.ok] : searchParams.error ? FEEDBACK[searchParams.error] : null
  const byDay = new Map<number, typeof windows>()
  for (const w of windows) { const l = byDay.get(w.day_of_week) ?? []; l.push(w); byDay.set(w.day_of_week, l) }

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/teachers/${teacher.id}`} className="text-primary-300 hover:text-white text-sm">← {teacher.last_name} {teacher.first_name}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Disponibilités</h1>
        <p className="text-primary-300 text-sm mt-0.5">Créneaux horaires où l&apos;enseignant peut être programmé</p>
      </div>

      {fb && (
        <div role={fb.ok ? 'status' : 'alert'} className={`rounded-lg border px-4 py-3 text-sm ${fb.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{fb.msg}</div>
      )}

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Sans créneau défini, l&apos;enseignant est considéré comme <span className="font-semibold">disponible à tout moment</span>. Ajoutez des créneaux pour restreindre les heures programmables.
      </div>

      {/* Add window */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Ajouter un créneau</p></div>
        <form action={addTeacherAvailability} className="flex flex-wrap items-end gap-3 px-5 py-4">
          <input type="hidden" name="teacher_id" value={teacher.id} />
          <div>
            <label htmlFor="day" className="block text-xs font-medium text-gray-600 mb-1">Jour</label>
            <select id="day" name="day_of_week" defaultValue="1" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600">
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="start" className="block text-xs font-medium text-gray-600 mb-1">Début</label>
            <input id="start" name="start_time" type="time" required defaultValue="08:00" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
          <div>
            <label htmlFor="end" className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
            <input id="end" name="end_time" type="time" required defaultValue="12:00" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors">Ajouter</button>
        </form>
      </div>

      {/* Windows by day */}
      <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-sand-200 bg-sand-50 px-5 py-3"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Créneaux ({windows.length})</p></div>
        {windows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-gray-500">Aucun créneau — disponible à tout moment.</p>
        ) : (
          <div className="divide-y divide-sand-100">
            {DAYS.filter((d) => byDay.has(d.value)).map((d) => (
              <div key={d.value} className="px-5 py-3">
                <p className="text-xs font-semibold text-gray-600">{DAY_LABEL[d.value]}</p>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {(byDay.get(d.value) ?? []).map((w) => (
                    <li key={w.id} className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-sm text-gray-700">
                      {fmtTime(w.start_time)} – {fmtTime(w.end_time)}
                      <form action={removeTeacherAvailability} className="inline">
                        <input type="hidden" name="availability_id" value={w.id} />
                        <input type="hidden" name="teacher_id" value={teacher.id} />
                        <button type="submit" aria-label="Retirer" className="text-red-500 hover:text-red-700">×</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
