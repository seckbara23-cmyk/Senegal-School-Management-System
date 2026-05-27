import { requireStudentCtx } from '../_auth'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Présent', absent: 'Absent', late: 'Retard', excused: 'Justifié',
}
const STATUS_CLASS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700', absent: 'bg-red-100 text-red-700',
  late: 'bg-amber-100 text-amber-700', excused: 'bg-sky-100 text-sky-700',
}

type AttendanceRow = {
  id: string; status: string; notes: string | null
  attendance_sessions: { session_date: string; classes: { name: string } | null } | null
}

export default async function StudentAttendancePage() {
  const { supabase, schoolId, student } = await requireStudentCtx()

  const { data: recData } = await supabase
    .from('attendance_records')
    .select('id, status, notes, attendance_sessions!session_id(session_date, classes!class_id(name))')
    .eq('student_id', student.id)
    .eq('school_id', schoolId)
    .limit(60)

  const records = (recData ?? []) as unknown as AttendanceRow[]

  records.sort((a, b) => {
    const dA = a.attendance_sessions?.session_date ?? ''
    const dB = b.attendance_sessions?.session_date ?? ''
    return dB.localeCompare(dA)
  })

  const total   = records.length
  const present = records.filter((r) => r.status === 'present').length
  const late    = records.filter((r) => r.status === 'late').length
  const absent  = records.filter((r) => r.status === 'absent').length
  const excused = records.filter((r) => r.status === 'excused').length
  const rate    = total > 0 ? Math.round(((present + late + excused) / total) * 100) : null

  return (
    <div className="space-y-6 pb-8">

      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/student" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Mes présences</h1>
        <p className="mt-0.5 text-sm text-primary-300">{student.first_name} {student.last_name}</p>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className={`text-2xl font-bold ${rate !== null ? (rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-500' : 'text-red-600') : 'text-gray-300'}`}>
              {rate ?? '—'}%
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Taux présence</p>
          </div>
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-red-600">{absent}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Absences</p>
          </div>
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{late}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Retards</p>
          </div>
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-sky-600">{excused}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Justifiés</p>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun enregistrement de présence</p>
          <p className="mt-1 text-sm text-gray-400">Les présences apparaîtront ici une fois saisies.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-primary-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Date</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Classe</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Statut</th>
                <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-200">Note</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec, idx) => (
                <tr key={rec.id} className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {rec.attendance_sessions?.session_date ? fmtDate(rec.attendance_sessions.session_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {rec.attendance_sessions?.classes?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[rec.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[rec.status] ?? rec.status}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-400 text-xs">{rec.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
