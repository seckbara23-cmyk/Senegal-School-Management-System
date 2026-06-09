import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import {
  ATTENDANCE_LABEL, ATTENDANCE_BADGE, tallyStatuses, attendanceRate, rateTone,
  RATE_TEXT_CLASS, type AttendanceStatus,
} from '@/lib/attendance'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

type RecordRow = {
  id: string
  status: string
  notes: string | null
  attendance_sessions: { session_date: string; classes: { name: string; section: string | null } | null } | null
}

type Props = { params: { studentId: string } }

export default async function StudentAttendancePage({ params }: Props) {
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

  const { data: studentData } = await supabase
    .from('students')
    .select('id, first_name, last_name, admission_number, status')
    .eq('id', params.studentId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (!studentData) notFound()
  const student = studentData as { id: string; first_name: string; last_name: string; admission_number: string; status: string }

  const { data: recData } = await supabase
    .from('attendance_records')
    .select('id, status, notes, attendance_sessions!session_id(session_date, classes!class_id(name, section))')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .limit(500)
  const records = (recData ?? []) as unknown as RecordRow[]

  // Sort by session date, most recent first (the join column isn't orderable in
  // the query, so we sort in memory — bounded to one student's history).
  records.sort((a, b) =>
    (b.attendance_sessions?.session_date ?? '').localeCompare(a.attendance_sessions?.session_date ?? ''),
  )

  const counts = tallyStatuses(records)
  const rate   = attendanceRate(counts)
  const tone   = rateTone(rate)

  const fullName = `${student.last_name} ${student.first_name}`

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href={`/school/students/${student.id}`} className="text-primary-300 hover:text-white text-sm">← {fullName}</a>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Présences — {fullName}</h1>
        <p className="text-primary-300 text-sm mt-0.5 font-mono">{student.admission_number}</p>
      </div>

      {/* Profile stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assiduité</p>
          <p className={`mt-1 text-2xl font-bold ${RATE_TEXT_CLASS[tone]}`}>{rate !== null ? `${rate}%` : '—'}</p>
          <p className="text-xs text-gray-400">{counts.total} séance{counts.total > 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Absences</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{counts.absent}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Retards</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{counts.late}</p>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Justifiés</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">{counts.excused}</p>
        </div>
      </div>

      {/* History */}
      <section className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 bg-sand-50 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">Historique des présences</h2>
        </div>
        {records.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">Aucun enregistrement de présence pour cet élève.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Classe</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                  <th className="hidden px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => {
                  const st = (r.status as AttendanceStatus)
                  const cls = r.attendance_sessions?.classes
                  return (
                    <tr key={r.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                      <td className="px-4 py-3 text-gray-900">{fmtDate(r.attendance_sessions?.session_date ?? null)}</td>
                      <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">{cls ? [cls.name, cls.section].filter(Boolean).join(' ') : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ATTENDANCE_BADGE[st] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ATTENDANCE_LABEL[st] ?? r.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-500 md:table-cell">{r.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
