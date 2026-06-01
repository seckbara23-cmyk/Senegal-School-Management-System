import { requireTeacherCtx } from '../_auth'
import { TimetableWeek, type TimetableDisplaySlot } from '@/components/TimetableWeek'

export default async function TeacherTimetablePage() {
  const { supabase, schoolId, teacher } = await requireTeacherCtx()

  const { data } = await supabase
    .from('timetable_slots')
    .select('id, day_of_week, start_time, end_time, room, class_subjects!class_subject_id(subjects!subject_id(name)), classes!class_id(name, section)')
    .eq('school_id', schoolId)
    .eq('teacher_id', teacher.id)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  type Row = {
    id: string; day_of_week: number; start_time: string; end_time: string; room: string | null
    class_subjects: { subjects: { name: string } | null } | null
    classes: { name: string; section: string | null } | null
  }
  const slots: TimetableDisplaySlot[] = ((data ?? []) as unknown as Row[]).map((s) => ({
    id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, room: s.room,
    title: s.class_subjects?.subjects?.name ?? 'Matière',
    subtitle: s.classes ? [s.classes.name, s.classes.section].filter(Boolean).join(' ') : null,
  }))

  const jsDay = new Date().getDay()
  const todayDow = jsDay === 0 ? 7 : jsDay

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Mon emploi du temps</h1>
        <p className="mt-0.5 text-sm text-primary-300">{teacher.first_name} {teacher.last_name}</p>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun cours programmé</p>
          <p className="mt-1 text-sm text-gray-400">Votre emploi du temps apparaîtra ici une fois établi par l&apos;administration.</p>
        </div>
      ) : (
        <TimetableWeek slots={slots} todayDow={todayDow} />
      )}
    </div>
  )
}
