import { requireStudentCtx } from '../_auth'
import { TimetableWeek, type TimetableDisplaySlot } from '@/components/TimetableWeek'
import { PrintableTimetable } from '@/components/PrintableTimetable'

export default async function StudentTimetablePage() {
  const { supabase, schoolId, student } = await requireStudentCtx()

  // Active class enrollment.
  const { data: enr } = await supabase
    .from('student_class_enrollments')
    .select('class_id, classes!class_id(name, section)')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  type Enr = { class_id: string; classes: { name: string; section: string | null } | null }
  const enrollment = enr as unknown as Enr | null

  let slots: TimetableDisplaySlot[] = []
  if (enrollment) {
    const { data } = await supabase
      .from('timetable_slots')
      .select('id, day_of_week, start_time, end_time, room, class_subjects!class_subject_id(subjects!subject_id(name)), teachers!teacher_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .eq('class_id', enrollment.class_id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    type Row = {
      id: string; day_of_week: number; start_time: string; end_time: string; room: string | null
      class_subjects: { subjects: { name: string } | null } | null
      teachers: { first_name: string; last_name: string } | null
    }
    slots = ((data ?? []) as unknown as Row[]).map((s) => ({
      id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, room: s.room,
      title: s.class_subjects?.subjects?.name ?? 'Matière',
      subtitle: s.teachers ? `${s.teachers.first_name} ${s.teachers.last_name}` : null,
    }))
  }

  const jsDay = new Date().getDay()
  const todayDow = jsDay === 0 ? 7 : jsDay
  const className = enrollment?.classes ? [enrollment.classes.name, enrollment.classes.section].filter(Boolean).join(' ') : ''

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Emploi du temps</h1>
        <p className="mt-0.5 text-sm text-primary-300">{className || `${student.first_name} ${student.last_name}`}</p>
      </div>

      {!enrollment ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune classe active</p>
          <p className="mt-1 text-sm text-gray-400">Vous n&apos;êtes inscrit dans aucune classe pour le moment.</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun créneau</p>
          <p className="mt-1 text-sm text-gray-400">L&apos;emploi du temps de votre classe n&apos;est pas encore disponible.</p>
        </div>
      ) : (
        <PrintableTimetable
          heading="Emploi du temps"
          subtitle={`${student.first_name} ${student.last_name}${className ? ` · ${className}` : ''}`}
          exportHref="/api/timetable/export/student"
        >
          <TimetableWeek slots={slots} todayDow={todayDow} />
        </PrintableTimetable>
      )}
    </div>
  )
}
