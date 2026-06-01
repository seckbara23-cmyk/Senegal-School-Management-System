import { requireParentCtx } from '../_auth'
import { TimetableWeek, type TimetableDisplaySlot } from '@/components/TimetableWeek'

const RELATIONSHIP_LABELS: Record<string, string> = {
  father: 'Père', mother: 'Mère', guardian: 'Tuteur', other: 'Autre',
}

type SearchParams = { child?: string }
type ChildRow = {
  student_id: string
  relationship: string
  students: { id: string; first_name: string; last_name: string }
}

export default async function ParentTimetablePage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  const { data: linksData } = await supabase
    .from('parent_student_links')
    .select('student_id, relationship, students!student_id(id, first_name, last_name)')
    .eq('parent_id', parent.id)
  const links = (linksData ?? []) as unknown as ChildRow[]

  if (links.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <a href="/parent" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
          <h1 className="mt-1 text-2xl font-bold text-white">Emploi du temps</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun enfant lié</p>
        </div>
      </div>
    )
  }

  // Resolve selected child — must be one of the linked children.
  const validIds = new Set(links.map((l) => l.student_id))
  const selectedId = searchParams.child && validIds.has(searchParams.child) ? searchParams.child : links[0].student_id
  const selectedStudent = links.find((l) => l.student_id === selectedId)!.students

  // Active class enrollment for the selected child.
  const { data: enr } = await supabase
    .from('student_class_enrollments')
    .select('class_id, classes!class_id(name, section)')
    .eq('student_id', selectedId)
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
          <a href="/parent" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Emploi du temps</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          {selectedStudent.first_name} {selectedStudent.last_name}{className && ` · ${className}`}
        </p>
      </div>

      {/* Child tabs */}
      {links.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.student_id}
              href={`/parent/timetable?child=${link.student_id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                link.student_id === selectedId
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'bg-white border border-sand-200 text-gray-700 hover:bg-sand-100'
              }`}
            >
              {link.students.first_name}
              <span className="ml-1.5 text-xs font-normal opacity-60">{RELATIONSHIP_LABELS[link.relationship] ?? link.relationship}</span>
            </a>
          ))}
        </div>
      )}

      {!enrollment ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune classe active</p>
          <p className="mt-1 text-sm text-gray-400">{selectedStudent.first_name} n&apos;est inscrit dans aucune classe pour le moment.</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun créneau</p>
          <p className="mt-1 text-sm text-gray-400">L&apos;emploi du temps de cette classe n&apos;est pas encore disponible.</p>
        </div>
      ) : (
        <TimetableWeek slots={slots} todayDow={todayDow} />
      )}
    </div>
  )
}
