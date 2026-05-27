import { requireTeacherCtx } from '../_auth'

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-SN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

type RecordSummary = { status: string }

type SessionRow = {
  id: string
  session_date: string
  classes: { name: string; level: string | null }
  attendance_records: RecordSummary[]
}

export default async function TeacherAttendancePage() {
  const { supabase, schoolId, assignedClassSubjectIds } = await requireTeacherCtx()

  if (assignedClassSubjectIds.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          </div>
          <h1 className="text-2xl font-bold text-white">Présences</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune classe assignée</p>
          <p className="mt-1 text-sm text-gray-400">L&apos;administrateur doit vous assigner des matières.</p>
        </div>
      </div>
    )
  }

  // Resolve class_ids from assigned class_subjects
  const { data: csData } = await supabase
    .from('class_subjects')
    .select('class_id')
    .in('id', assignedClassSubjectIds)
    .eq('school_id', schoolId)

  const classIds = Array.from(new Set(((csData ?? []) as { class_id: string }[]).map((r) => r.class_id)))

  if (classIds.length === 0) {
    return (
      <div className="space-y-6 pb-8">
        <div className="rounded-xl bg-primary-800 px-6 py-5">
          <div className="mb-1">
            <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
          </div>
          <h1 className="text-2xl font-bold text-white">Présences</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune séance enregistrée</p>
          <p className="mt-1 text-sm text-gray-400">Les séances apparaîtront ici une fois créées.</p>
        </div>
      </div>
    )
  }

  // Fetch attendance sessions for assigned classes
  const { data: sessionData } = await supabase
    .from('attendance_sessions')
    .select('id, session_date, classes!class_id(name, level), attendance_records!session_id(status)')
    .in('class_id', classIds)
    .eq('school_id', schoolId)
    .order('session_date', { ascending: false })
    .limit(60)

  const sessions = (sessionData ?? []) as unknown as SessionRow[]

  // Aggregate stats across all sessions
  const totalSessions = sessions.length
  let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalExcused = 0
  for (const s of sessions) {
    for (const r of s.attendance_records) {
      if (r.status === 'present') totalPresent++
      else if (r.status === 'absent') totalAbsent++
      else if (r.status === 'late') totalLate++
      else if (r.status === 'excused') totalExcused++
    }
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/teacher" className="text-primary-300 hover:text-white text-sm">← Tableau de bord</a>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Présences</h1>
            <p className="mt-0.5 text-sm text-primary-300">
              {totalSessions} séance{totalSessions !== 1 ? 's' : ''} · {classIds.length} classe{classIds.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a
            href="/teacher/attendance/new"
            className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors"
          >
            + Nouvelle séance
          </a>
        </div>
      </div>

      {/* ── Summary strip ───────────────────────────────────────────────────── */}
      {totalSessions > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{totalPresent}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Présences</p>
          </div>
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-red-600">{totalAbsent}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Absences</p>
          </div>
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{totalLate}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Retards</p>
          </div>
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-sky-600">{totalExcused}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-0.5">Justifiés</p>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-12 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucune séance enregistrée</p>
          <p className="mt-1 text-sm text-gray-400">
            Commencez par créer une nouvelle séance.
          </p>
          <a
            href="/teacher/attendance/new"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            + Nouvelle séance
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sand-200 shadow-sm">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Registre de présences
            </p>
            <p className="text-xs text-gray-400">{totalSessions} séance{totalSessions !== 1 ? 's' : ''}</p>
          </div>
          <div className="divide-y divide-sand-100">
            {sessions.map((session, idx) => {
              const records = session.attendance_records
              const present = records.filter((r) => r.status === 'present').length
              const absent  = records.filter((r) => r.status === 'absent').length
              const late    = records.filter((r) => r.status === 'late').length
              const total   = records.length
              const rate    = total > 0 ? Math.round(((present + late) / total) * 100) : null
              const cl      = session.classes as unknown as { name: string; level: string | null }

              return (
                <a
                  key={session.id}
                  href={`/teacher/attendance/${session.id}`}
                  className={`flex items-center gap-4 px-5 py-4 hover:bg-primary-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  {/* Date + class */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 capitalize">
                      {fmtDate(session.session_date)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cl.name}{cl.level && ` (${cl.level})`}
                    </p>
                  </div>

                  {/* Status pills */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {present > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {present} ✓
                      </span>
                    )}
                    {absent > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {absent} ✗
                      </span>
                    )}
                    {late > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {late} ↷
                      </span>
                    )}
                  </div>

                  {/* Attendance rate */}
                  {rate !== null && (
                    <div className="text-right shrink-0 w-12">
                      <p className={`text-sm font-bold ${rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-500' : 'text-red-600'}`}>
                        {rate}%
                      </p>
                    </div>
                  )}

                  <span className="text-gray-300 shrink-0">→</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
