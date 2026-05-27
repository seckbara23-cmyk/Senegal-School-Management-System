import { requireParentCtx } from '../_auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-SN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Présent',
  absent:  'Absent',
  late:    'Retard',
  excused: 'Justifié',
}

const STATUS_CLASS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent:  'bg-red-100 text-red-700',
  late:    'bg-amber-100 text-amber-700',
  excused: 'bg-sky-100 text-sky-700',
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  father:   'Père',
  mother:   'Mère',
  guardian: 'Tuteur',
  other:    'Autre',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchParams = { child?: string }

type ChildRow = {
  student_id: string
  relationship: string
  students: { id: string; first_name: string; last_name: string }
}

type AttendanceRow = {
  id: string
  status: string
  notes: string | null
  attendance_sessions: {
    session_date: string
    classes: { name: string } | null
  } | null
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { supabase, schoolId, parent } = await requireParentCtx()

  // Get linked children — security: child list always comes from DB, never from URL alone
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
          <h1 className="mt-1 text-2xl font-bold text-white">Présences</h1>
        </div>
        <div className="rounded-xl border-2 border-dashed border-sand-300 bg-sand-50 py-16 px-6 text-center">
          <p className="text-base font-semibold text-gray-700">Aucun enfant lié</p>
        </div>
      </div>
    )
  }

  // Resolve selected child — must be in linked children, never trust URL alone
  const validIds = new Set(links.map((l) => l.student_id))
  const selectedId =
    searchParams.child && validIds.has(searchParams.child)
      ? searchParams.child
      : links[0].student_id

  const selectedLink = links.find((l) => l.student_id === selectedId)!
  const selectedStudent = selectedLink.students

  // Fetch attendance records for selected child
  const { data: recData } = await supabase
    .from('attendance_records')
    .select('id, status, notes, attendance_sessions!session_id(session_date, classes!class_id(name))')
    .eq('student_id', selectedId)
    .eq('school_id', schoolId)
    .limit(60)

  const records = (recData ?? []) as unknown as AttendanceRow[]

  // Sort by session_date descending in JS (Supabase nested ordering is unreliable)
  records.sort((a, b) => {
    const dA = a.attendance_sessions?.session_date ?? ''
    const dB = b.attendance_sessions?.session_date ?? ''
    return dB.localeCompare(dA)
  })

  // Stats
  const total   = records.length
  const present = records.filter((r) => r.status === 'present').length
  const late    = records.filter((r) => r.status === 'late').length
  const absent  = records.filter((r) => r.status === 'absent').length
  const excused = records.filter((r) => r.status === 'excused').length
  const rateNum = total > 0 ? Math.round(((present + late + excused) / total) * 100) : null

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-primary-800 px-6 py-5">
        <div className="mb-1">
          <a href="/parent" className="text-primary-300 hover:text-white text-sm">← Accueil</a>
        </div>
        <h1 className="text-2xl font-bold text-white">Présences</h1>
        <p className="mt-0.5 text-sm text-primary-300">
          {selectedStudent.first_name} {selectedStudent.last_name}
        </p>
      </div>

      {/* ── Child tabs (multi-child) ─────────────────────────────────────────── */}
      {links.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.student_id}
              href={`/parent/attendance?child=${link.student_id}`}
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

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-sand-200 shadow-sm px-4 py-4 text-center">
            <p className="text-2xl font-bold text-primary-700">{rateNum ?? '—'}%</p>
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

      {/* ── Records table ────────────────────────────────────────────────────── */}
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
                <tr
                  key={rec.id}
                  className={`border-b border-sand-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-sand-50'}`}
                >
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {rec.attendance_sessions?.session_date
                      ? fmtDate(rec.attendance_sessions.session_date)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {rec.attendance_sessions?.classes?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[rec.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[rec.status] ?? rec.status}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-400 text-xs">
                    {rec.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
