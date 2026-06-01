import { requireStudentCtx } from '../../_auth'
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

export default async function StudentAttendanceSessionPage({ params }: Props) {
  const { supabase, schoolId, student } = await requireStudentCtx()

  const { data: rawSession } = await supabase
    .from('attendance_sessions')
    .select('id, session_date, notes, classes!class_id(name, section)')
    .eq('id', params.sessionId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!rawSession) notFound()
  type Session = { id: string; session_date: string; notes: string | null; classes: { name: string; section: string | null } | null }
  const session = rawSession as unknown as Session

  // Only the student's own record for this session.
  const { data: rawRec } = await supabase
    .from('attendance_records')
    .select('id, status, notes')
    .eq('session_id', session.id)
    .eq('school_id', schoolId)
    .eq('student_id', student.id)
    .maybeSingle()

  // No own record in this session → not the student's to view.
  if (!rawRec) notFound()
  type Rec = { id: string; status: string; notes: string | null }
  const rec = rawRec as Rec

  const className = session.classes
    ? [session.classes.name, session.classes.section].filter(Boolean).join(' ')
    : '—'

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student/attendance" className="text-primary-300 hover:text-white text-sm">← Présences</a>
        </div>
        <h1 className="text-2xl font-bold text-white capitalize">{fmtDate(session.session_date)}</h1>
        <p className="mt-0.5 text-sm text-primary-300">{className}</p>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Mon statut</p>
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${STATUS_CLASS[rec.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[rec.status] ?? rec.status}
          </span>
        </div>
        {rec.notes && (
          <p className="mt-3 border-t border-sand-100 pt-3 text-sm text-gray-600">{rec.notes}</p>
        )}
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
