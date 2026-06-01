import { requireParentCtx } from '../../_auth'
import { notFound } from 'next/navigation'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Présent', absent: 'Absent', late: 'Retard', excused: 'Justifié',
}
const STATUS_CLASS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700', absent: 'bg-red-100 text-red-700',
  late: 'bg-amber-100 text-amber-700', excused: 'bg-sky-100 text-sky-700',
}

type Props = { params: { sessionId: string } }

export default async function ParentAttendanceSessionPage({ params }: Props) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  // Linked children — only their records are ever shown.
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parent.id)
  const childIds = (links ?? []).map((l) => (l as { student_id: string }).student_id)
  if (childIds.length === 0) notFound()

  const { data: rawSession } = await supabase
    .from('attendance_sessions')
    .select('id, session_date, notes, classes!class_id(name, section)')
    .eq('id', params.sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawSession) notFound()
  type Session = { id: string; session_date: string; notes: string | null; classes: { name: string; section: string | null } | null }
  const session = rawSession as unknown as Session

  // Records for THIS session limited to the parent's children.
  const { data: recData } = await supabase
    .from('attendance_records')
    .select('id, status, notes, student_id, students!student_id(first_name, last_name)')
    .eq('session_id', session.id)
    .eq('school_id', schoolId)
    .in('student_id', childIds)

  type Rec = { id: string; status: string; notes: string | null; student_id: string; students: { first_name: string; last_name: string } | null }
  const records = (recData ?? []) as unknown as Rec[]

  // No child in this session → not the parent's to view.
  if (records.length === 0) notFound()

  const className = session.classes
    ? [session.classes.name, session.classes.section].filter(Boolean).join(' ')
    : '—'

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/parent/attendance" className="text-primary-300 hover:text-white text-sm">← Présences</a>
        </div>
        <h1 className="text-2xl font-bold text-white capitalize">{fmtDate(session.session_date)}</h1>
        <p className="mt-0.5 text-sm text-primary-300">{className}</p>
      </div>

      <div className="space-y-3">
        {records.map((rec) => (
          <div key={rec.id} className="flex items-center justify-between rounded-xl border border-sand-200 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {rec.students ? `${rec.students.first_name} ${rec.students.last_name}` : '—'}
              </p>
              {rec.notes && <p className="mt-0.5 text-xs text-gray-400">{rec.notes}</p>}
            </div>
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[rec.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABEL[rec.status] ?? rec.status}
            </span>
          </div>
        ))}
      </div>

      {session.notes && (
        <div className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Note de séance</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{session.notes}</p>
        </div>
      )}
    </div>
  )
}
