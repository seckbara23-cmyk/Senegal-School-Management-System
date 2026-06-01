import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { TimetableSlotForm, type SlotInitial } from '../../_form'
import { loadTimetableFormOptions } from '../../_data'
import { updateTimetableSlot, deleteTimetableSlot } from '../../actions'

type Props = { params: { slotId: string } }

export default async function EditTimetableSlotPage({ params }: Props) {
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

  const { data: rawSlot } = await supabase
    .from('timetable_slots')
    .select('id, academic_year_id, class_id, class_subject_id, teacher_id, day_of_week, start_time, end_time, room, notes')
    .eq('id', params.slotId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawSlot) notFound()
  type Row = {
    id: string; academic_year_id: string; class_id: string; class_subject_id: string
    teacher_id: string | null; day_of_week: number; start_time: string; end_time: string
    room: string | null; notes: string | null
  }
  const slot = rawSlot as Row

  const initial: SlotInitial = {
    academic_year_id: slot.academic_year_id,
    class_id:         slot.class_id,
    class_subject_id: slot.class_subject_id,
    teacher_id:       slot.teacher_id,
    day_of_week:      slot.day_of_week,
    start_time:       slot.start_time.slice(0, 5),
    end_time:         slot.end_time.slice(0, 5),
    room:             slot.room,
    notes:            slot.notes,
  }

  const { academicYears, classes, classSubjects, teachers } = await loadTimetableFormOptions(supabase, schoolId)
  const backHref = `/school/timetable?year=${slot.academic_year_id}&class=${slot.class_id}`

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={backHref} className="text-primary-300 hover:text-white text-sm">← Emploi du temps</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Modifier le créneau</h1>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-6 py-6 shadow-sm">
        <TimetableSlotForm
          action={updateTimetableSlot}
          academicYears={academicYears}
          classes={classes}
          classSubjects={classSubjects}
          teachers={teachers}
          initial={initial}
          slotId={slot.id}
          cancelHref={backHref}
        />
      </div>

      {/* Delete */}
      <div className="flex justify-end">
        <form action={deleteTimetableSlot}>
          <input type="hidden" name="slot_id" value={slot.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Supprimer ce créneau
          </button>
        </form>
      </div>
    </div>
  )
}
